import { useMemo } from "react";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useDebtAggregate } from "@/lib/api/debt";
import {
  isRevenuePayment,
  isCashPayment,
  type RevenueScope,
} from "@/pages/dashboard/RevenueRentalsList";

/**
 * v0.9.3: аналитика выручки для «банковского» полноэкранного окна.
 *
 * Считает по выбранному окну [start; end) и области (только аренды / все):
 *  • выручка, кол-во платежей, средний чек;
 *  • нал / безнал;
 *  • динамика по дням (для графика, с заполнением пустых дней);
 *  • структура по типам (аренда / продление / штраф / ущерб / экип / паркинг);
 *  • Δ% к предыдущему периоду такой же длины;
 *  • топ-клиенты по выручке за период;
 *  • операционные (не зависят от окна): активные аренды, загрузка парка,
 *    долг (деньги в риске).
 *
 * Источник платежей и правила «что считать выручкой» — те же, что в
 * RevenueRentalsList (isRevenuePayment / isCashPayment), чтобы цифры
 * совпадали со списком и с KPI-плашкой.
 */

export type RevenueTypeKey =
  | "rent"
  | "extend"
  | "fine"
  | "damage"
  | "equipment_fee"
  | "swap_fee"
  | "parking";

export type RevenueAnalytics = {
  total: number;
  count: number;
  avgCheck: number;
  cashTotal: number;
  cashlessTotal: number;
  /** Δ% к предыдущему периоду; null если прошлого периода нет (делить на 0). */
  deltaPct: number | null;
  prevTotal: number;
  /** Динамика по дням: [{ date: 'YYYY-MM-DD', label: 'дд.мм', sum }]. */
  byDay: { date: string; label: string; sum: number }[];
  /** Структура по типам операций (только > 0), отсортирована по сумме. */
  byType: { key: RevenueTypeKey; label: string; sum: number; color: string }[];
  /** Топ-клиенты по выручке за период (до 5). */
  topClients: { name: string; sum: number }[];
  // Операционные (текущее состояние, не зависят от окна):
  activeRentals: number;
  totalScooters: number;
  parkUtil: number; // 0..100 %
  debtTotal: number;
};

const TYPE_META: Record<RevenueTypeKey, { label: string; color: string }> = {
  rent: { label: "Аренда", color: "#3B82F6" },
  extend: { label: "Продление", color: "#22C55E" },
  fine: { label: "Штраф", color: "#F59E0B" },
  damage: { label: "Ущерб", color: "#EF4444" },
  equipment_fee: { label: "Экипировка", color: "#8B5CF6" },
  swap_fee: { label: "Замена скутера", color: "#06B6D4" },
  parking: { label: "Паркинг", color: "#64748B" },
};

const isExtension = (p: ApiPayment): boolean =>
  p.type === "rent" && !!p.note && /продлен/i.test(p.note);

