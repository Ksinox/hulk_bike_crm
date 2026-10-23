/**
 * v0.8 — API модуля «Должники».
 *
 * Endpoints:
 *   GET    /api/debtors                        список с фильтрами
 *   GET    /api/debtors/today                  пакет данных для экрана «Утро»
 *   GET    /api/debtors/dashboard-stats        виджет на главном дашборде
 *   GET    /api/debtors/:id                    детали + payments + history
 *   POST   /api/debtors                        создать (wizard finish)
 *   PATCH  /api/debtors/:id                    править поля
 *   DELETE /api/debtors/:id                    soft-delete (creator only)
 *
 *   POST   /api/debtors/:id/transition         сменить стадию (валидируется)
 *   POST   /api/debtors/:id/schedule           создать график платежей
 *   POST   /api/debtors/:id/payments           зафиксировать платёж
 *   PATCH  /api/debtors/:id/payments/:pid      править/откатить платёж
 *   POST   /api/debtors/:id/calls              залогать звонок
 *   POST   /api/debtors/:id/notes              добавить заметку
 *   POST   /api/debtors/:id/transfer-lawyer    передать юристу
 *   POST   /api/debtors/:id/lawyer-update      запись от юриста
 *   POST   /api/debtors/:id/close              закрыть дело
 */
import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  clientDocuments,
  clients,
  damageReports,
  debtEntries,
  parkingSessions,
  payments,
  rentals,
  debtorCalls,
  debtorNotes,
  debtorPayments,
  debtorStageEvents,
  debtors,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import {
  buildSchedule,
  buildScheduleByAmount,
  paidSoFar,
  progressPercent,
} from "../services/debtorSchedule.js";
import {
  canTransition,
  isClosed,
  stageLabel,
  typeLabel,
  type DebtType,
  type Stage,
} from "../services/debtorStages.js";
import { sortByPriority } from "../services/debtorPriority.js";
import {
  getTodayBundle,
  type DebtorForToday,
} from "../services/debtorToday.js";
import { overdueAmount, overdueDays } from "../services/debtorOverdue.js";
import { calculateInsuranceForecast } from "../services/debtorProfit.js";
import { recommendNextAction } from "../services/debtorRecommend.js";
import { syncRentalDebtorCases } from "../services/debtorSync.js";
import {
  addDaysYmd,
  DAMAGE_PAID_REASON,
  RENT_CASE_MARK,
  loadCaseFinance,
  mskTodayYmd,
  PENALTY_PER_DAY,
} from "../services/debtorFinance.js";

// ====== zod schemas ======

const DebtTypeEnum = z.enum([
  "dtp_guilty",
  "dtp_victim",
  "damage",
  "theft",
  "rental_overdue",
]);

const StageEnum = z.enum([
  "created",
  "pretrial",
  "lawyer",
  "court",
  "insurance_docs",
  "insurance_eval",
  "insurance_wait",
  "payment_schedule",
  "police",
  "criminal_case",
  "closed_paid",
  "closed_recovered",
  "closed_written_off",
  "closed_settled",
  "closed_court",
]);

const CreateBody = z.object({
  clientId: z.number().int().positive().nullable().optional(),
  externalName: z.string().min(1).max(200).nullable().optional(),
  externalPhone: z.string().min(1).max(50).nullable().optional(),
  type: DebtTypeEnum,
  totalAmount: z.number().int().positive(),
  psyRating: z.number().int().min(1).max(5).default(3),
  clientStatus: z.enum(["active", "closed"]).default("active"),
  comment: z.string().max(2000).nullable().optional(),
  insuranceCompany: z.string().max(200).nullable().optional(),
  relatedRentalId: z.number().int().positive().nullable().optional(),
  /** Этап 3: акт о повреждениях, из которого заводится дело. */
  damageReportId: z.number().int().positive().nullable().optional(),
});

const PatchBody = z.object({
  comment: z.string().max(2000).nullable().optional(),
  psyRating: z.number().int().min(1).max(5).optional(),
  clientStatus: z.enum(["active", "closed"]).optional(),
  insuranceCompany: z.string().max(200).nullable().optional(),
  insuranceEstimate: z.number().int().min(0).nullable().optional(),
  insurancePayout: z.number().int().min(0).nullable().optional(),
  repairCost: z.number().int().min(0).nullable().optional(),
  lawyerName: z.string().max(200).nullable().optional(),
  /** Пеня по п. 5.7 договора (1 000 ₽/день неоплаты ущерба). */
  penaltyEnabled: z.boolean().optional(),
  /** «Ждём оплату до» (YYYY-MM-DD) или null — дело в работе. */
  paymentDueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
});

/** Ответ на «Пришла ли оплата?» после срока из акта. */
const PaymentCheckBody = z.object({
  answer: z.enum(["yes", "partial", "no"]),
  amount: z.number().int().positive().optional(),
  method: z.enum(["transfer", "cash"]).optional(),
  /** Частично: через сколько дней спросить про остаток. */
  days: z.number().int().min(1).max(365).optional(),
});

const TransitionBody = z.object({
  toStage: StageEnum,
  reason: z.string().max(500).optional(),
});

const ScheduleBody = z
  .object({
    /** Режим разбивки: по количеству платежей или по комфортной сумме платежа. */
    mode: z.enum(["by_count", "by_amount"]).default("by_count"),
    count: z.number().int().min(1).max(120).optional(),
    perPayment: z.number().int().positive().optional(),
    /** Сумма к разбивке. По умолчанию — остаток долга (total − оплачено). */
    totalAmount: z.number().int().positive().optional(),
    startDate: z.string(), // YYYY-MM-DD
    frequency: z.enum(["daily", "weekly", "biweekly", "monthly"]),
  })
  .refine(
    (b) =>
      b.mode === "by_amount" ? b.perPayment != null : b.count != null,
    { message: "укажите count (by_count) или perPayment (by_amount)" },
  );

const PaymentBody = z.object({
  paymentN: z.number().int().min(1).optional(), // если фиксируем конкретный платёж графика
  amount: z.number().int().positive(),
  method: z.enum(["transfer", "cash"]),
  paidAt: z.string().optional(), // ISO; default = now
  note: z.string().max(500).optional(),
  /**
   * Как зачесть переплату (amount > планового платежа строки):
   *  - "term"  — в счёт срока: гасим ближайшие плановые платежи по очереди
   *              (срок сокращается), хвост — авансом.
   *  - "total" — в счёт всей суммы: вся сумма ложится одной строкой
   *              (просто уменьшаем общий остаток).
   * По умолчанию — "total".
   */
  allocate: z.enum(["term", "total"]).optional(),
});

const CallBody = z.object({
  outcome: z.enum(["answered", "no_answer", "promised", "refused"]),
  promisedDate: z.string().optional(),
  note: z.string().max(1000).optional(),
});

const NoteBody = z.object({
  text: z.string().min(1).max(2000),
});

