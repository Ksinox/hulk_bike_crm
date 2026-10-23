/**
 * Авто-ингест должников (v0.6, переработано в партии 23.10).
 *
 * Раньше было «одно дело на аренду», куда сваливались и просрочка, и ущерб.
 * Дело закрывалось по аренде — ущерб оставался висеть только на дашборде,
 * закрыть его было негде; а штраф за просрочку аренды попадал в дело ущерба.
 * Теперь два независимых вида дел:
 *
 *  1. Ущерб — одно дело на АКТ о повреждениях (damageReportId), по любой
 *     аренде, в том числе завершённой и ушедшей в архив. Заводится сразу при
 *     акте (этап «ждём оплату до …» = срок из акта). Сумма — из акта
 *     (см. debtorFinance), закрывается само, когда акт оплачен полностью.
 *     Старые дела типа «ущерб» без ссылки на акт — привязываются к акту
 *     своей аренды.
 *  2. Долг за аренду — только когда аренду ЗАКРЫЛИ с долгом (ручной долг,
 *     паркинг, неоплаченная аренда). Пока аренда идёт — долг живёт в её
 *     карточке. Ущерб сюда не входит.
 *
 * Идемпотентно: вызывается на каждом GET раздела «Должники» и после акта.
 * Закрытые дела (оператором/авто) не трогаем и заново не открываем.
 */
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { overdueDailyRate } from "./overdueCharge.js";
import { db } from "../db/index.js";
import {
  damageReports,
  debtEntries,
  debtors,
  debtorPayments,
  debtorStageEvents,
  parkingSessions,
  payments,
  rentals,
} from "../db/schema.js";
import { isClosed, type Stage } from "./debtorStages.js";
import {
  DAMAGE_PAID_REASON,
  RENT_CASE_MARK,
  loadCaseFinance,
  mskTodayYmd,
} from "./debtorFinance.js";

const MSK = "Europe/Moscow";
const toMsk = (d: Date) =>
  new Date(d.toLocaleString("en-US", { timeZone: MSK }));

export type DebtorSyncResult = {
  created: number;
  updated: number;
  closed: number;
};

const pad4 = (n: number) => String(n).padStart(4, "0");

async function closeCase(
  c: { id: number; stage: string },
  reason: string,
  eventReason: string,
): Promise<void> {
  await db
    .update(debtors)
    .set({
      stage: "closed_paid",
      clientStatus: "closed",
      stageEnteredAt: sql`now()`,
      closedAt: sql`now()`,
      closedReason: reason,
      updatedAt: sql`now()`,
    })
    .where(eq(debtors.id, c.id));
  await db.insert(debtorStageEvents).values({
    debtorId: c.id,
    fromStage: c.stage as Stage,
    toStage: "closed_paid",
    reason: eventReason,
  });
}

