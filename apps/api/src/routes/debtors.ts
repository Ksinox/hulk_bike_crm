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
import type { FastifyInstance } from "fastify";
import { asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  clients,
  debtorCalls,
  debtorNotes,
  debtorPayments,
  debtorStageEvents,
  debtors,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import {
  buildSchedule,
  isFullyPaid,
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
});

const TransitionBody = z.object({
  toStage: StageEnum,
  reason: z.string().max(500).optional(),
});

const ScheduleBody = z.object({
  totalAmount: z.number().int().positive().optional(),
  count: z.number().int().min(1).max(60),
  startDate: z.string(), // YYYY-MM-DD
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
});

const PaymentBody = z.object({
  paymentN: z.number().int().min(1).optional(), // если фиксируем конкретный платёж графика
  amount: z.number().int().positive(),
  method: z.enum(["transfer", "cash"]),
  paidAt: z.string().optional(), // ISO; default = now
  note: z.string().max(500).optional(),
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
    "closed_written_off",
    "closed_settled",
    "closed_court",
  ]),
  reason: z.string().max(500).optional(),
});

// ====== helpers ======

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
    return { items: sorted };
  });

  // ---------- GET /today ----------
  app.get("/today", async () => {
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

    const list: DebtorForToday[] = rows.map((r) => {
      const cd = clientDisplayName(r, r.clientId ? clientsMap.get(r.clientId) ?? null : null);
      return {
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

    const psForCalc = payments.map((p) => ({
      scheduledDate: p.scheduledDate,
      scheduledAmount: p.scheduledAmount,
      paidAt: p.paidAt,
      paidAmount: p.paidAmount,
    }));
    const paid = paidSoFar(psForCalc);
    const recommendation = recommendNextAction({
      stage: d.stage as Stage,
      stageEnteredAt: d.stageEnteredAt,
      lastLawyerUpdateAt: d.lastLawyerUpdateAt,
      totalAmount: d.totalAmount,
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
      displayName: display.name,
      displayPhone: display.phone,
      paid,
      progressPercent: progressPercent(d.totalAmount, paid),
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

  // ---------- PATCH /:id ----------
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const [row] = await db
      .update(debtors)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(debtors.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
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

    const total = parsed.data.totalAmount ?? d.totalAmount;
    const [yS, mS, dS] = parsed.data.startDate.split("-").map(Number);
    const startDate = new Date(yS!, mS! - 1, dS!, 0, 0, 0, 0);
    let schedule;
    try {
      schedule = buildSchedule({
        totalAmount: total,
        count: parsed.data.count,
        startDate,
        frequency: parsed.data.frequency,
      });
    } catch (e) {
      return reply.code(400).send({ error: "schedule_failed", message: (e as Error).message });
    }

    // Удаляем существующие неоплаченные плановые платежи и вставляем новые
    await db
      .delete(debtorPayments)
      .where(
        sql`${debtorPayments.debtorId} = ${id} AND ${debtorPayments.paidAt} IS NULL`,
      );

    const inserted = await db
      .insert(debtorPayments)
      .values(
        schedule.map((s) => ({
          debtorId: id,
          n: s.n,
          scheduledDate: `${s.date.getFullYear()}-${String(s.date.getMonth() + 1).padStart(2, "0")}-${String(s.date.getDate()).padStart(2, "0")}`,
          scheduledAmount: s.amount,
        })),
      )
      .returning();

    await logActivity(req, {
      entity: "debtor",
      entityId: id,
      action: "schedule_created",
      summary: `${d.caseNumber}: создан график на ${parsed.data.count} платежей × ${parsed.data.frequency}`,
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

    if (parsed.data.paymentN != null) {
      // Фиксируем конкретный платёж из графика
      const [row] = await db
        .update(debtorPayments)
        .set({
          paidAt,
          paidAmount: parsed.data.amount,
          paidMethod: parsed.data.method,
          paidByUserId: userId,
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
        summary: `${d.caseNumber}: платёж ${row.n} получен · ${parsed.data.amount} ₽ (${parsed.data.method})`,
      });

      // Авто-закрытие если всё оплачено
      const all = await loadPayments(id);
      if (
        d.stage === "payment_schedule" &&
        isFullyPaid(d.totalAmount, all.map((p) => ({ paidAt: p.paidAt, paidAmount: p.paidAmount })))
      ) {
        // Не закрываем автоматически — оставляем оператору. Но
        // recommendation вернёт close_paid.
      }
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
        note: parsed.data.note ?? null,
      })
      .returning();

    await logActivity(req, {
      entity: "debtor",
      entityId: id,
      action: "payment_received",
      summary: `${d.caseNumber}: внеплановый платёж · ${parsed.data.amount} ₽ (${parsed.data.method})`,
    });
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
