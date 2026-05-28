import { useMemo } from "react";
import { useApiRentals } from "@/lib/api/rentals";
import { useApiPayments } from "@/lib/api/payments";
import type { ApiRental } from "@/lib/api/types";

/**
 * Фактический срок аренды в днях (включая просрочку до сегодня).
 *
 * Скопировано точь-в-точь из MasterBlock.rentalActualDays (v0.6.50):
 * фактическое число дней «в аренде» = max(today, endPlanned) − start
 * для активных аренд (включая просрочку), либо endActual − start для
 * завершённых. Это реальный срок, который видит клиент: для
 * просроченной 14.05 → 16.05 (today=27.05) вернёт 13, а не 2 (плановое).
 *
 * Принимает ApiRental (startAt/endPlannedAt/endActualAt — ISO-строки).
 * Минимум 1.
 */
function rentalActualDays(r: ApiRental): number {
  const start = r.startAt ? new Date(r.startAt) : null;
  if (!start || Number.isNaN(start.getTime())) return r.days ?? 0;
  const endPlanned = r.endPlannedAt ? new Date(r.endPlannedAt) : null;
  const endActual = r.endActualAt ? new Date(r.endActualAt) : null;
  const today = new Date();
  let endMs: number;
  if (endActual && !Number.isNaN(endActual.getTime())) {
    endMs = endActual.getTime();
  } else if (endPlanned && !Number.isNaN(endPlanned.getTime())) {
    endMs = Math.max(endPlanned.getTime(), today.getTime());
  } else {
    endMs = today.getTime();
  }
  const days = Math.ceil((endMs - start.getTime()) / 86_400_000);
  return Math.max(1, days);
}

export interface ClientStats {
  /** Реально оплачено клиентом за всё время (paid платежи, кроме deposit/refund). */
  totalPaid: number;
  /** Фактический суммарный срок аренд клиента в днях (с учётом просрочки). */
  totalDays: number;
}

/**
 * Единый источник статистики клиента: «принёс» (реально оплачено) и
 * «дней в аренде» (фактический срок с учётом просрочки). Используется
 * и в карточке аренды (MasterBlock), и в быстром просмотре клиента
 * (ClientQuickView) — чтобы числа совпадали.
 */
export function useClientStats(clientId: number | null | undefined): ClientStats {
  const { data: allRentals = [] } = useApiRentals();
  const { data: allPayments = [] } = useApiPayments();
  return useMemo(() => {
    if (clientId == null) return { totalPaid: 0, totalDays: 0 };
    const clientRentals = allRentals.filter((r) => r.clientId === clientId);
    const rentalIds = new Set(clientRentals.map((r) => r.id));
    const totalDays = clientRentals.reduce(
      (s, r) => s + rentalActualDays(r),
      0,
    );
    const totalPaid = allPayments.reduce((s, p) => {
      if (!p.paid) return s;
      if (!rentalIds.has(p.rentalId)) return s;
      if (p.type === "deposit" || p.type === "refund") return s;
      return s + p.amount;
    }, 0);
    return { totalPaid, totalDays };
  }, [clientId, allRentals, allPayments]);
}
