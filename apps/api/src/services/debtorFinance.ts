/**
 * Партия 23.10 — деньги по делу должника.
 *
 * Дело ущерба (damageReportId) — зеркало акта о повреждениях. Источник правды
 * по ущербу один: акт и платежи ущерба по нему (payments.type='damage'). Так
 * оплата, принятая хоть в карточке аренды, хоть в «Должниках», хоть отменённая
 * откатом, сразу видна в обоих местах.
 *
 *   база   = акт.total − зачёт залога
 *   пеня   = 1 000 ₽ × дней с penaltyFrom (п. 5.7 договора), если включена
 *   итого  = база + пеня
 *   оплачено = платежи ущерба по акту + части платежей модуля, ушедшие на пеню
 *
 * Прочие дела (долг аренды, ДТП, угон…) — как раньше: итог = totalAmount,
 * оплачено = платежи модуля (debtor_payments).
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  buyoutDeals,
  buyoutPayments,
  buyoutSchedule,
  damageReports,
  debtorPayments,
  payments,
} from "../db/schema.js";
import { computeProgress } from "./buyoutMath.js";
import { rentOutstanding, rentPaidSince } from "./debtorLedger.js";

/**
 * Причина авто-закрытия дела ущерба «акт оплачен». По ней (и только по ней)
 * sync снова открывает дело, если оплату отменили или акт увеличили —
 * старые закрытия с другими причинами не трогаем.
 */
export const DAMAGE_PAID_REASON = "Ущерб возмещён полностью";

/** П. 5.7 договора: 1 000 ₽ за каждый день неоплаты ущерба. */
export const PENALTY_PER_DAY = 1000;

