/**
 * v0.6 — авто-ингест должников из аренд.
 *
 * Модуль «Должники» из main был «standalone» (дела заводят руками). По
 * требованию владельца раздел должен СОБИРАТЬ ВСЕХ автоматически: любую
 * аренду с непогашенным долгом (просрочка / ущерб / ручной / паркинг /
 * неоплаченная аренда) — заводим как дело должника, чтобы директор видел
 * всех в одном месте и работал по ним (звонки, заметки, стадии).
 *
 * Дедуп — по relatedRentalId (одно дело на аренду). Идемпотентно:
 *   • нет дела + есть долг → создаём (stage='created');
 *   • есть открытое дело + долг изменился → обновляем totalAmount;
 *   • есть открытое дело + долг = 0 → авто-закрываем (closed_paid);
 *   • дело уже закрыто (оператором/авто) → не трогаем.
 *
 * Расчёт долга повторяет debt-aggregate (rentals.ts) — держим в изоляции,
 * чтобы не трогать рабочий путь дашборда. Если формула там поменяется —
 * синхронизировать здесь (помечено).
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
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

const MSK = "Europe/Moscow";
const toMsk = (d: Date) =>
  new Date(d.toLocaleString("en-US", { timeZone: MSK }));

export type DebtorSyncResult = {
  created: number;
  updated: number;
  closed: number;
};

/**
 * Пересобирает дела-должники из текущих долгов по арендам.
 * Возвращает счётчики. Бросает только на реальных ошибках БД —
 * вызывающий оборачивает в try/catch, чтобы не ронять список.
 */
