/**
 * Единая формула дневной ставки для расчёта ПРОСРОЧКИ.
 *
 * Просрочка начисляется за каждый день пользования, а в эти дни клиент
 * пользуется И скутером, И платной экипировкой. Поэтому «день просрочки»
 * и штраф (50% за день) считаются от суммы: аренда/сут + экипировка/сут.
 *
 * Пример: аренда 500 ₽/сут + шлем 50 ₽/сут = 550 ₽/сут.
 *   1 день просрочки → долг 550 (день) + 275 (штраф 50%) = 825 ₽.
 *
 * Раньше экипировка НЕ учитывалась — долг по просрочке занижался (баг).
 *
 * equipmentJson — снимок экипировки аренды: [{ name, price, free }].
 * Бесплатные позиции (free=true) в долг не идут.
 */

/** ₽/сут платной экипировки из снимка equipmentJson. */
export function equipDailyFromJson(equipmentJson: unknown): number {
  if (!Array.isArray(equipmentJson)) return 0;
  let sum = 0;
  for (const e of equipmentJson) {
    if (!e || typeof e !== "object") continue;
    const item = e as { price?: unknown; free?: unknown };
    if (item.free === true) continue;
    if (typeof item.price === "number" && item.price > 0) sum += item.price;
  }
  return sum;
}

/**
 * ₽/сут для расчёта просрочки = аренда/сут (недельная ставка делится на 7)
 * + экипировка/сут. Единый источник правды — используется в debt-aggregate,
 * /:id/debt и синхронизации модуля Должников.
 */
export function overdueDailyRate(
  rate: number,
  rateUnit: string,
  equipmentJson: unknown,
): number {
  const scooterDaily = rateUnit === "week" ? Math.round(rate / 7) : rate;
  return scooterDaily + equipDailyFromJson(equipmentJson);
}