/** «Сегодня» по МСК в формате YYYY-MM-DD. */
export function mskTodayYmd(now: Date = new Date()): string {
  const d = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Календарных дней от a до b (YYYY-MM-DD), не меньше 0. */
export function daysBetweenYmd(a: string, b: string): number {
  const ms =
    new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() -
    new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime();
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

export function addDaysYmd(ymd: string, days: number): string {
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type CaseFinance = {
  /** Сумма по акту (за вычетом залога) — для дел ущерба; иначе totalAmount. */
  base: number;
  penalty: number;
  penaltyDays: number;
  total: number;
  paid: number;
  remaining: number;
  /** Только у дел ущерба: остаток именно по акту (без пени). */
  reportBalance: number | null;
};

type CaseRow = {
  id: number;
  totalAmount: number;
  damageReportId: number | null;
  buyoutDealId?: number | null;
  createdAt?: Date;
  type?: string;
  relatedRentalId?: number | null;
  penaltyEnabled: boolean;
  penaltyFrom: string | null;
  penaltyUntil: string | null;
};

export function penaltyFor(
  c: Pick<CaseRow, "penaltyEnabled" | "penaltyFrom" | "penaltyUntil">,
  today: string = mskTodayYmd(),
): { days: number; amount: number } {
  if (!c.penaltyEnabled || !c.penaltyFrom) return { days: 0, amount: 0 };
  const until = c.penaltyUntil && c.penaltyUntil < today ? c.penaltyUntil : today;
  const days = daysBetweenYmd(c.penaltyFrom, until);
  return { days, amount: days * PENALTY_PER_DAY };
}

/** Деньги по набору дел одним проходом (3 запроса на любое число дел). */
export async function loadCaseFinance(
  rows: CaseRow[],
): Promise<Map<number, CaseFinance>> {
  const out = new Map<number, CaseFinance>();
  if (rows.length === 0) return out;
  const today = mskTodayYmd();
  const caseIds = rows.map((r) => r.id);
  const reportIds = rows
    .map((r) => r.damageReportId)
    .filter((x): x is number => x != null);

  const dps = await db
    .select({
      debtorId: debtorPayments.debtorId,
      paidAt: debtorPayments.paidAt,
      paidAmount: debtorPayments.paidAmount,
      penaltyAmount: debtorPayments.penaltyAmount,
    })
    .from(debtorPayments)
    .where(inArray(debtorPayments.debtorId, caseIds));
  const modulePaid = new Map<number, number>();
  const penaltyPaid = new Map<number, number>();
  for (const p of dps) {
    if (!p.paidAt) continue;
    modulePaid.set(p.debtorId, (modulePaid.get(p.debtorId) ?? 0) + (p.paidAmount ?? 0));
    penaltyPaid.set(p.debtorId, (penaltyPaid.get(p.debtorId) ?? 0) + (p.penaltyAmount ?? 0));
  }

  const reports = new Map<number, { total: number; depositCovered: number }>();
  const reportPaid = new Map<number, number>();
  if (reportIds.length > 0) {
    const rs = await db
      .select({
        id: damageReports.id,
        total: damageReports.total,
        depositCovered: damageReports.depositCovered,
      })
      .from(damageReports)
      .where(inArray(damageReports.id, reportIds));
    for (const r of rs) reports.set(r.id, r);
    const ps = await db
      .select({ reportId: payments.damageReportId, amount: payments.amount })
      .from(payments)
      .where(
        and(
          inArray(payments.damageReportId, reportIds),
          eq(payments.type, "damage"),
          eq(payments.paid, true),
        ),
      );
    for (const p of ps) {
      if (p.reportId == null) continue;
      reportPaid.set(p.reportId, (reportPaid.get(p.reportId) ?? 0) + p.amount);
    }
  }

  // Выкуп: долг = просроченные платежи графика (у сорванной сделки — весь
  // остаток); оплачено = платежи по сделке с момента передачи в «Должники».
  const dealIds = rows.map((r) => r.buyoutDealId).filter((x): x is number => x != null);
  const buyout = new Map<number, { debt: number; paidSince: (since: Date) => number }>();
  if (dealIds.length > 0) {
    const deals = await db.select().from(buyoutDeals).where(inArray(buyoutDeals.id, dealIds));
    const sched = await db.select().from(buyoutSchedule).where(inArray(buyoutSchedule.dealId, dealIds));
    const bp = await db.select().from(buyoutPayments).where(inArray(buyoutPayments.dealId, dealIds));
    for (const dl of deals) {
      const pr = computeProgress(dl, sched.filter((x) => x.dealId === dl.id));
      const debt =
        dl.status === "defaulted"
          ? pr.left
          : dl.status === "active"
            ? pr.overdueAmount
            : 0;
      const pays = bp.filter((x) => x.dealId === dl.id);
      buyout.set(dl.id, {
        debt,
        paidSince: (since) =>
          pays.filter((x) => x.paidAt >= since).reduce((s, x) => s + x.amount, 0),
      });
    }
  }

  // Долг за аренду (дело по аренде) — по самой аренде: остаток = текущий
  // долг аренды, оплачено = все платежи по ней с момента заведения дела,
  // где бы их ни приняли.
  const rentCases = rows.filter(
    (r) =>
      r.relatedRentalId != null &&
      r.damageReportId == null &&
      r.buyoutDealId == null &&
      r.type !== "damage",
  );
  const rentOut = await rentOutstanding([...new Set(rentCases.map((r) => r.relatedRentalId!))]);
  const rentPaid = await rentPaidSince(
    rentCases.map((r) => ({
      id: r.id,
      relatedRentalId: r.relatedRentalId!,
      createdAt: r.createdAt ?? new Date(0),
    })),
  );

  for (const r of rows) {
    if (rentCases.includes(r)) {
      const remaining = rentOut.get(r.relatedRentalId!) ?? 0;
      const paid = rentPaid.get(r.id) ?? 0;
      out.set(r.id, {
        base: paid + remaining,
        penalty: 0,
        penaltyDays: 0,
        total: paid + remaining,
        paid,
        remaining,
        reportBalance: null,
      });
      continue;
    }
    const bo = r.buyoutDealId != null ? buyout.get(r.buyoutDealId) : undefined;
    if (bo) {
      const paid = bo.paidSince(r.createdAt ?? new Date(0));
      out.set(r.id, {
        base: paid + bo.debt,
        penalty: 0,
        penaltyDays: 0,
        total: paid + bo.debt,
        paid,
        remaining: bo.debt,
        reportBalance: null,
      });
      continue;
    }
    const rep = r.damageReportId != null ? reports.get(r.damageReportId) : undefined;
    if (rep) {
      const base = Math.max(0, rep.total - rep.depositCovered);
      const dPaid = Math.min(base, reportPaid.get(r.damageReportId!) ?? 0);
      const reportBalance = Math.max(0, base - dPaid);
      const pen = penaltyFor(r, today);
      const pPaid = Math.min(pen.amount, penaltyPaid.get(r.id) ?? 0);
      out.set(r.id, {
        base,
        penalty: pen.amount,
        penaltyDays: pen.days,
        total: base + pen.amount,
        paid: dPaid + pPaid,
        remaining: reportBalance + Math.max(0, pen.amount - pPaid),
        reportBalance,
      });
    } else {
      const paid = modulePaid.get(r.id) ?? 0;
      out.set(r.id, {
        base: r.totalAmount,
        penalty: 0,
        penaltyDays: 0,
        total: r.totalAmount,
        paid,
        remaining: Math.max(0, r.totalAmount - paid),
        reportBalance: null,
      });
    }
  }
  return out;
}
