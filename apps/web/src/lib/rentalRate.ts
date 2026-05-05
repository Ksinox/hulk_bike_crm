/**
 * v0.4.25 — хелперы работы с rate / rateUnit аренды.
 *
 * Аренда может быть с тарифом ₽/сут (default) или ₽/нед (произвольный
 * тариф «по неделям»). Везде, где используется rate в расчётах
 * просрочки / суточной выручки — нужно сначала привести к ₽/сут.
 */

export type RateUnit = "day" | "week";

/**
 * Дневной эквивалент ставки. Используется для расчёта просрочки —
 * за каждый ДЕНЬ просрочки берётся round(rate / 7) ₽ (при rateUnit='week')
 * или сам rate (при 'day').
 *
 * Округление только при расчёте — rate в БД хранится exact.
 */
export function dailyRate(rate: number, rateUnit?: RateUnit | null): number {
  if (rateUnit === "week") return Math.round(rate / 7);
  return rate;
}

/** «3000 ₽/нед» или «500 ₽/сут» — для отображения в карточках. */
export function formatRateWithUnit(
  rate: number,
  rateUnit?: RateUnit | null,
): string {
  return `${rate} ₽/${rateUnit === "week" ? "нед" : "сут"}`;
}
