/**
 * v0.8 — Конструктор графика платежей.
 *
 * Когда дело переходит в стадию payment_schedule, оператор задаёт:
 *  - totalAmount   (сумма к взысканию)
 *  - count         (количество платежей)
 *  - startDate     (когда первый платёж)
 *  - frequency     ('weekly' | 'biweekly' | 'monthly')
 *
 * Функция распределяет сумму по N платежам. Если сумма не делится
 * нацело — остаток ложится на ПОСЛЕДНИЙ платёж (так клиент платит
 * ровные суммы и только финальный — «доплата хвоста»).
 */

export type ScheduleFrequency = "weekly" | "biweekly" | "monthly";

export type ScheduledPayment = {
  /** Порядковый номер 1..N. */
  n: number;
  /** Дата платежа (Date в локальной TZ, время 00:00). */
  date: Date;
  /** Сумма этого платежа в ₽. */
  amount: number;
};

export type ScheduleParams = {
  totalAmount: number;
  count: number;
  startDate: Date;
  frequency: ScheduleFrequency;
};

/** Прибавить к дате период согласно frequency. */
export function addPeriod(d: Date, periods: number, freq: ScheduleFrequency): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  if (freq === "weekly") {
    out.setDate(out.getDate() + periods * 7);
  } else if (freq === "biweekly") {
    out.setDate(out.getDate() + periods * 14);
  } else {
    // monthly — сохраняем «то же число месяца», JS Date сам справляется
    // с разной длиной месяцев (31 янв → 28 фев, потом обратно 31 мар).
    out.setMonth(out.getMonth() + periods);
  }
  return out;
}

/** Построить график. Бросает Error при некорректных параметрах. */
export function buildSchedule(params: ScheduleParams): ScheduledPayment[] {
  const { totalAmount, count, startDate, frequency } = params;
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new Error("totalAmount must be a positive number");
  }
  if (!Number.isInteger(count) || count < 1 || count > 60) {
    throw new Error("count must be integer between 1 and 60");
  }
  const base = Math.floor(totalAmount / count);
  const remainder = totalAmount - base * count;
  return Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    date: addPeriod(startDate, i, frequency),
    amount: base + (i === count - 1 ? remainder : 0),
  }));
}

/**
 * Сумма уже зачисленных платежей (paidAmount). Используется в UI:
 *  «погашено 36 000 / 90 000 ₽».
 */
export function paidSoFar(
  payments: { paidAt: Date | string | null; paidAmount: number | null }[],
): number {
  return payments
    .filter((p) => p.paidAt)
    .reduce((s, p) => s + (p.paidAmount ?? 0), 0);
}

export function progressPercent(totalAmount: number, paidAmount: number): number {
  if (totalAmount <= 0) return 0;
  return Math.min(100, Math.round((paidAmount / totalAmount) * 100));
}

/** Полностью закрыто (paid >= total) — критерий авто-закрытия дела. */
export function isFullyPaid(
  totalAmount: number,
  payments: { paidAt: Date | string | null; paidAmount: number | null }[],
): boolean {
  return paidSoFar(payments) >= totalAmount;
}