const TransferLawyerBody = z.object({
  lawyerName: z.string().min(1).max(200),
  reason: z.string().max(500).optional(),
});

const LawyerUpdateBody = z.object({
  note: z.string().min(1).max(1000),
});

const CloseBody = z.object({
  toStage: z.enum([
    "closed_paid",
    "closed_recovered",
    "closed_written_off",
    "closed_settled",
    "closed_court",
  ]),
  reason: z.string().max(500).optional(),
});

// ====== helpers ======

/** Date → "YYYY-MM-DD" в локальной TZ (для scheduledDate). */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function getDebtor(id: number) {
  const [d] = await db.select().from(debtors).where(eq(debtors.id, id));
  return d ?? null;
}

async function nextCaseNumber(): Promise<string> {
  const rows = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTRING(case_number FROM 3) AS INTEGER)), 0)`,
    })
    .from(debtors);
  const next = Number(rows[0]?.maxNum ?? 0) + 1;
  return `D-${String(next).padStart(3, "0")}`;
}

async function loadPayments(debtorId: number) {
  return db
    .select()
    .from(debtorPayments)
    .where(eq(debtorPayments.debtorId, debtorId))
    .orderBy(asc(debtorPayments.n));
}

/**
 * Гард закрытия «оплачено»: вернёт объект-ошибку, если дело пытаются
 * закрыть как closed_paid без достаточного основания (платежи не покрыли
 * долг). Для dtp_victim (страховая выплата) — не применяется.
 * Возвращает null, если всё ок.
 */
async function caseFinance(d: typeof debtors.$inferSelect) {
  const m = await loadCaseFinance([d]);
  return m.get(d.id)!;
}

async function closedPaidBasisError(
  d: typeof debtors.$inferSelect,
  to: Stage,
): Promise<{ error: string; message: string } | null> {
  if (to !== "closed_paid") return null;
  if (d.type === "dtp_victim") return null; // основание — выплата страховой
  const f = await caseFinance(d);
  if (f.remaining <= 0) return null;
  return {
    error: "not_fully_paid",
    message: `Нельзя закрыть как «оплачено»: погашено ${f.paid.toLocaleString("ru-RU")} из ${f.total.toLocaleString("ru-RU")} ₽. Сначала примите платежи на полную сумму — дело закроется само.`,
  };
}

/**
 * Авто-закрытие дела при полном погашении (Σ оплаченного ≥ totalAmount).
 * Клиент перестаёт быть должником — метка и баннер долга снимаются.
 */
async function autoCloseIfPaid(
  req: FastifyRequest,
  dIn: { id: number },
): Promise<void> {
  const d = await getDebtor(dIn.id);
  if (!d || isClosed(d.stage as Stage)) return;
  const f = await caseFinance(d);
  if (f.remaining > 0) return;
  const now = new Date();
  const userId = req.user?.userId ?? null;
  await db
    .update(debtors)
    .set({
      stage: "closed_paid",
      clientStatus: "closed",
      stageEnteredAt: now,
      closedAt: now,
      closedReason:
        d.damageReportId != null ? DAMAGE_PAID_REASON : "Долг погашен полностью",
      updatedAt: now,
    })
    .where(eq(debtors.id, d.id));
  await db.insert(debtorStageEvents).values({
    debtorId: d.id,
    fromStage: d.stage as Stage,
    toStage: "closed_paid",
    reason: "авто: долг погашен полностью",
    userId,
  });
  await logActivity(req, {
    entity: "debtor",
    entityId: d.id,
    action: "closed",
    summary: `${d.caseNumber}: закрыто — долг погашен полностью`,
  });
}

/** Ключ миниатюры фото клиента (client_documents kind='photo') по id. */
async function clientPhotoKeys(
  ids: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({
      clientId: clientDocuments.clientId,
      fileKey: clientDocuments.fileKey,
      id: clientDocuments.id,
    })
    .from(clientDocuments)
    .where(
      and(
        inArray(clientDocuments.clientId, ids),
        eq(clientDocuments.kind, "photo"),
      ),
    )
    .orderBy(asc(clientDocuments.id));
  for (const r of rows) if (!out.has(r.clientId)) out.set(r.clientId, r.fileKey);
  return out;
}

/**
 * Партия 23.10: деньги по делу ущерба гасят сам акт — платёж ущерба в
 * аренде (как если бы его приняли в карточке аренды). Возвращает, сколько
 * ушло на акт, а сколько — на пеню по п. 5.7 (сверх акта).
 */
async function applyToDamageReport(
  req: FastifyRequest,
  d: typeof debtors.$inferSelect,
  amount: number,
  method: "transfer" | "cash",
  paidAt: Date,
): Promise<{ damagePart: number; penaltyPart: number }> {
  if (d.damageReportId == null) return { damagePart: 0, penaltyPart: 0 };
  const [rep] = await db
    .select({
      id: damageReports.id,
      rentalId: damageReports.rentalId,
    })
    .from(damageReports)
    .where(eq(damageReports.id, d.damageReportId));
  if (!rep) return { damagePart: 0, penaltyPart: 0 };
  const f = await caseFinance(d);
  const damagePart = Math.min(amount, f.reportBalance ?? 0);
  const penaltyPart = Math.max(0, amount - damagePart);
  if (damagePart > 0) {
    await db.insert(payments).values({
      rentalId: rep.rentalId,
      type: "damage",
      amount: damagePart,
      method,
      paid: true,
      paidAt,
      damageReportId: rep.id,
      receivedByUserId: req.user?.userId ?? null,
      note: `Принято в «Должниках» · ${d.caseNumber}`,
    });
    await logActivity(req, {
      entity: "rental",
      entityId: rep.rentalId,
      action: "damage_payment",
      summary: `Оплата ущерба ${damagePart.toLocaleString("ru-RU")} ₽ по акту — принята в «Должниках» (${d.caseNumber})`,
      meta: { debtorId: d.id, damageReportId: rep.id, amount: damagePart, method },
    });
  }
  // Пеня по п. 5.7 — тоже живые деньги: в аренду платежом-штрафом (идёт в
  // выручку), акт при этом остаётся оплаченным ровно на свою сумму.
  if (penaltyPart > 0) {
    await db.insert(payments).values({
      rentalId: rep.rentalId,
      type: "fine",
      amount: penaltyPart,
      method,
      paid: true,
      paidAt,
      receivedByUserId: req.user?.userId ?? null,
      note: `Пеня по п. 5.7 договора (ущерб) · ${d.caseNumber}`,
    });
    await logActivity(req, {
      entity: "rental",
      entityId: rep.rentalId,
      action: "damage_penalty_payment",
      summary: `Пеня по п. 5.7 за неоплату ущерба ${penaltyPart.toLocaleString("ru-RU")} ₽ — принята в «Должниках» (${d.caseNumber})`,
      meta: { debtorId: d.id, amount: penaltyPart, method },
    });
  }
  return { damagePart, penaltyPart };
}

/**
 * Партия 23.10: дело «долг за аренду» (аренду закрыли с долгом) — платёж в
 * «Должниках» гасит долг самой аренды тем же порядком, что карточка аренды:
 * ручной долг → неоплаченная аренда → паркинг. Деньги попадают в выручку
 * платежами аренды. Возвращает, сколько разложено по аренде.
 */
async function applyToRentDebt(
  req: FastifyRequest,
  d: typeof debtors.$inferSelect,
  amount: number,
  method: "transfer" | "cash",
  paidAt: Date,
): Promise<number> {
  if (
    d.type !== "rental_overdue" ||
    d.relatedRentalId == null ||
    d.damageReportId != null ||
    !(d.comment ?? "").includes(RENT_CASE_MARK)
  )
    return 0;
  const rid = d.relatedRentalId;
  const userId = req.user?.userId ?? null;
  const note = `Принято в «Должниках» · ${d.caseNumber}`;
  let left = amount;
  const parts: string[] = [];

  // 1. Ручной долг
  const ents = await db.select().from(debtEntries).where(eq(debtEntries.rentalId, rid));
  const manualBal = Math.max(
    0,
    ents.filter((e) => e.kind === "manual_charge").reduce((s, e) => s + e.amount, 0) -
      ents.filter((e) => e.kind === "manual_forgive").reduce((s, e) => s + e.amount, 0),
  );
  const m = Math.min(left, manualBal);
  if (m > 0) {
    const [entry] = await db
      .insert(debtEntries)
      .values({ rentalId: rid, kind: "manual_forgive", amount: m, comment: note, createdByUserId: userId })
      .returning();
    await db.insert(payments).values({
      rentalId: rid,
      type: "rent",
      amount: m,
      method,
      paid: true,
      paidAt,
      receivedByUserId: userId,
      note: `Оплата ручного долга · ${note}`,
      rollbackSnapshot: { kind: "payment", payKind: "manual", debtEntryId: entry?.id } as unknown as object,
    });
    left -= m;
    parts.push(`ручной долг ${m.toLocaleString("ru-RU")} ₽`);
  }

  // 2. Неоплаченная аренда (строки по порядку; частично — делим строку)
  const unpaid = await db
    .select()
    .from(payments)
    .where(and(eq(payments.rentalId, rid), eq(payments.type, "rent"), eq(payments.paid, false)))
    .orderBy(asc(payments.id));
  let rentTaken = 0;
  for (const row of unpaid) {
    if (left <= 0) break;
    if (left >= row.amount) {
      await db
        .update(payments)
        .set({ paid: true, paidAt, method, receivedByUserId: userId, note: row.note ? `${row.note} · ${note}` : note })
        .where(eq(payments.id, row.id));
      left -= row.amount;
      rentTaken += row.amount;
    } else {
      await db.update(payments).set({ amount: row.amount - left }).where(eq(payments.id, row.id));
      await db.insert(payments).values({
        rentalId: rid,
        type: "rent",
        amount: left,
        method,
        paid: true,
        paidAt,
        scheduledOn: row.scheduledOn,
        receivedByUserId: userId,
        note: `Часть неоплаченной аренды · ${note}`,
      });
      rentTaken += left;
      left = 0;
    }
  }
  if (rentTaken > 0) parts.push(`аренда ${rentTaken.toLocaleString("ru-RU")} ₽`);

  // 3. Паркинг
  const sessions = await db
    .select()
    .from(parkingSessions)
    .where(eq(parkingSessions.rentalId, rid))
    .orderBy(asc(parkingSessions.id));
  let parkTaken = 0;
  for (const ss of sessions) {
    if (left <= 0) break;
    const due = Math.max(0, ss.amount - ss.paidAmount);
    const t = Math.min(left, due);
    if (t <= 0) continue;
    await db
      .update(parkingSessions)
      .set({ paidAmount: ss.paidAmount + t })
      .where(eq(parkingSessions.id, ss.id));
    left -= t;
    parkTaken += t;
  }
  if (parkTaken > 0) {
    await db.insert(payments).values({
      rentalId: rid,
      type: "parking",
      amount: parkTaken,
      method,
      paid: true,
      paidAt,
      receivedByUserId: userId,
      note: `Оплата паркинга · ${note}`,
    });
    parts.push(`паркинг ${parkTaken.toLocaleString("ru-RU")} ₽`);
  }

  const applied = amount - left;
  if (applied > 0)
    await logActivity(req, {
      entity: "rental",
      entityId: rid,
      action: "debt_payment",
      summary: `Оплата долга за аренду ${applied.toLocaleString("ru-RU")} ₽ — принята в «Должниках» (${d.caseNumber}): ${parts.join(", ")}`,
      meta: { debtorId: d.id, amount: applied, method },
      diff: { payment: { label: "Принято", from: 0, to: applied, kind: "money" } },
    });
  return applied;
}

function clientDisplayName(d: {
  externalName: string | null;
  externalPhone: string | null;
  clientId: number | null;
}, client: { name: string; phone: string } | null): { name: string; phone: string } {
  if (client) return client;
  return {
    name: d.externalName ?? "—",
    phone: d.externalPhone ?? "—",
  };
}

// ====== routes ======

export async function debtorsRoutes(app: FastifyInstance) {
  // ---------- GET / ----------
  app.get<{
    Querystring: { stage?: string; type?: string; closed?: string };
  }>("/", async (req) => {
    // v0.6: авто-ингест должников из аренд (просрочка/ущерб/паркинг/...).
    await syncRentalDebtorCases().catch((e) =>
      app.log.warn({ err: e }, "debtor sync failed"),
    );
    const rows = await db.select().from(debtors).orderBy(desc(debtors.createdAt));
    // По умолчанию исключаем closed_*
    const includeClosed = req.query.closed === "1";
    const filtered = rows.filter((r) => {
      if (!includeClosed && isClosed(r.stage as Stage)) return false;
      if (req.query.stage && r.stage !== req.query.stage) return false;
      if (req.query.type && r.type !== req.query.type) return false;
      return true;
    });
    const sorted = sortByPriority(
      filtered.map((r) => ({
        ...r,
        stage: r.stage as Stage,
      })),
      { includeClosed },
    );
    // v0.6: подмешиваем имя/телефон клиента (для списка дел) — как в /today.
    const cids = sorted.map((r) => r.clientId).filter(Boolean) as number[];
    const nameMap = new Map<number, { name: string; phone: string }>();
    if (cids.length > 0) {
      const cs = await db
        .select({ id: clients.id, name: clients.name, phone: clients.phone })
        .from(clients);
      for (const c of cs) nameMap.set(c.id, { name: c.name, phone: c.phone });
    }
    const fin = await loadCaseFinance(sorted);
    const photos = await clientPhotoKeys(cids);
    const items = sorted.map((r) => {
      const c = r.clientId ? nameMap.get(r.clientId) ?? null : null;
      const f = fin.get(r.id);
      return {
        ...r,
        clientName: c?.name ?? r.externalName ?? null,
        clientPhone: c?.phone ?? r.externalPhone ?? null,
        clientPhotoKey: r.clientId ? photos.get(r.clientId) ?? null : null,
        paid: f?.paid ?? 0,
        remaining: f?.remaining ?? r.totalAmount,
        penalty: f?.penalty ?? 0,
      };
    });
    return { items };
  });

  // ---------- GET /today ----------
  app.get("/today", async () => {
    await syncRentalDebtorCases().catch((e) =>
      app.log.warn({ err: e }, "debtor sync failed"),
    );
    const rows = await db.select().from(debtors);
    const payments = await db.select().from(debtorPayments);
    const paymentsByDebtor = new Map<number, typeof payments>();
    for (const p of payments) {
      const arr = paymentsByDebtor.get(p.debtorId) ?? [];
      arr.push(p);
      paymentsByDebtor.set(p.debtorId, arr);
    }
    // join clients lazily
    const clientIds = rows.map((r) => r.clientId).filter(Boolean) as number[];
    const clientsMap = new Map<number, { name: string; phone: string }>();
    if (clientIds.length > 0) {
      const cs = await db.select().from(clients);
      for (const c of cs) clientsMap.set(c.id, { name: c.name, phone: c.phone });
    }

    const fin = await loadCaseFinance(rows);
    const photos = await clientPhotoKeys(clientIds);
    const list: DebtorForToday[] = rows.map((r) => {
      const cd = clientDisplayName(r, r.clientId ? clientsMap.get(r.clientId) ?? null : null);
      return {
        remaining: fin.get(r.id)?.remaining ?? r.totalAmount,
        paymentDueDate: r.paymentDueDate,
        clientPhone: cd.phone,
        clientPhotoKey: r.clientId ? photos.get(r.clientId) ?? null : null,
        id: r.id,
        caseNumber: r.caseNumber,
        type: r.type as DebtType,
        stage: r.stage as Stage,
        stageEnteredAt: r.stageEnteredAt,
        lastLawyerUpdateAt: r.lastLawyerUpdateAt,
        totalAmount: r.totalAmount,
        psyRating: r.psyRating,
        clientStatus: r.clientStatus as "active" | "closed",
        clientName: cd.name,
        payments: (paymentsByDebtor.get(r.id) ?? []).map((p) => ({
          scheduledDate: p.scheduledDate,
          scheduledAmount: p.scheduledAmount,
          paidAt: p.paidAt,
        })),
      };
    });

    const bundle = getTodayBundle(list);
    return bundle;
  });

  // ---------- GET /dashboard-stats ----------
  app.get("/dashboard-stats", async () => {
    await syncRentalDebtorCases().catch((e) =>
      app.log.warn({ err: e }, "debtor sync failed"),
    );
    const rows = await db.select().from(debtors);
    const payments = await db.select().from(debtorPayments);
    const paymentsByDebtor = new Map<number, typeof payments>();
    for (const p of payments) {
      const arr = paymentsByDebtor.get(p.debtorId) ?? [];
      arr.push(p);
      paymentsByDebtor.set(p.debtorId, arr);
    }

    const activeRows = rows.filter((r) => !isClosed(r.stage as Stage));
    const overdueCases: { id: number; type: string; sum: number; caseNumber: string }[] = [];
    let totalOverdue = 0;
    for (const r of activeRows) {
      const ps = (paymentsByDebtor.get(r.id) ?? []).map((p) => ({
        scheduledDate: p.scheduledDate,
        scheduledAmount: p.scheduledAmount,
        paidAt: p.paidAt,
      }));
      const sum = overdueAmount(ps);
      if (sum > 0) {
        overdueCases.push({
          id: r.id,
          type: r.type,
          sum,
          caseNumber: r.caseNumber,
        });
        totalOverdue += sum;
      }
    }
    // bucketing
    const rentalBucket = overdueCases.filter((c) => c.type === "rental_overdue");
    const damageBucket = overdueCases.filter((c) =>
      ["damage", "dtp_guilty"].includes(c.type),
    );
    const otherBucket = overdueCases.filter(
      (c) => !["rental_overdue", "damage", "dtp_guilty"].includes(c.type),
    );
    return {
      totalActive: activeRows.length,
      totalOverdueSum: totalOverdue,
      buckets: {
        rental: { count: rentalBucket.length, items: rentalBucket },
        damage: { count: damageBucket.length, items: damageBucket },
        other: { count: otherBucket.length, items: otherBucket },
      },
    };
  });

  // ---------- GET /:id ----------
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const d = await getDebtor(id);
    if (!d) return reply.code(404).send({ error: "not found" });

    const payments = await loadPayments(id);
    const stageEvents = await db
      .select()
      .from(debtorStageEvents)
      .where(eq(debtorStageEvents.debtorId, id))
      .orderBy(desc(debtorStageEvents.createdAt));
    const calls = await db
      .select()
      .from(debtorCalls)
      .where(eq(debtorCalls.debtorId, id))
      .orderBy(desc(debtorCalls.createdAt));
    const notes = await db
      .select()
      .from(debtorNotes)
      .where(eq(debtorNotes.debtorId, id))
      .orderBy(desc(debtorNotes.createdAt));

    let client: { name: string; phone: string } | null = null;
    if (d.clientId) {
      const [c] = await db
        .select({ name: clients.name, phone: clients.phone })
        .from(clients)
        .where(eq(clients.id, d.clientId));
      client = c ?? null;
    }
    const display = clientDisplayName(d, client);
    const fin = await caseFinance(d);
    const photoKey = d.clientId
      ? (await clientPhotoKeys([d.clientId])).get(d.clientId) ?? null
      : null;
    let damageReport: { id: number; rentalId: number; payDueDate: string | null; total: number; depositCovered: number } | null = null;
    if (d.damageReportId != null) {
      const [r] = await db
        .select({
          id: damageReports.id,
          rentalId: damageReports.rentalId,
          payDueDate: damageReports.payDueDate,
          total: damageReports.total,
          depositCovered: damageReports.depositCovered,
        })
        .from(damageReports)
        .where(eq(damageReports.id, d.damageReportId));
      damageReport = r ?? null;
    }

    const psForCalc = payments.map((p) => ({
      scheduledDate: p.scheduledDate,
      scheduledAmount: p.scheduledAmount,
      paidAt: p.paidAt,
      paidAmount: p.paidAmount,
    }));
    const paid = fin.paid;
    const recommendation = recommendNextAction({
      stage: d.stage as Stage,
      stageEnteredAt: d.stageEnteredAt,
      lastLawyerUpdateAt: d.lastLawyerUpdateAt,
      totalAmount: fin.total,
      payments: psForCalc,
    });
    const forecast = calculateInsuranceForecast({
      type: d.type as DebtType,
      insuranceEstimate: d.insuranceEstimate,
      insurancePayout: d.insurancePayout,
      repairCost: d.repairCost,
    });

    return {
      ...d,
      totalAmount: fin.total,
      displayName: display.name,
      displayPhone: display.phone,
      clientPhotoKey: photoKey,
      paid,
      remaining: fin.remaining,
      penalty: fin.penalty,
      penaltyDays: fin.penaltyDays,
      penaltyPerDay: PENALTY_PER_DAY,
      reportBalance: fin.reportBalance,
      damageReport,
      progressPercent: progressPercent(fin.total, paid),
      overdueDays: overdueDays(psForCalc),
      overdueAmount: overdueAmount(psForCalc),
      payments,
      stageEvents,
      calls,
      notes,
      recommendation,
      forecast,
    };
  });

  // ---------- POST / (create) ----------
  app.post("/", async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const body = parsed.data;
    // Должен быть либо clientId, либо externalName+externalPhone
    if (!body.clientId && (!body.externalName || !body.externalPhone)) {
      return reply.code(400).send({
        error: "person_required",
        message: "Укажите клиента или ФИО+телефон внешнего человека",
      });
    }

    // 23.10: комментарий к делу обязателен (откуда долг, о чём договорились).
    if (!body.comment || body.comment.trim().length < 3) {
      return reply.code(400).send({
        error: "comment_required",
        message: "Добавьте комментарий: откуда долг и о чём договорились",
      });
    }
    const caseNumber = await nextCaseNumber();
    const userId = req.user?.userId ?? null;

    const [row] = await db
      .insert(debtors)
      .values({
        caseNumber,
        clientId: body.clientId ?? null,
        externalName: body.externalName ?? null,
        externalPhone: body.externalPhone ?? null,
        type: body.type,
        stage: "created",
        totalAmount: body.totalAmount,
        psyRating: body.psyRating,
        clientStatus: body.clientStatus,
        comment: body.comment ?? null,
        insuranceCompany: body.insuranceCompany ?? null,
        relatedRentalId: body.relatedRentalId ?? null,
        damageReportId: body.damageReportId ?? null,
        createdByUserId: userId,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    await db.insert(debtorStageEvents).values({
      debtorId: row.id,
      fromStage: null,
      toStage: "created",
      reason: "создание дела",
      userId,
    });

    await logActivity(req, {
      entity: "debtor",
      entityId: row.id,
      action: "created",
      summary: `Заведено дело ${row.caseNumber} · ${typeLabel(row.type as DebtType)} · ${row.totalAmount} ₽`,
    });
    return reply.code(201).send(row);
  });

  // ---------- GET /by-damage-report/:reportId (Этап 3) ----------
  // Найти дело, заведённое из акта — для кнопки «Досудебное дело →»: открыть
  // существующее или, если нет, фронт создаст новое.
  app.get<{ Params: { reportId: string } }>(
    "/by-damage-report/:reportId",
    async (req, reply) => {
      const reportId = Number(req.params.reportId);
      if (!Number.isFinite(reportId))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(debtors)
        .where(eq(debtors.damageReportId, reportId))
        .limit(1);
      return { debtor: row ?? null };
    },
  );

  // ---------- GET /by-rentals?ids=1,2 (партия 23.10) ----------
  // Дела по арендам — для красной ссылки «Ущерб → в «Должниках»» в карточке
  // аренды (вся цепочка продлений).
  app.get<{ Querystring: { ids?: string } }>("/by-rentals", async (req) => {
    const ids = (req.query.ids ?? "")
      .split(",")
      .map((x) => Number(x))
      .filter((x) => Number.isFinite(x) && x > 0)
      .slice(0, 200);
    if (ids.length === 0) return { items: [] };
    await syncRentalDebtorCases().catch((e) =>
      app.log.warn({ err: e }, "debtor sync failed"),
    );
    const rows = await db
      .select()
      .from(debtors)
      .where(inArray(debtors.relatedRentalId, ids));
    const fin = await loadCaseFinance(rows);
    return {
      items: rows.map((r) => ({
        id: r.id,
        caseNumber: r.caseNumber,
        type: r.type,
        stage: r.stage,
        relatedRentalId: r.relatedRentalId,
        damageReportId: r.damageReportId,
        paymentDueDate: r.paymentDueDate,
        total: fin.get(r.id)?.total ?? r.totalAmount,
        remaining: fin.get(r.id)?.remaining ?? r.totalAmount,
      })),
    };
  });

  // ---------- POST /:id/payment-check (партия 23.10) ----------
  // Срок оплаты из акта прошёл — «Пришла ли оплата?»:
  //   Да       → принимаем остаток, дело закрывается;
  //   Частично → принимаем сумму, остаток ждём ещё N дней (спросим снова);
  //   Нет      → дело в работу (прозвон), срок снимается.
  app.post<{ Params: { id: string } }>(
    "/:id/payment-check",
    async (req, reply) => {
      const id = Number(req.params.id);
      const parsed = PaymentCheckBody.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const d = await getDebtor(id);
      if (!d) return reply.code(404).send({ error: "not found" });
      if (isClosed(d.stage as Stage))
        return reply.code(400).send({ error: "closed", message: "Дело уже закрыто" });
      const { answer } = parsed.data;
      const userId = req.user?.userId ?? null;
      const method = parsed.data.method ?? "cash";
      const f = await caseFinance(d);
      const ru = (v: string) => v.split("-").reverse().join(".");

      const takePayment = async (amount: number, note: string) => {
        const now = new Date();
        const { penaltyPart } = await applyToDamageReport(req, d, amount, method, now);
        await applyToRentDebt(req, d, amount, method, now);
        const maxN = await db
          .select({ max: sql<number>`COALESCE(MAX(${debtorPayments.n}), 0)` })
          .from(debtorPayments)
          .where(eq(debtorPayments.debtorId, id));
        await db.insert(debtorPayments).values({
          debtorId: id,
          n: Number(maxN[0]?.max ?? 0) + 1,
          scheduledDate: ymd(now),
          scheduledAmount: amount,
          paidAt: now,
          paidAmount: amount,
          paidMethod: method,
          paidByUserId: userId,
          penaltyAmount: penaltyPart,
          note,
        });
      };

      if (answer === "yes") {
        if (f.remaining > 0) await takePayment(f.remaining, "Оплата пришла в срок по акту");
        await logActivity(req, {
          entity: "debtor",
          entityId: id,
          action: "payment_check",
          summary: `${d.caseNumber}: «Пришла ли оплата?» — да, ${f.remaining.toLocaleString("ru-RU")} ₽ (${method === "cash" ? "наличные" : "перевод"})`,
        });
        await db
          .update(debtors)
          .set({ paymentDueDate: null, updatedAt: new Date() })
          .where(eq(debtors.id, id));
        await autoCloseIfPaid(req, d);
        return { ok: true };
      }
      if (answer === "partial") {
        const amount = parsed.data.amount ?? 0;
        if (amount <= 0 || amount >= f.remaining)
          return reply.code(400).send({
            error: "bad_amount",
            message: `Частичная оплата — от 1 до ${(f.remaining - 1).toLocaleString("ru-RU")} ₽`,
          });
        const days = parsed.data.days ?? 3;
        const due = addDaysYmd(mskTodayYmd(), days);
        await takePayment(amount, "Частичная оплата по акту");
        await db
          .update(debtors)
          .set({ paymentDueDate: due, updatedAt: new Date() })
          .where(eq(debtors.id, id));
        await logActivity(req, {
          entity: "debtor",
          entityId: id,
          action: "payment_check",
          summary: `${d.caseNumber}: «Пришла ли оплата?» — частично, ${amount.toLocaleString("ru-RU")} ₽; остаток ${(f.remaining - amount).toLocaleString("ru-RU")} ₽ ждём до ${ru(due)}`,
          diff: {
            due: {
              label: "Ждём оплату до",
              from: d.paymentDueDate ? ru(d.paymentDueDate) : "—",
              to: ru(due),
              kind: "text",
            },
          },
        });
        return { ok: true, paymentDueDate: due };
      }
      // Нет — в работу.
      await db
        .update(debtors)
        .set({ paymentDueDate: null, updatedAt: new Date() })
        .where(eq(debtors.id, id));
      await logActivity(req, {
        entity: "debtor",
        entityId: id,
        action: "payment_check",
        summary: `${d.caseNumber}: «Пришла ли оплата?» — нет, дело в работу (прозвон)`,
      });
      return { ok: true };
    },
  );

  // ---------- PATCH /:id ----------
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const before = await getDebtor(id);
    if (!before) return reply.code(404).send({ error: "not found" });
    const patch: Partial<typeof debtors.$inferInsert> = { ...parsed.data };
    if (parsed.data.penaltyEnabled === true && !before.penaltyFrom) {
      let from = before.paymentDueDate;
      if (!from && before.damageReportId != null) {
        const [r] = await db
          .select({ due: damageReports.payDueDate })
          .from(damageReports)
          .where(eq(damageReports.id, before.damageReportId));
        from = r?.due ?? null;
      }
      patch.penaltyFrom = from ?? mskTodayYmd();
    }
    const [row] = await db
      .update(debtors)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(debtors.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    if (
      parsed.data.penaltyEnabled !== undefined &&
      parsed.data.penaltyEnabled !== before.penaltyEnabled
    ) {
      await logActivity(req, {
        entity: "debtor",
        entityId: id,
        action: "penalty_toggle",
        summary: `${row.caseNumber}: пеня по п. 5.7 договора (${PENALTY_PER_DAY.toLocaleString("ru-RU")} ₽/день) — ${row.penaltyEnabled ? "включена" : "выключена"}`,
        diff: {
          penalty: {
            label: "Пеня п. 5.7",
            from: before.penaltyEnabled ? "считается" : "не считается",
            to: row.penaltyEnabled ? "считается" : "не считается",
            kind: "text",
          },
        },
      });
    }
    if (
      parsed.data.paymentDueDate !== undefined &&
      parsed.data.paymentDueDate !== before.paymentDueDate
    ) {
      const ru = (v: string | null) =>
        v ? v.split("-").reverse().join(".") : "в работе";
      await logActivity(req, {
        entity: "debtor",
        entityId: id,
        action: "payment_due_changed",
        summary: `${row.caseNumber}: ждём оплату до — ${ru(before.paymentDueDate)} → ${ru(row.paymentDueDate)}`,
        diff: {
          due: {
            label: "Ждём оплату до",
            from: ru(before.paymentDueDate),
            to: ru(row.paymentDueDate),
            kind: "text",
          },
        },
      });
    }
    await autoCloseIfPaid(req, row);
    return row;
  });

  // ---------- POST /:id/transition ----------
  app.post<{ Params: { id: string } }>(
    "/:id/transition",
    async (req, reply) => {
      const id = Number(req.params.id);
      const parsed = TransitionBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      }
      const d = await getDebtor(id);
      if (!d) return reply.code(404).send({ error: "not found" });

      const from = d.stage as Stage;
      const to = parsed.data.toStage as Stage;
      if (!canTransition(d.type as DebtType, from, to)) {
        return reply.code(400).send({
          error: "invalid_transition",
          message: `Переход ${stageLabel(from)} → ${stageLabel(to)} не разрешён для типа ${typeLabel(d.type as DebtType)}`,
        });
      }

      // Закрытие «оплачено» — ТОЛЬКО на основании платежей: сумма
      // зачисленного должна покрывать долг. Исключение — dtp_victim
      // (страховой поток: основание — полученная выплата, не график).
      const closeErr = await closedPaidBasisError(d, to);
      if (closeErr) return reply.code(400).send(closeErr);

      const userId = req.user?.userId ?? null;
      const now = new Date();
      const updateData: Partial<typeof debtors.$inferInsert> = {
        stage: to,
        stageEnteredAt: now,
        updatedAt: now,
      };
      if (to.startsWith("closed_")) {
        updateData.closedAt = now;
        updateData.closedReason = parsed.data.reason ?? null;
      }

      const [row] = await db
        .update(debtors)
        .set(updateData)
        .where(eq(debtors.id, id))
        .returning();

      await db.insert(debtorStageEvents).values({
        debtorId: id,
        fromStage: from,
        toStage: to,
        reason: parsed.data.reason ?? null,
        userId,
      });

      await logActivity(req, {
        entity: "debtor",
        entityId: id,
        action: "stage_changed",
        summary: `${d.caseNumber}: ${stageLabel(from)} → ${stageLabel(to)}${parsed.data.reason ? ` · ${parsed.data.reason}` : ""}`,
      });

      return row;
    },
  );

  // ---------- POST /:id/schedule ----------
  app.post<{ Params: { id: string } }>("/:id/schedule", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = ScheduleBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const d = await getDebtor(id);
    if (!d) return reply.code(404).send({ error: "not found" });

    // График строим на ОСТАТОК долга (всё, что ещё не оплачено), чтобы
    // уже зачисленные платежи не задваивались.
    const existing = await loadPayments(id);
    const paid = paidSoFar(
      existing.map((p) => ({ paidAt: p.paidAt, paidAmount: p.paidAmount })),
    );
    void paid;
    // 23.10: остаток — общим расчётом (у дела ущерба — по акту и пене).
    const remaining = (await caseFinance(d)).remaining;
    const total = parsed.data.totalAmount ?? remaining;
    if (total <= 0) {
      return reply
        .code(400)
        .send({ error: "nothing_to_schedule", message: "Долг уже погашен" });
    }

    const [yS, mS, dS] = parsed.data.startDate.split("-").map(Number);
    const startDate = new Date(yS!, mS! - 1, dS!, 0, 0, 0, 0);
    let schedule;
    try {
      schedule =
        parsed.data.mode === "by_amount"
          ? buildScheduleByAmount({
              totalAmount: total,
              perPayment: parsed.data.perPayment!,
              startDate,
              frequency: parsed.data.frequency,
            })
          : buildSchedule({
              totalAmount: total,
              count: parsed.data.count!,
              startDate,
              frequency: parsed.data.frequency,
            });
    } catch (e) {
      return reply.code(400).send({ error: "schedule_failed", message: (e as Error).message });
    }

    // Удаляем существующие НЕоплаченные плановые платежи; оплаченные строки
    // (история) сохраняем, а новые нумеруем после них.
    await db
      .delete(debtorPayments)
      .where(
        sql`${debtorPayments.debtorId} = ${id} AND ${debtorPayments.paidAt} IS NULL`,
      );
    const paidRows = existing.filter((p) => p.paidAt != null);
    const nOffset = paidRows.reduce((m, p) => Math.max(m, p.n), 0);

    const inserted = await db
      .insert(debtorPayments)
      .values(
        schedule.map((s) => ({
          debtorId: id,
          n: nOffset + s.n,
          scheduledDate: `${s.date.getFullYear()}-${String(s.date.getMonth() + 1).padStart(2, "0")}-${String(s.date.getDate()).padStart(2, "0")}`,
          scheduledAmount: s.amount,
        })),
      )
      .returning();

    // Создание графика = вход в стадию «График платежей». Переводим явно
    // (минуя строгий state-machine), т.к. это действие по смыслу и есть
    // переход — иначе график без стадии выглядит несвязно.
    const userId = req.user?.userId ?? null;
    if (d.stage !== "payment_schedule" && !isClosed(d.stage as Stage)) {
      const now = new Date();
      await db
        .update(debtors)
        .set({ stage: "payment_schedule", stageEnteredAt: now, updatedAt: now })
        .where(eq(debtors.id, id));
      await db.insert(debtorStageEvents).values({
        debtorId: id,
        fromStage: d.stage as Stage,
        toStage: "payment_schedule",
        reason: "создан график платежей",
        userId,
      });
    }

    const freqLabel: Record<string, string> = {
      daily: "ежедневно",
      weekly: "еженедельно",
      biweekly: "раз в 2 недели",
      monthly: "ежемесячно",
    };
    await logActivity(req, {
      entity: "debtor",
      entityId: id,
      action: "schedule_created",
      summary: `${d.caseNumber}: график на ${inserted.length} платежей · ${freqLabel[parsed.data.frequency] ?? parsed.data.frequency} · ${total.toLocaleString("ru-RU")} ₽`,
    });

    return { schedule: inserted };
  });

  // ---------- POST /:id/payments ----------
  app.post<{ Params: { id: string } }>("/:id/payments", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = PaymentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const d = await getDebtor(id);
    if (!d) return reply.code(404).send({ error: "not found" });
    const userId = req.user?.userId ?? null;
    const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
    // Партия 23.10: по делу ущерба платёж сразу гасит акт в аренде (одна
    // точка правды), сверх акта — пеня по п. 5.7. Больше остатка не берём:
    // лишние деньги некуда отнести (это ошибка ввода).
    if (d.damageReportId != null || (d.comment ?? "").includes(RENT_CASE_MARK)) {
      const f = await caseFinance(d);
      if (parsed.data.amount > f.remaining)
        return reply.code(400).send({
          error: "over_remaining",
          message: `Больше остатка по делу: осталось ${f.remaining.toLocaleString("ru-RU")} ₽`,
        });
    }
    const { penaltyPart } = await applyToDamageReport(
      req,
      d,
      parsed.data.amount,
      parsed.data.method,
      paidAt,
    );
    await applyToRentDebt(req, d, parsed.data.amount, parsed.data.method, paidAt);

    if (parsed.data.paymentN != null) {
      const all = await loadPayments(id);
      const target = all.find((p) => p.n === parsed.data.paymentN);
      if (!target) return reply.code(404).send({ error: "payment not found" });
      const surplus = parsed.data.amount - target.scheduledAmount;

      // Переплата «в счёт срока»: каскадом гасим этот и следующие плановые
      // платежи по очереди, пока хватает денег. Срок сокращается. Хвост
      // (меньше следующего платежа) — отдельной строкой-авансом.
      if (parsed.data.allocate === "term" && surplus > 0) {
        let left = parsed.data.amount;
        const chain = all
          .filter((p) => p.n >= target.n && p.paidAt == null)
          .sort((a, b) => a.n - b.n);
        const closed: number[] = [];
        for (const row of chain) {
          if (left < row.scheduledAmount) break;
          await db
            .update(debtorPayments)
            .set({
              paidAt,
              paidAmount: row.scheduledAmount,
              paidMethod: parsed.data.method,
              paidByUserId: userId,
              note: parsed.data.note ?? null,
            })
            .where(eq(debtorPayments.id, row.id));
          left -= row.scheduledAmount;
          closed.push(row.n);
        }
        if (left > 0) {
          const maxN = all.reduce((m, p) => Math.max(m, p.n), 0);
          await db.insert(debtorPayments).values({
            debtorId: id,
            n: maxN + 1,
            scheduledDate: ymd(paidAt),
            scheduledAmount: left,
            paidAt,
            paidAmount: left,
            paidMethod: parsed.data.method,
            paidByUserId: userId,
            penaltyAmount: penaltyPart,
            note: parsed.data.note ?? "аванс (переплата)",
          });
        }
        await logActivity(req, {
          entity: "debtor",
          entityId: id,
          action: "payment_received",
          summary: `${d.caseNumber}: платёж ${parsed.data.amount.toLocaleString("ru-RU")} ₽ в счёт срока — закрыто платежей: ${closed.length}${left > 0 ? " + аванс" : ""} (${parsed.data.method})`,
        });
        await autoCloseIfPaid(req, d);
        return { ok: true, closed };
      }

      // Обычный платёж по строке (точно/частично) либо переплата «в счёт
      // всей суммы» — вся сумма ложится одной строкой, уменьшая остаток.
      const [row] = await db
        .update(debtorPayments)
        .set({
          paidAt,
          paidAmount: parsed.data.amount,
          paidMethod: parsed.data.method,
          paidByUserId: userId,
          penaltyAmount: penaltyPart,
          note: parsed.data.note ?? null,
        })
        .where(
          sql`${debtorPayments.debtorId} = ${id} AND ${debtorPayments.n} = ${parsed.data.paymentN}`,
        )
        .returning();
      if (!row) return reply.code(404).send({ error: "payment not found" });

      await logActivity(req, {
        entity: "debtor",
        entityId: id,
        action: "payment_received",
        summary: `${d.caseNumber}: платёж ${row.n} получен · ${parsed.data.amount.toLocaleString("ru-RU")} ₽ (${parsed.data.method})`,
      });
      await autoCloseIfPaid(req, d);
      return row;
    }

    // Иначе — внеплановый платёж: добавляем новую строку с max(n)+1
    const maxN = await db
      .select({ max: sql<number>`COALESCE(MAX(${debtorPayments.n}), 0)` })
      .from(debtorPayments)
      .where(eq(debtorPayments.debtorId, id));
    const nextN = Number(maxN[0]?.max ?? 0) + 1;
    const [row] = await db
      .insert(debtorPayments)
      .values({
        debtorId: id,
        n: nextN,
        scheduledDate: `${paidAt.getFullYear()}-${String(paidAt.getMonth() + 1).padStart(2, "0")}-${String(paidAt.getDate()).padStart(2, "0")}`,
        scheduledAmount: parsed.data.amount,
        paidAt,
        paidAmount: parsed.data.amount,
        paidMethod: parsed.data.method,
        paidByUserId: userId,
        penaltyAmount: penaltyPart,
        note: parsed.data.note ?? null,
      })
      .returning();

    await logActivity(req, {
      entity: "debtor",
      entityId: id,
      action: "payment_received",
      summary: `${d.caseNumber}: внеплановый платёж · ${parsed.data.amount} ₽ (${parsed.data.method})`,
    });
    await autoCloseIfPaid(req, d);
    return row;
  });

  // ---------- POST /:id/calls ----------
  app.post<{ Params: { id: string } }>("/:id/calls", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = CallBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const d = await getDebtor(id);
    if (!d) return reply.code(404).send({ error: "not found" });
    const [row] = await db
      .insert(debtorCalls)
      .values({
        debtorId: id,
        outcome: parsed.data.outcome,
        promisedDate: parsed.data.promisedDate ?? null,
        note: parsed.data.note ?? null,
        userId: req.user?.userId ?? null,
      })
      .returning();

    const outcomeLabel: Record<string, string> = {
      answered: "ответил",
      no_answer: "не ответил",
      promised: "обещал к " + (parsed.data.promisedDate ?? "?"),
      refused: "отказался",
    };
    await logActivity(req, {
      entity: "debtor",
      entityId: id,
      action: "call_logged",
      summary: `${d.caseNumber}: звонок — ${outcomeLabel[parsed.data.outcome] ?? parsed.data.outcome}`,
    });
    return row;
  });

  // ---------- POST /:id/notes ----------
  app.post<{ Params: { id: string } }>("/:id/notes", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = NoteBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const [row] = await db
      .insert(debtorNotes)
      .values({
        debtorId: id,
        text: parsed.data.text,
        userId: req.user?.userId ?? null,
      })
      .returning();
    return row;
  });

  // ---------- POST /:id/transfer-lawyer ----------
  app.post<{ Params: { id: string } }>(
    "/:id/transfer-lawyer",
    async (req, reply) => {
      const id = Number(req.params.id);
      const parsed = TransferLawyerBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      }
      const d = await getDebtor(id);
      if (!d) return reply.code(404).send({ error: "not found" });

      const from = d.stage as Stage;
      const to: Stage = "lawyer";
      if (!canTransition(d.type as DebtType, from, to)) {
        return reply.code(400).send({
          error: "invalid_transition",
          message: `Из стадии ${stageLabel(from)} нельзя передать юристу`,
        });
      }

      const userId = req.user?.userId ?? null;
      const now = new Date();
      await db
        .update(debtors)
        .set({
          stage: to,
          stageEnteredAt: now,
          lawyerName: parsed.data.lawyerName,
          lastLawyerUpdateAt: now,
          updatedAt: now,
        })
        .where(eq(debtors.id, id));

      await db.insert(debtorStageEvents).values({
        debtorId: id,
        fromStage: from,
        toStage: to,
        reason: parsed.data.reason ?? `передано юристу ${parsed.data.lawyerName}`,
        userId,
      });

      await logActivity(req, {
        entity: "debtor",
        entityId: id,
        action: "transfer_lawyer",
        summary: `${d.caseNumber}: передано юристу «${parsed.data.lawyerName}»${parsed.data.reason ? ` · ${parsed.data.reason}` : ""}`,
      });

      return await getDebtor(id);
    },
  );

  // ---------- POST /:id/lawyer-update ----------
  app.post<{ Params: { id: string } }>(
    "/:id/lawyer-update",
    async (req, reply) => {
      const id = Number(req.params.id);
      const parsed = LawyerUpdateBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      }
      const d = await getDebtor(id);
      if (!d) return reply.code(404).send({ error: "not found" });

      await db
        .update(debtors)
        .set({ lastLawyerUpdateAt: new Date(), updatedAt: new Date() })
        .where(eq(debtors.id, id));

      await db.insert(debtorNotes).values({
        debtorId: id,
        text: `[Юрист] ${parsed.data.note}`,
        userId: req.user?.userId ?? null,
      });

      await logActivity(req, {
        entity: "debtor",
        entityId: id,
        action: "lawyer_update",
        summary: `${d.caseNumber}: апдейт от юриста — ${parsed.data.note.slice(0, 80)}`,
      });

      return await getDebtor(id);
    },
  );

  // ---------- POST /:id/close ----------
  app.post<{ Params: { id: string } }>("/:id/close", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = CloseBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const d = await getDebtor(id);
    if (!d) return reply.code(404).send({ error: "not found" });

    const from = d.stage as Stage;
    const to = parsed.data.toStage as Stage;
    if (!canTransition(d.type as DebtType, from, to)) {
      return reply.code(400).send({
        error: "invalid_transition",
        message: `Из ${stageLabel(from)} нельзя закрыть как ${stageLabel(to)}`,
      });
    }
    const closeErr = await closedPaidBasisError(d, to);
    if (closeErr) return reply.code(400).send(closeErr);
    const userId = req.user?.userId ?? null;
    const now = new Date();
    await db
      .update(debtors)
      .set({
        stage: to,
        stageEnteredAt: now,
        closedAt: now,
        closedReason: parsed.data.reason ?? null,
        updatedAt: now,
      })
      .where(eq(debtors.id, id));

    await db.insert(debtorStageEvents).values({
      debtorId: id,
      fromStage: from,
      toStage: to,
      reason: parsed.data.reason ?? null,
      userId,
    });

    await logActivity(req, {
      entity: "debtor",
      entityId: id,
      action: "closed",
      summary: `${d.caseNumber}: закрыто (${stageLabel(to)})${parsed.data.reason ? ` · ${parsed.data.reason}` : ""}`,
    });

    return await getDebtor(id);
  });

  // ---------- DELETE /:id (только creator) ----------
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (req.user?.role !== "creator") {
      return reply.code(403).send({ error: "forbidden" });
    }
    const id = Number(req.params.id);
    const d = await getDebtor(id);
    if (!d) return reply.code(404).send({ error: "not found" });
    await db.delete(debtors).where(eq(debtors.id, id));
    await logActivity(req, {
      entity: "debtor",
      entityId: id,
      action: "deleted",
      summary: `${d.caseNumber}: дело удалено (creator)`,
    });
    return { ok: true };
  });
}
