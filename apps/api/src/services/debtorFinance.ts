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
import { damageReports, debtorPayments, payments } from "../db/schema.js";

/**
 * Причина авто-закрытия дела ущерба «акт оплачен». По ней (и только по ней)
 * sync снова открывает дело, если оплату отменили или акт увеличили —
 * старые закрытия с другими причинами не трогаем.
 */
export const DAMAGE_PAID_REASON = "Ущерб возмещён полностью";

/**
 * Метка в комментарии дела «долг за аренду», заведённого новой логикой
 * (аренду закрыли с долгом). Такие дела ведутся по самой аренде: платёж в
 * «Должниках» гасит долг аренды, оплата в аренде закрывает дело. Старые дела
 * (до 23.10) с графиками менеджеров не трогаем.
 */
export const RENT_CASE_MARK = "закрыта с долгом";

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

  for (const r of rows) {
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
