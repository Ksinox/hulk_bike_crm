import type { ApiPayment } from "@/lib/api/payments";

/**
 * Единая формула «выручки» для всей системы.
 *
 * В выручку попадают только фактически оплаченные платежи (paid=true)
 * любого типа КРОМЕ:
 *  - 'deposit'  — залог возвратный, не доход
 *  - 'refund'   — возврат денег клиенту, отрицательная операция
 *
 * Платежи типа 'rent', 'damage', 'fine', 'swap_fee' учитываются как
 * выручка. Эта же формула используется на дашборде и в бейдже /rentals —
 * чтобы цифры везде совпадали.
 *
 * Окно фильтрации (v0.4.0 после аудита):
 *  - rangeStart — включительно (paidAt >= rangeStart)
 *  - rangeEnd   — ИСКЛЮЧИТЕЛЬНО (paidAt < rangeEnd)
 * Это совпадает с семантикой `BillingPeriod` в lib/billingPeriod —
 * период [start, end), где end = первая секунда следующего периода.
 * Раньше end был «<=», и платёж ровно в полночь следующего периода
 * мог попасть и в этот, и в следующий период (двойной счёт).
 */
export function revenueFromPayments(
  payments: readonly ApiPayment[],
  rangeStart?: Date,
  rangeEnd?: Date,
): number {
  return payments
    .filter((p) => {
      if (!p.paid) return false;
      if (p.type === "deposit" || p.type === "refund") return false;
      if (!p.paidAt) return false;
      if (rangeStart || rangeEnd) {
        const t = new Date(p.paidAt).getTime();
        if (rangeStart && t < rangeStart.getTime()) return false;
        if (rangeEnd && t >= rangeEnd.getTime()) return false;
      }
      return true;
    })
    .reduce((s, p) => s + p.amount, 0);
}
