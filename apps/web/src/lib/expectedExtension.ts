/**
 * Правка 2.1 (26.08): «Поступит сегодня» = вероятные ПРОДЛЕНИЯ.
 *
 * Раньше чипс складывал rental.sum — сумму аренды за всё время (при
 * продлениях она накапливается), то есть показывал историю оплат, а не
 * прогноз. Заказчик: если клиент сегодня возвращает, система должна
 * ожидать сумму, как будто он продлевает на ТОТ ЖЕ период по своему
 * текущему тарифу. Иванов взял на неделю за 3 500 ₽ → ожидаем 3 500 ₽.
 *
 * Формула повторяет расчёт реального продления (CalendarPanel):
 *   (дневная ставка + платная экипировка/день) × дни периода.
 * Дни периода — из тарифа: месяц → 30, неделя → 7, короткий — фактические
 * дни аренды (без продлений это и есть её период).
 */

export type ExpectedExtensionInput = {
  rate: number;
  rateUnit?: "day" | "week" | null;
  tariffPeriod?: string | null;
  /** Итоговые дни аренды — период для короткого тарифа. */
  days: number;
  /** Платная экипировка, ₽/сутки (бесплатная не входит). */
  equipmentDaily?: number;
};

/** Дни предполагаемого продления «на тот же период». */
export function expectedExtensionDays(input: ExpectedExtensionInput): number {
  if (input.tariffPeriod === "month") return 30;
  if (input.tariffPeriod === "week") return 7;
  // Короткий тариф (1–6 дней): продление на столько же, сколько брал.
  return Math.max(1, Math.min(input.days || 1, 6));
}

/** Ожидаемая сумма продления на тот же период по текущему тарифу. */
export function expectedExtensionSum(input: ExpectedExtensionInput): number {
  const daily =
    input.rateUnit === "week" ? Math.round(input.rate / 7) : input.rate;
  const days = expectedExtensionDays(input);
  return Math.max(0, Math.round((daily + (input.equipmentDaily ?? 0)) * days));
}

/** Платная экипировка ₽/сутки из equipmentJson аренды. */
export function equipmentDailyOf(
  equipmentJson: { free?: boolean; price?: number }[] | null | undefined,
): number {
  return (equipmentJson ?? []).reduce(
    (s, e) => s + (e.free ? 0 : (e.price ?? 0)),
    0,
  );
}