function typeKeyOf(p: ApiPayment): RevenueTypeKey {
  if (p.type === "rent") return isExtension(p) ? "extend" : "rent";
  if (p.type === "fine") return "fine";
  if (p.type === "damage") return "damage";
  if (p.type === "equipment_fee") return "equipment_fee";
  if (p.type === "swap_fee") return "swap_fee";
  if (p.type === "parking") return "parking";
  return "rent";
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function useRevenueAnalytics(opts: {
  scope: RevenueScope;
  start: Date;
  end: Date;
}): RevenueAnalytics {
  const { scope, start, end } = opts;
  const { data: payments = [] } = useApiPayments();
  const { data: activeRentalsData = [] } = useApiRentals();
  const { data: archivedRentals = [] } = useApiRentalsArchived();
  const { data: clients = [] } = useApiClients();
  const { data: scooters = [] } = useApiScooters();
  const { data: debtAgg = [] } = useDebtAggregate();

  return useMemo(() => {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const lenMs = Math.max(86_400_000, endMs - startMs);
    const prevStartMs = startMs - lenMs;

    const rentals = [...activeRentalsData, ...archivedRentals];
    const rentalById = new Map(rentals.map((r) => [r.id, r]));
    const clientById = new Map(clients.map((c) => [c.id, c]));

    const inScope = (p: ApiPayment) =>
      isRevenuePayment(p) && (scope !== "rentals" || p.rentalId != null);

    let total = 0;
    let cashTotal = 0;
    let prevTotal = 0;
    const byDayMap = new Map<string, number>();
    const byTypeMap = new Map<RevenueTypeKey, number>();
    const byClientMap = new Map<string, number>();
    let count = 0;

    for (const p of payments) {
      if (!inScope(p)) continue;
      const t = new Date(p.paidAt!).getTime();
      // предыдущий период (для Δ%)
      if (t >= prevStartMs && t < startMs) prevTotal += p.amount;
      // текущее окно
      if (t < startMs || t >= endMs) continue;
      total += p.amount;
      count += 1;
      if (isCashPayment(p)) cashTotal += p.amount;
      const day = p.paidAt!.slice(0, 10);
      byDayMap.set(day, (byDayMap.get(day) ?? 0) + p.amount);
      const tk = typeKeyOf(p);
      byTypeMap.set(tk, (byTypeMap.get(tk) ?? 0) + p.amount);
      const r = rentalById.get(p.rentalId);
      const cname = r ? clientById.get(r.clientId)?.name ?? "—" : "—";
      byClientMap.set(cname, (byClientMap.get(cname) ?? 0) + p.amount);
    }

    // byDay с заполнением пустых дней (чтобы график был непрерывным).
    const byDay: { date: string; label: string; sum: number }[] = [];
    const dayCursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const lastDay = new Date(end.getTime() - 1); // включительно последний день
    let guard = 0;
    while (dayCursor.getTime() <= lastDay.getTime() && guard++ < 400) {
      const key = ymd(dayCursor);
      byDay.push({
        date: key,
        label: `${String(dayCursor.getDate()).padStart(2, "0")}.${String(dayCursor.getMonth() + 1).padStart(2, "0")}`,
        sum: byDayMap.get(key) ?? 0,
      });
      dayCursor.setDate(dayCursor.getDate() + 1);
    }

    const byType = [...byTypeMap.entries()]
      .map(([key, sum]) => ({
        key,
        label: TYPE_META[key].label,
        color: TYPE_META[key].color,
        sum,
      }))
      .filter((x) => x.sum > 0)
      .sort((a, b) => b.sum - a.sum);

    const topClients = [...byClientMap.entries()]
      .map(([name, sum]) => ({ name, sum }))
      .sort((a, b) => b.sum - a.sum)
      .slice(0, 5);

    const deltaPct =
      prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : null;
    const avgCheck = count > 0 ? Math.round(total / count) : 0;

    // Операционные метрики (текущее состояние парка/долгов).
    const activeRentals = activeRentalsData.filter(
      (r) => r.status === "active",
    ).length;
    const totalScooters = scooters.filter(
      (s) =>
        !(s as { archivedAt?: string | null }).archivedAt &&
        s.baseStatus !== "sold",
    ).length;
    const parkUtil =
      totalScooters > 0
        ? Math.round((activeRentals / totalScooters) * 100)
        : 0;
    const debtTotal = (debtAgg ?? []).reduce(
      (s, d) =>
        s +
        (d.overdueBalance ?? 0) +
        (d.damageBalance ?? 0) +
        (d.manualBalance ?? 0),
      0,
    );

    return {
      total,
      count,
      avgCheck,
      cashTotal,
      cashlessTotal: total - cashTotal,
      deltaPct,
      prevTotal,
      byDay,
      byType,
      topClients,
      activeRentals,
      totalScooters,
      parkUtil,
      debtTotal,
    };
  }, [
    payments,
    activeRentalsData,
    archivedRentals,
    clients,
    scooters,
    debtAgg,
    scope,
    start,
    end,
  ]);
}
