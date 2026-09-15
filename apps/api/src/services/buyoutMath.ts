/**
 * Расчёты «аренды с выкупом» (01.09).
 *
 * Правила заказчика:
 *   • стоимость техники увеличивается на наценку за срок: 1 мес +10 000,
 *     2 мес +20 000, 3 мес +30 000, 4 мес +35 000, 5 мес +40 000,
 *     6 мес +45 000. Справочник меняется с ключом директора;
 *   • клиент вносит первоначальный взнос, остаток гасится равными
 *     платежами — раз в месяц или раз в неделю;
 *   • копейки не размазываем: все платежи одинаковые, а разницу
 *     округления добирает ПОСЛЕДНИЙ платёж. Так в графике нет «1 233,33»,
 *     и сумма графика точно равна остатку.
 */

export const DEFAULT_MARKUPS: Record<number, number> = {
  1: 10_000,
  2: 20_000,
  3: 30_000,
  4: 35_000,
  5: 40_000,
  6: 45_000,
};

export type BuyoutPeriod = "month" | "week";

export type BuyoutTerms = {
  scooterPrice: number;
  termMonths: number;
  markup: number;
  total: number;
  downPayment: number;
  financed: number;
  period: BuyoutPeriod;
  paymentAmount: number;
  paymentsCount: number;
};

/** Сколько платежей в сделке: помесячно — по числу месяцев, понедельно — 4 в месяц. */
export function paymentsCount(termMonths: number, period: BuyoutPeriod): number {
  return period === "week" ? termMonths * 4 : termMonths;
}

export function computeTerms(input: {
  scooterPrice: number;
  termMonths: number;
  downPayment: number;
  period: BuyoutPeriod;
  markups?: Record<number, number>;
}): BuyoutTerms {
  const markups = input.markups ?? DEFAULT_MARKUPS;
  const term = Math.max(1, Math.round(input.termMonths));
  const markup = markups[term] ?? 0;
  const total = Math.max(0, Math.round(input.scooterPrice)) + markup;
  const down = Math.min(Math.max(0, Math.round(input.downPayment)), total);
  const financed = total - down;
  const count = paymentsCount(term, input.period);
  // Базовый платёж округляем вверх до сотни — так суммы «человеческие»,
  // а последний платёж добирает остаток (он всегда не больше базового).
  const raw = count > 0 ? financed / count : 0;
  const payment = count > 0 ? Math.ceil(raw / 100) * 100 : 0;
  return {
    scooterPrice: Math.round(input.scooterPrice),
    termMonths: term,
    markup,
    total,
    downPayment: down,
    financed,
    period: input.period,
    paymentAmount: payment,
    paymentsCount: count,
  };
}

export type ScheduleRow = { seq: number; dueDate: string; amount: number };

