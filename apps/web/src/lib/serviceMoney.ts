import type { ServiceOrder } from "@/lib/api/service-orders";

/**
 * Деньги сторонних ремонтов за период (2.0.2) — одна формула для блока
 * «Ремонты» и для аналитики.
 *
 * Заказчик: «Выручка считается только при совершении оплаты… пока он в
 * работе, в выручке сумма не появляется». Поэтому:
 *   • выручка  — платежи по дате оплаты (аванс — в день, когда его взяли;
 *                возврат вычитается в день возврата);
 *   • прибыль  — по ремонтам, оплаченным полностью в этом периоде
 *                (к оплате − закуп запчастей);
 *   • ждём     — остатки по ремонтам в работе и готовым, на сейчас.
 */
export type ServiceMoney = {
  /** Принято ремонтов (по дате приёма, без отменённых). */
  accepted: number;
  revenue: number;
  cash: number;
  transfer: number;
  /** Сколько платежей попало в период. */
  payments: number;
  profit: number;
  /** Ремонтов оплачено полностью в периоде. */
  paidOrders: number;
  /** Остаток к оплате по активным ремонтам (не зависит от периода). */
  waiting: number;
  waitingOrders: number;
  /** Сколько внесено авансом по активным ремонтам. */
  advances: number;
};

const inRange = (iso: string | null, from: Date | null, to: Date | null) => {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (from && t < from.getTime()) return false;
  if (to && t > to.getTime()) return false;
  return true;
};

export function serviceMoney(
  orders: ServiceOrder[],
  from: Date | null,
  to: Date | null = null,
): ServiceMoney {
  const out: ServiceMoney = {
    accepted: 0,
    revenue: 0,
    cash: 0,
    transfer: 0,
    payments: 0,
    profit: 0,
    paidOrders: 0,
    waiting: 0,
    waitingOrders: 0,
    advances: 0,
  };
  for (const o of orders) {
    if (o.status !== "cancelled" && inRange(o.acceptedAt, from, to)) out.accepted++;
    for (const p of o.payments ?? []) {
      if (!inRange(p.paidAt, from, to)) continue;
      out.revenue += p.amount;
      out.cash += p.cashAmount;
      out.transfer += p.transferAmount;
      if (p.amount !== 0) out.payments++;
    }
    if (o.status === "paid" && inRange(o.paidAt, from, to)) {
      out.paidOrders++;
      out.profit += o.totals.profit ?? 0;
    }
    if (o.status === "in_work" || o.status === "done") {
      out.waiting += o.totals.left;
      if (o.totals.left > 0) out.waitingOrders++;
      out.advances += Math.max(0, o.totals.paid);
    }
  }
  return out;
}