export async function syncRentalDebtorCases(): Promise<DebtorSyncResult> {
  const result: DebtorSyncResult = { created: 0, updated: 0, closed: 0 };

  // 1. Аренды (не архивные). Активные дают просрочку; завершённые —
  //    ущерб/ручной/паркинг/неоплату (долг живёт после закрытия аренды).
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
    .where(isNull(rentals.archivedAt));
  if (rentalRows.length === 0) return result;

  const ids = rentalRows.map((r) => r.id);

  // 2. Источники долга по этим арендам.
  const entries = await db
    .select()
    .from(debtEntries)
    .where(inArray(debtEntries.rentalId, ids));
  const dmgRows = await db
    .select({
      id: damageReports.id,
      rentalId: damageReports.rentalId,
      total: damageReports.total,
      depositCovered: damageReports.depositCovered,
    })
    .from(damageReports)
    .where(inArray(damageReports.rentalId, ids));
  const dmgPays = await db
    .select({
      rentalId: payments.rentalId,
      amount: payments.amount,
      damageReportId: payments.damageReportId,
    })
    .from(payments)
    .where(
      and(
        inArray(payments.rentalId, ids),
        eq(payments.type, "damage"),
        eq(payments.paid, true),
      ),
    );
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

  // 3. Уже существующие дела, привязанные к этим арендам.
  const existing = await db
    .select()
    .from(debtors)
    .where(inArray(debtors.relatedRentalId, ids));
  const byRental = new Map<number, (typeof existing)[number]>();
  for (const d of existing) {
    if (d.relatedRentalId != null) byRental.set(d.relatedRentalId, d);
  }

  // 3b. Платежи модуля «Должники» по этим делам. Если у дела есть свой
  //     график/платежи — оно «ведётся в модуле»: источник истины теперь
  //     модуль (debtorPayments), а не агрегат аренды. Sync такое дело не
  //     перетирает по сумме, а лишь авто-закрывает при полном погашении.
  const moduleManaged = new Set<number>();
  const modulePaidByCase = new Map<number, number>();
  const existIds = existing.map((e) => e.id);
  if (existIds.length > 0) {
    const mPays = await db
      .select({
        debtorId: debtorPayments.debtorId,
        paidAmount: debtorPayments.paidAmount,
        paidAt: debtorPayments.paidAt,
      })
      .from(debtorPayments)
      .where(inArray(debtorPayments.debtorId, existIds));
    for (const p of mPays) {
      moduleManaged.add(p.debtorId);
      if (p.paidAt) {
        modulePaidByCase.set(
          p.debtorId,
          (modulePaidByCase.get(p.debtorId) ?? 0) + (p.paidAmount ?? 0),
        );
      }
    }
  }

  // 4. Стартовый номер дела (D-NNN) — инкрементим локально на каждую вставку.
  const [maxRow] = await db
    .select({
      maxNum: sql<number>`COALESCE(MAX(CAST(SUBSTRING(case_number FROM 3) AS INTEGER)), 0)`,
    })
    .from(debtors);
  let seq = Number(maxRow?.maxNum ?? 0);

  // «Сегодня» по МСК (как в debt-aggregate).
  const nowMsk = toMsk(new Date());
  const today = new Date(
    nowMsk.getFullYear(),
    nowMsk.getMonth(),
    nowMsk.getDate(),
  );

  for (const r of rentalRows) {
    const my = entries.filter((e) => e.rentalId === r.id);

    // --- просрочка (только для активных аренд) ---
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
        Math.floor((today.getTime() - endDate.getTime()) / 86_400_000),
      );
      // v0.9: ₽/сут = аренда/сут (weekly /7) + платная экипировка/сут
      // (синхронно с debt-aggregate в rentals.ts).
      const dailyRate = overdueDailyRate(r.rate, r.rateUnit, r.equipmentJson);
      const daysCharge = dailyRate * overdueDays;
      const fineCharge = Math.round(dailyRate * 0.5) * overdueDays;
      let fineForgive = 0;
      let finePay = 0;
      for (const e of my) {
        // v0.9.1: штраф, прощённый вместе с днями (appliedToEndPlanned=true),
        // уже учтён через сдвиг endPlanned → не вычитаем повторно (двойной счёт).
        if (e.kind === "overdue_fine_forgive" && !e.appliedToEndPlanned)
          fineForgive += e.amount;
        else if (e.kind === "overdue_fine_payment") finePay += e.amount;
      }
      const fineBalance = Math.max(0, fineCharge - fineForgive - finePay);
      overdueBalance = daysCharge + fineBalance;
    }

    // --- ручной долг (любые аренды) ---
    let manualCharged = 0;
    let manualForgiven = 0;
    for (const e of my) {
      if (e.kind === "manual_charge") manualCharged += e.amount;
      else if (e.kind === "manual_forgive") manualForgiven += e.amount;
    }
    const manualBalance = Math.max(0, manualCharged - manualForgiven);

    // --- ущерб (любые аренды): total − зачёт залога − оплачено ---
    let damageBalance = 0;
    for (const dr of dmgRows.filter((d) => d.rentalId === r.id)) {
      const paid = dmgPays
        .filter((p) => p.rentalId === r.id && p.damageReportId === dr.id)
        .reduce((s, p) => s + p.amount, 0);
      damageBalance += Math.max(0, dr.total - dr.depositCovered - paid);
    }

    // --- паркинг (неоплаченный остаток) ---
    const parkingBalance = parkingRows
      .filter((p) => p.rentalId === r.id)
      .reduce((s, p) => s + Math.max(0, p.amount - p.paidAmount), 0);

    // --- неоплаченная аренда ---
    const rentBalance = unpaidRent
      .filter((p) => p.rentalId === r.id)
      .reduce((s, p) => s + p.amount, 0);

    const outstanding =
      overdueBalance +
      manualBalance +
      damageBalance +
      parkingBalance +
      rentBalance;
    // Тип дела: ущерб приоритетнее (своё дерево стадий), иначе просрочка.
    const type: "damage" | "rental_overdue" =
      damageBalance > 0 ? "damage" : "rental_overdue";

    const exist = byRental.get(r.id);

    if (!exist) {
      // нет дела — создаём, если есть долг и привязан клиент CRM.
      if (outstanding > 0 && r.clientId != null) {
        seq += 1;
        const caseNumber = `D-${String(seq).padStart(3, "0")}`;
        await db.insert(debtors).values({
          caseNumber,
          clientId: r.clientId,
          type,
          stage: "created",
          totalAmount: outstanding,
          relatedRentalId: r.id,
          comment: `Автозаведено из аренды #${String(r.id).padStart(4, "0")}`,
        });
        result.created += 1;
      }
      continue;
    }

    // дело уже закрыто (оператором/авто) — не трогаем.
    if (isClosed(exist.stage as Stage)) continue;

    // Дело ведётся в модуле «Должники» (есть график/платежи) — источник
    // истины модуль. Не перетираем totalAmount агрегатом аренды; закрываем
    // только если в модуле погашено полностью.
    if (moduleManaged.has(exist.id)) {
      const modulePaid = modulePaidByCase.get(exist.id) ?? 0;
      if (modulePaid >= exist.totalAmount) {
        await db
          .update(debtors)
          .set({
            stage: "closed_paid",
            clientStatus: "closed",
            stageEnteredAt: sql`now()`,
            closedAt: sql`now()`,
            closedReason: "Долг погашен по графику",
            updatedAt: sql`now()`,
          })
          .where(eq(debtors.id, exist.id));
        await db.insert(debtorStageEvents).values({
          debtorId: exist.id,
          fromStage: exist.stage,
          toStage: "closed_paid",
          reason: "авто: график погашен полностью",
        });
        result.closed += 1;
      }
      continue;
    }

    if (outstanding > 0) {
      // обновляем сумму, если изменилась (тип не меняем — стадии привязаны).
      if (exist.totalAmount !== outstanding) {
        await db
          .update(debtors)
          .set({ totalAmount: outstanding, updatedAt: sql`now()` })
          .where(eq(debtors.id, exist.id));
        result.updated += 1;
      }
    } else {
      // долг погашен → авто-закрытие.
      await db
        .update(debtors)
        .set({
          stage: "closed_paid",
          clientStatus: "closed",
          stageEnteredAt: sql`now()`,
          closedAt: sql`now()`,
          closedReason: "Долг погашен (авто)",
          updatedAt: sql`now()`,
        })
        .where(eq(debtors.id, exist.id));
      await db.insert(debtorStageEvents).values({
        debtorId: exist.id,
        fromStage: exist.stage,
        toStage: "closed_paid",
        reason: "авто: долг погашен",
      });
      result.closed += 1;
    }
  }

  return result;
}