export async function syncRentalDebtorCases(): Promise<DebtorSyncResult> {
  const result: DebtorSyncResult = { created: 0, updated: 0, closed: 0 };

  const allCases = await db.select().from(debtors);
  const [maxRow] = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTRING(case_number FROM 3) AS INTEGER)), 0)`,
    })
    .from(debtors);
  let seq = Number(maxRow?.maxNum ?? 0);
  const nextCaseNumber = () => {
    seq += 1;
    return `D-${String(seq).padStart(3, "0")}`;
  };

  // ============ 1. Дела по ущербу — по каждому акту ============
  const reports = await db
    .select({
      id: damageReports.id,
      rentalId: damageReports.rentalId,
      total: damageReports.total,
      depositCovered: damageReports.depositCovered,
      payDueDate: damageReports.payDueDate,
      clientId: rentals.clientId,
    })
    .from(damageReports)
    .innerJoin(rentals, eq(rentals.id, damageReports.rentalId));
  const reportIds = reports.map((r) => r.id);
  const reportPays =
    reportIds.length > 0
      ? await db
          .select({
            reportId: payments.damageReportId,
            amount: payments.amount,
            method: payments.method,
            paidAt: payments.paidAt,
            createdAt: payments.createdAt,
            receivedByUserId: payments.receivedByUserId,
          })
          .from(payments)
          .where(
            and(
              inArray(payments.damageReportId, reportIds),
              eq(payments.type, "damage"),
              eq(payments.paid, true),
            ),
          )
      : [];

  const caseByReport = new Map<number, (typeof allCases)[number]>();
  for (const c of allCases) {
    if (c.damageReportId == null) continue;
    const prev = caseByReport.get(c.damageReportId);
    // Открытое дело важнее закрытого.
    if (!prev || (isClosed(prev.stage as Stage) && !isClosed(c.stage as Stage)))
      caseByReport.set(c.damageReportId, c);
  }
  // Старые дела «ущерб» без ссылки на акт (заводились по аренде) — к ним
  // привяжем акт этой аренды, чтобы не плодить второе дело. Закрытые тоже:
  // раньше оплату в «Должниках» акт не видел — такое дело уже погашено
  // менеджером, и заводить по акту новое нельзя. Открытые — в приоритете.
  const legacyDamageByRental = new Map<number, (typeof allCases)[number][]>();
  for (const c of allCases) {
    if (
      c.type === "damage" &&
      c.damageReportId == null &&
      c.relatedRentalId != null
    ) {
      const arr = legacyDamageByRental.get(c.relatedRentalId) ?? [];
      arr.push(c);
      legacyDamageByRental.set(c.relatedRentalId, arr);
    }
  }
  for (const arr of legacyDamageByRental.values())
    arr.sort(
      (a, b) =>
        Number(isClosed(a.stage as Stage)) - Number(isClosed(b.stage as Stage)) ||
        a.id - b.id,
    );

  const today = mskTodayYmd();
  const damageCaseIds: number[] = [];
  for (const rep of reports.sort((a, b) => a.id - b.id)) {
    const myPays = reportPays.filter((p) => p.reportId === rep.id);
    const paid = myPays.reduce((s, p) => s + p.amount, 0);
    const base = Math.max(0, rep.total - rep.depositCovered);
    const balance = Math.max(0, base - paid);
    let c = caseByReport.get(rep.id);
    if (!c) {
      const legacy = legacyDamageByRental.get(rep.rentalId)?.shift();
      if (legacy) {
        await db
          .update(debtors)
          .set({ damageReportId: rep.id, updatedAt: sql`now()` })
          .where(eq(debtors.id, legacy.id));
        c = { ...legacy, damageReportId: rep.id };
        caseByReport.set(rep.id, c);
        result.updated += 1;
      }
    }
    if (!c) {
      if (balance <= 0 || rep.clientId == null) continue;
      const due = rep.payDueDate ?? null;
      const [row] = await db
        .insert(debtors)
        .values({
          caseNumber: nextCaseNumber(),
          clientId: rep.clientId,
          type: "damage",
          stage: "created",
          totalAmount: base,
          relatedRentalId: rep.rentalId,
          damageReportId: rep.id,
          // Срок из акта ещё не наступил — ждём оплату; прошёл/не задан —
          // дело сразу в работе (спросим «Пришла ли оплата?»).
          paymentDueDate: due,
          penaltyFrom: due,
          comment: `Ущерб по акту о повреждениях · аренда #${pad4(rep.rentalId)}`,
        })
        .returning();
      if (!row) continue;
      await db.insert(debtorStageEvents).values({
        debtorId: row.id,
        fromStage: null,
        toStage: "created",
        reason: due && due >= today
          ? `авто: акт о повреждениях, ждём оплату до ${due.split("-").reverse().join(".")}`
          : "авто: акт о повреждениях",
      });
      // История: оплаты по акту, принятые ДО дела, — строками в деле.
      let n = 0;
      for (const p of myPays.sort(
        (a, b) =>
          (a.paidAt ?? a.createdAt).getTime() - (b.paidAt ?? b.createdAt).getTime(),
      )) {
        n += 1;
        const at = p.paidAt ?? p.createdAt;
        await db.insert(debtorPayments).values({
          debtorId: row.id,
          n,
          scheduledDate: at.toISOString().slice(0, 10),
          scheduledAmount: p.amount,
          paidAt: at,
          paidAmount: p.amount,
          paidMethod: p.method === "cash" ? "cash" : "transfer",
          paidByUserId: p.receivedByUserId,
          note: "Оплачено по акту в карточке аренды",
        });
      }
      damageCaseIds.push(row.id);
      result.created += 1;
      continue;
    }
    if (isClosed(c.stage as Stage)) {
      // Закрыли автоматически «акт оплачен», а по акту снова долг (оплату
      // отменили / акт увеличили) — дело снова в работу, иначе долг потеряется.
      if (
        c.stage === "closed_paid" &&
        c.closedReason === DAMAGE_PAID_REASON &&
        balance > 0
      ) {
        await db
          .update(debtors)
          .set({
            stage: "created",
            clientStatus: "active",
            stageEnteredAt: sql`now()`,
            closedAt: null,
            closedReason: null,
            updatedAt: sql`now()`,
          })
          .where(eq(debtors.id, c.id));
        await db.insert(debtorStageEvents).values({
          debtorId: c.id,
          fromStage: "closed_paid",
          toStage: "created",
          reason: `авто: по акту снова долг ${balance.toLocaleString("ru-RU")} ₽ (оплату отменили или акт изменили)`,
        });
        damageCaseIds.push(c.id);
        result.updated += 1;
      }
      continue;
    }
    damageCaseIds.push(c.id);
  }

  // Суммы и авто-закрытие открытых дел ущерба — через общий расчёт.
  if (damageCaseIds.length > 0) {
    const open = await db
      .select()
      .from(debtors)
      .where(inArray(debtors.id, damageCaseIds));
    const fin = await loadCaseFinance(open);
    for (const c of open) {
      const f = fin.get(c.id);
      if (!f || f.reportBalance == null) continue;
      const patch: Partial<typeof debtors.$inferInsert> = {};
      if (c.totalAmount !== f.total) patch.totalAmount = f.total;
      // Ущерб возмещён полностью — пеня дальше не капает.
      if (c.penaltyEnabled && f.reportBalance === 0 && !c.penaltyUntil)
        patch.penaltyUntil = today;
      if (Object.keys(patch).length > 0) {
        await db
          .update(debtors)
          .set({ ...patch, updatedAt: sql`now()` })
          .where(eq(debtors.id, c.id));
        result.updated += 1;
      }
      if (f.remaining <= 0) {
        await closeCase(c, DAMAGE_PAID_REASON, "авто: акт оплачен");
        result.closed += 1;
      }
    }
  }

  // ============ 1b. Дела по выкупу — сумма по графику сделки ============
  const buyoutOpen = allCases.filter(
    (c) => c.buyoutDealId != null && !isClosed(c.stage as Stage),
  );
  if (buyoutOpen.length > 0) {
    const fin = await loadCaseFinance(buyoutOpen);
    for (const c of buyoutOpen) {
      const f = fin.get(c.id);
      if (!f) continue;
      if (f.remaining <= 0) {
        await closeCase(c, "Просрочка по выкупу погашена", "авто: по графику выкупа долга нет");
        result.closed += 1;
      } else if (c.totalAmount !== f.total) {
        await db
          .update(debtors)
          .set({ totalAmount: f.total, updatedAt: sql`now()` })
          .where(eq(debtors.id, c.id));
        result.updated += 1;
      }
    }
  }

  // ============ 2. Долг за аренду — только закрытые с долгом ============
  // Любое прежнее дело по аренде (в т.ч. закрытое) — значит, по ней уже
  // работали: новое дело «за аренду» не заводим (как и раньше).
  // Дела ущерба не в счёт: аренду с ущербом часто закрывают и с долгом за
  // аренду — это два разных дела.
  const anyCaseRental = new Set(
    allCases
      .filter((c) => c.type !== "damage" && c.damageReportId == null)
      .map((c) => c.relatedRentalId)
      .filter((x): x is number => x != null),
  );
  const rentCasesByRental = new Map<number, (typeof allCases)[number][]>();
  for (const c of allCases) {
    if (c.relatedRentalId == null || c.damageReportId != null) continue;
    if (c.type === "damage" || c.buyoutDealId != null) continue;
    const arr = rentCasesByRental.get(c.relatedRentalId) ?? [];
    arr.push(c);
    rentCasesByRental.set(c.relatedRentalId, arr);
  }
  const openRentCaseRentalIds = [...rentCasesByRental.entries()]
    .filter(([, cs]) => cs.some((c) => !isClosed(c.stage as Stage)))
    .map(([rid]) => rid);

  const rentalRows = await db
    .select({
      id: rentals.id,
      clientId: rentals.clientId,
      status: rentals.status,
      rate: rentals.rate,
      rateUnit: rentals.rateUnit,
      endPlannedAt: rentals.endPlannedAt,
      equipmentJson: rentals.equipmentJson,
    })
    .from(rentals)
    .where(
      openRentCaseRentalIds.length > 0
        ? or(
            eq(rentals.status, "completed"),
            inArray(rentals.id, openRentCaseRentalIds),
          )
        : eq(rentals.status, "completed"),
    );
  if (rentalRows.length === 0) return result;
  const ids = rentalRows.map((r) => r.id);

  const entries = await db
    .select()
    .from(debtEntries)
    .where(inArray(debtEntries.rentalId, ids));
  const unpaidRent = await db
    .select({ rentalId: payments.rentalId, amount: payments.amount })
    .from(payments)
    .where(
      and(
        inArray(payments.rentalId, ids),
        eq(payments.type, "rent"),
        eq(payments.paid, false),
      ),
    );
  const parkingRows = await db
    .select({
      rentalId: parkingSessions.rentalId,
      amount: parkingSessions.amount,
      paidAmount: parkingSessions.paidAmount,
    })
    .from(parkingSessions)
    .where(inArray(parkingSessions.rentalId, ids));

  const rentCaseIds = rentalRows.flatMap(
    (r) => rentCasesByRental.get(r.id)?.map((c) => c.id) ?? [],
  );
  const moduleManaged = new Set<number>();
  const modulePaidByCase = new Map<number, number>();
  if (rentCaseIds.length > 0) {
    const mPays = await db
      .select({
        debtorId: debtorPayments.debtorId,
        paidAmount: debtorPayments.paidAmount,
        paidAt: debtorPayments.paidAt,
      })
      .from(debtorPayments)
      .where(inArray(debtorPayments.debtorId, rentCaseIds));
    for (const p of mPays) {
      moduleManaged.add(p.debtorId);
      if (p.paidAt)
        modulePaidByCase.set(
          p.debtorId,
          (modulePaidByCase.get(p.debtorId) ?? 0) + (p.paidAmount ?? 0),
        );
    }
  }

  const nowMsk = toMsk(new Date());
  const todayDate = new Date(
    nowMsk.getFullYear(),
    nowMsk.getMonth(),
    nowMsk.getDate(),
  );

  for (const r of rentalRows) {
    const my = entries.filter((e) => e.rentalId === r.id);

    // Просрочка — только у ещё идущей аренды со старым открытым делом.
    let overdueBalance = 0;
    if (r.status === "active") {
      const endMsk = toMsk(r.endPlannedAt);
      const endDate = new Date(
        endMsk.getFullYear(),
        endMsk.getMonth(),
        endMsk.getDate(),
      );
      const overdueDays = Math.max(
        0,
        Math.floor((todayDate.getTime() - endDate.getTime()) / 86_400_000),
      );
      const dailyRate = overdueDailyRate(r.rate, r.rateUnit, r.equipmentJson);
      const fineCharge = Math.round(dailyRate * 0.5) * overdueDays;
      let fineSettled = 0;
      for (const e of my) {
        if (e.kind === "overdue_fine_forgive" && !e.appliedToEndPlanned)
          fineSettled += e.amount;
        else if (e.kind === "overdue_fine_payment") fineSettled += e.amount;
      }
      overdueBalance =
        dailyRate * overdueDays + Math.max(0, fineCharge - fineSettled);
    }

    let manualCharged = 0;
    let manualForgiven = 0;
    for (const e of my) {
      if (e.kind === "manual_charge") manualCharged += e.amount;
      else if (e.kind === "manual_forgive") manualForgiven += e.amount;
    }
    const manualBalance = Math.max(0, manualCharged - manualForgiven);
    const parkingBalance = parkingRows
      .filter((p) => p.rentalId === r.id)
      .reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0);
    const rentBalance = unpaidRent
      .filter((p) => p.rentalId === r.id)
      .reduce((s, p) => s + p.amount, 0);
    const outstanding =
      overdueBalance + manualBalance + parkingBalance + rentBalance;

    const cases = rentCasesByRental.get(r.id) ?? [];
    const exist =
      cases.find((c) => !isClosed(c.stage as Stage)) ?? cases[0] ?? null;

    if (!exist) {
      if (
        outstanding > 0 &&
        r.clientId != null &&
        r.status === "completed" &&
        !anyCaseRental.has(r.id)
      ) {
        await db.insert(debtors).values({
          caseNumber: nextCaseNumber(),
          clientId: r.clientId,
          type: "rental_overdue",
          stage: "created",
          totalAmount: outstanding,
          relatedRentalId: r.id,
          comment: `Аренда #${pad4(r.id)} закрыта с долгом`,
        });
        result.created += 1;
      }
      continue;
    }
    if (isClosed(exist.stage as Stage)) continue;

    // Дело новой логики («аренда закрыта с долгом») ведётся по самой аренде:
    // всего = уже принятое в «Должниках» + что ещё должен по аренде; долг
    // аренды погашен (где угодно) — дело закрыто.
    if ((exist.comment ?? "").includes(RENT_CASE_MARK)) {
      const total = (modulePaidByCase.get(exist.id) ?? 0) + outstanding;
      if (outstanding <= 0) {
        await closeCase(exist, "Долг за аренду погашен", "авто: долг аренды погашен");
        result.closed += 1;
      } else if (exist.totalAmount !== total) {
        await db
          .update(debtors)
          .set({ totalAmount: total, updatedAt: sql`now()` })
          .where(eq(debtors.id, exist.id));
        result.updated += 1;
      }
      continue;
    }

    // Дело ведётся в модуле (есть график/платежи) — сумму не перетираем,
    // закрываем, когда в модуле погашено полностью.
    if (moduleManaged.has(exist.id)) {
      if ((modulePaidByCase.get(exist.id) ?? 0) >= exist.totalAmount) {
        await closeCase(exist, "Долг погашен по графику", "авто: график погашен полностью");
        result.closed += 1;
      }
      continue;
    }
    if (outstanding > 0) {
      if (exist.totalAmount !== outstanding) {
        await db
          .update(debtors)
          .set({ totalAmount: outstanding, updatedAt: sql`now()` })
          .where(eq(debtors.id, exist.id));
        result.updated += 1;
      }
    } else {
      await closeCase(exist, "Долг за аренду погашен (авто)", "авто: долг погашен");
      result.closed += 1;
    }
  }

  return result;
}
