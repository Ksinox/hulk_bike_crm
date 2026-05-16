/**
 * v0.8 — Детекция просрочек по графику платежей.
 *
 * Просроченный платёж — это запись с scheduled_date в прошлом и paid_at = null.
 * «Систематические нарушения» = 3 и более подряд (триггер эскалации к юристу).
 */

export type PaymentForOverdue = {
  scheduledDate: string | Date;
  scheduledAmount: number;
  paidAt: Date | string | null;
};

/** Дата → начало дня в локальной TZ (00:00:00). */
function dayStart(d: Date | string): Date {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

/** Платёж просрочен на дату today? */
export function isPaymentOverdue(
  p: PaymentForOverdue,
  today: Date = new Date(),
): boolean {
  if (p.paidAt) return false;
  return dayStart(p.scheduledDate).getTime() < dayStart(today).getTime();
}

/** Все просроченные платежи. */
export function getOverduePayments(
  payments: PaymentForOverdue[],
  today: Date = new Date(),
): PaymentForOverdue[] {
  return payments.filter((p) => isPaymentOverdue(p, today));
}

/**
 * Сколько просрочек ПОДРЯД считая от самой свежей.
 * Логика: идём по платежам в хронологическом порядке, смотрим самые
 * последние неоплаченные просроченные. Когда встречаем оплаченный
 * платёж — серия прерывается.
 */
export function getConsecutiveOverdueCount(
  payments: PaymentForOverdue[],
  today: Date = new Date(),
): number {
  // Сортируем по дате убывания: сначала самые свежие платежи.
  const sorted = [...payments].sort(
    (a, b) =>
      dayStart(b.scheduledDate).getTime() - dayStart(a.scheduledDate).getTime(),
  );
  // Идём от самых свежих, считаем подряд идущие overdue до первого paid.
  let count = 0;
  for (const p of sorted) {
    if (isPaymentOverdue(p, today)) {
      count++;
      continue;
    }
    if (p.paidAt) break; // серия прервалась
    // не paid и не overdue → это будущий плановый, пропускаем
  }
  return count;
}

/** Систематическое нарушение — 3 пропуска подряд. */
export function hasSystematicViolations(
  payments: PaymentForOverdue[],
  today: Date = new Date(),
): boolean {
  return getConsecutiveOverdueCount(payments, today) >= 3;
}

/**
 * Длина просрочки в днях (от первой неоплаченной просроченной до сегодня).
 * Возвращает 0 если просрочек нет.
 */
export function overdueDays(
  payments: PaymentForOverdue[],
  today: Date = new Date(),
): number {
  const overdue = getOverduePayments(payments, today);
  if (overdue.length === 0) return 0;
  // Берём самую СТАРУЮ просрочку
  const oldest = overdue.reduce((a, b) =>
    dayStart(a.scheduledDate).getTime() < dayStart(b.scheduledDate).getTime() ? a : b,
  );
  const diffMs = dayStart(today).getTime() - dayStart(oldest.scheduledDate).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/** Сумма просроченных платежей. */
export function overdueAmount(
  payments: PaymentForOverdue[],
  today: Date = new Date(),
): number {
  return getOverduePayments(payments, today).reduce(
    (s, p) => s + p.scheduledAmount,
    0,
  );
}
