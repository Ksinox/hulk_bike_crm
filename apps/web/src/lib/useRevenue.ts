/**
 * v0.4.10 — единая точка правды для выручки.
 *
 * Раньше выручка считалась дважды: в useDashboardMetrics и в Rentals
 * KPI. Логика и период (currentBillingPeriod 15→14) совпадали по
 * замыслу, но при любом расхождении в фильтрах две страницы могли
 * показать разные суммы. Теперь обе берут результат отсюда — что
 * автоматически синхронизирует цифры.
 *
 * scope:
 *  • 'all' — общая выручка по всем источникам (rent + damage + fine
 *    + swap_fee + потенциально продажи/ремонты/рассрочки в будущем).
 *    Это то что показываем на ДАШБОРДЕ.
 *  • 'rentals' — только выручка по аренде и связанным санкциям
 *    (rent + fine + damage по актам). Используем на ВКЛАДКЕ АРЕНДЫ.
 *
 * Сейчас фактически 'all' === 'rentals', потому что других модулей
 * с платежами в системе нет. Когда появятся продажи/ремонты для
 * сторонних — у 'all' добавится их выборка, а 'rentals' останется
 * как есть. Точка расширения здесь, не в местах вызова.
 */
import { useMemo } from "react";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import {
  currentBillingPeriod,
  type BillingPeriod,
} from "@/lib/billingPeriod";

export type RevenueScope = "all" | "rentals";

export type RevenueResult = {
  /** Сумма ₽ за текущий расчётный период. */
  total: number;
  /** Сколько платежей попало в выборку. */
  count: number;
  /** Период за который посчитано. */
  period: BillingPeriod;
  /** Платежи по дням периода — для спарклайн-графика. */
  byDay: { date: string; sum: number }[];
};

/**
 * Учитываем платёж в выручке если он:
 *  • paid=true и paidAt задан;
 *  • тип НЕ deposit (залог возвратный) и НЕ refund (это вывод);
 *  • paidAt попадает в период [start, end).
 */
function shouldCount(p: ApiPayment, period: BillingPeriod): boolean {
  if (!p.paid) return false;
  if (!p.paidAt) return false;
  if (p.type === "deposit" || p.type === "refund") return false;
  // v0.4.34: исключаем method='deposit' — оплата за счёт залога/депозита
  // клиента, не должна попадать в выручку повторно.
  if (p.method === "deposit") return false;
  const t = new Date(p.paidAt).getTime();
  return t >= period.start.getTime() && t < period.end.getTime();
}

/**
 * Хук — выручка за текущий расчётный период.
 *
 * Период берётся из @/lib/billingPeriod (по умолчанию 15→14, можно
 * переопределить через настройки приложения, см. Settings).
 */
export function useBillingPeriodRevenue(
  scope: RevenueScope = "all",
  now: Date = new Date(),
): RevenueResult {
  const { data: payments } = useApiPayments();
  const period = useMemo(() => currentBillingPeriod(now), [now]);

  return useMemo(() => {
    const list = payments ?? [];
    // Базовый фильтр — общий для обоих scope.
    const inPeriod = list.filter((p) => shouldCount(p, period));
    // Сейчас 'all' и 'rentals' дают одно и то же — все наши платежи
    // привязаны к арендам. Когда появятся другие модули, добавим
    // отдельный источник для 'all' и оставим 'rentals' как фильтр
    // только связанных с rentalId.
    const filtered =
      scope === "rentals"
        ? inPeriod.filter((p) => p.rentalId != null)
        : inPeriod;
    let total = 0;
    const byDayMap = new Map<string, number>();
    for (const p of filtered) {
      total += p.amount;
      if (p.paidAt) {
        const day = p.paidAt.slice(0, 10);
        byDayMap.set(day, (byDayMap.get(day) ?? 0) + p.amount);
      }
    }
    const byDay = Array.from(byDayMap.entries())
      .map(([date, sum]) => ({ date, sum }))
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      total,
      count: filtered.length,
      period,
      byDay,
    };
  }, [payments, period, scope]);
}