/** «2026-09-01» + n периодов. */
function addPeriod(iso: string, period: BuyoutPeriod, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  if (period === "week") d.setDate(d.getDate() + 7 * n);
  else d.setMonth(d.getMonth() + n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * График платежей от даты первого платежа. Последняя строка добирает
 * остаток, поэтому сумма графика ровно равна финансируемой части.
 */
export function buildSchedule(
  terms: BuyoutTerms,
  startDate: string,
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let left = terms.financed;
  for (let i = 0; i < terms.paymentsCount; i++) {
    const last = i === terms.paymentsCount - 1;
    const amount = last ? left : Math.min(terms.paymentAmount, left);
    rows.push({
      seq: i + 1,
      dueDate: addPeriod(startDate, terms.period, i),
      amount: Math.max(0, amount),
    });
    left -= amount;
    if (left <= 0 && !last) {
      // Взнос закрыл почти всё — лишние строки не создаём.
      break;
    }
  }
  return rows;
}

/**
 * Разносит платёж по графику: гасим ближайшие непогашенные строки.
 * Возвращает, что записать в каждую строку и сколько денег осталось
 * неразнесённым (переплата — она уходит в «досрочно»).
 */
export function applyPayment(
  rows: { id: number; amount: number; paidAmount: number }[],
  amount: number,
): { updates: { id: number; paidAmount: number; closed: boolean }[]; rest: number } {
  let left = Math.max(0, Math.round(amount));
  const updates: { id: number; paidAmount: number; closed: boolean }[] = [];
  for (const r of rows) {
    if (left <= 0) break;
    const need = r.amount - r.paidAmount;
    if (need <= 0) continue;
    const take = Math.min(need, left);
    left -= take;
    updates.push({
      id: r.id,
      paidAmount: r.paidAmount + take,
      closed: r.paidAmount + take >= r.amount,
    });
  }
  return { updates, rest: left };
}

export type BuyoutProgress = {
  /** Сколько всего должен по графику. */
  due: number;
  /** Сколько внесено по графику. */
  paid: number;
  /** Остаток к выплате. */
  left: number;
  /** Процент погашения (с учётом первоначального взноса). */
  percent: number;
  /** Сколько платежей закрыто и сколько осталось. */
  paidCount: number;
  leftCount: number;
  /** Просроченные строки и сумма просрочки. */
  overdueCount: number;
  overdueAmount: number;
  /** Дней просрочки по самой старой неоплаченной строке. */
  overdueDays: number;
  /** Ближайший платёж. */
  nextDue: { date: string; amount: number } | null;
};

export function computeProgress(
  deal: { downPayment: number; total: number },
  rows: { dueDate: string; amount: number; paidAmount: number }[],
  today = new Date(),
): BuyoutProgress {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  let due = 0;
  let paid = 0;
  let paidCount = 0;
  let leftCount = 0;
  let overdueCount = 0;
  let overdueAmount = 0;
  let overdueDays = 0;
  let nextDue: { date: string; amount: number } | null = null;

  for (const r of rows) {
    due += r.amount;
    paid += Math.min(r.paidAmount, r.amount);
    const closed = r.paidAmount >= r.amount;
    if (closed) {
      paidCount++;
      continue;
    }
    leftCount++;
    const d = new Date(`${r.dueDate}T00:00:00`);
    if (d.getTime() < t.getTime()) {
      overdueCount++;
      overdueAmount += r.amount - r.paidAmount;
      const days = Math.round((t.getTime() - d.getTime()) / 86_400_000);
      if (days > overdueDays) overdueDays = days;
    } else if (!nextDue) {
      nextDue = { date: r.dueDate, amount: r.amount - r.paidAmount };
    }
  }

  const totalPaid = paid + deal.downPayment;
  return {
    due,
    paid,
    left: Math.max(0, due - paid),
    percent:
      deal.total > 0 ? Math.min(100, Math.round((totalPaid / deal.total) * 100)) : 0,
    paidCount,
    leftCount,
    overdueCount,
    overdueAmount,
    overdueDays,
    nextDue,
  };
}

/**
 * Платёжная дисциплина клиента — для рейтинга.
 * Считаем по закрытым строкам: вовремя ли пришли деньги.
 */
export function computeDiscipline(
  rows: { dueDate: string; paidAmount: number; amount: number; paidAt: Date | null }[],
): { onTime: number; late: number; avgLateDays: number; score: number } {
  let onTime = 0;
  let late = 0;
  let lateDaysSum = 0;
  for (const r of rows) {
    if (r.paidAmount < r.amount || !r.paidAt) continue;
    const due = new Date(`${r.dueDate}T23:59:59`);
    const days = Math.round(
      (r.paidAt.getTime() - due.getTime()) / 86_400_000,
    );
    if (days <= 0) onTime++;
    else {
      late++;
      lateDaysSum += days;
    }
  }
  const total = onTime + late;
  return {
    onTime,
    late,
    avgLateDays: late > 0 ? Math.round(lateDaysSum / late) : 0,
    // 100 — платит идеально; каждая просрочка снижает, длинные — сильнее.
    score:
      total === 0
        ? 100
        : Math.max(
            0,
            Math.round(
              (onTime / total) * 100 - Math.min(30, (lateDaysSum / total) * 2),
            ),
          ),
  };
}
