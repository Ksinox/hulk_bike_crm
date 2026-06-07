/**
 * Утилиты «просрочка на дату фактической оплаты».
 *
 * Бизнес-проблема: оператор не всегда фиксирует оплату в день поступления.
 * Пример — Панченко: плановый возврат 06.06, клиент прислал оплату 06.06
 * (в срок), но оператор отметил это 07.06. Система начислила 1 день
 * просрочки + штраф, хотя клиент выполнил условия вовремя.
 *
 * Решение: при приёме оплаты оператор указывает ДАТУ фактического
 * поступления. Просрочка пересчитывается на эту дату. Разница между
 * сегодняшней просрочкой и просрочкой на дату оплаты = «задержка фиксации
 * оператором» — эти дни прощаются (сдвиг endPlanned), клиент за них не
 * платит.
 *
 * Чистые функции без побочных эффектов — покрыты unit-тестами.
 */

/** Парсит «DD.MM.YYYY» → Date (локальная полночь) или null. */
export function parseRuDate(ru: string): Date | null {
  const m = ru.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Парсит ISO «YYYY-MM-DD» → Date (локальная полночь) или null. */
export function parseIsoDate(iso: string): Date | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** «DD.MM.YYYY» → «YYYY-MM-DD». Пусто/невалид → null. */
export function ruToIsoDate(ru: string): string | null {
  const d = parseRuDate(ru);
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Сколько ПОЛНЫХ дней дата оплаты превышает плановый возврат.
 * 0, если оплата пришла в срок (в день возврата) или раньше.
 *
 * @param endPlannedRu плановый возврат «DD.MM.YYYY»
 * @param paymentIso   дата оплаты «YYYY-MM-DD»
 */
export function effectiveOverdueDaysAsOf(
  endPlannedRu: string,
  paymentIso: string,
): number {
  const end = parseRuDate(endPlannedRu);
  const pay = parseIsoDate(paymentIso);
  if (!end || !pay) return 0;
  const diffDays = Math.floor((pay.getTime() - end.getTime()) / 86_400_000);
  return Math.max(0, diffDays);
}

/**
 * Сколько дней просрочки нужно ПРОСТИТЬ как «задержку фиксации оператором» —
 * разница между текущей просрочкой (из API, на сегодня) и реальной
 * просрочкой на дату фактической оплаты. В пределах [0, todayOverdueDays].
 *
 * @param todayOverdueDays просрочка на сегодня (debt.overdueDays из API)
 * @param endPlannedRu     плановый возврат «DD.MM.YYYY»
 * @param paymentIso       дата оплаты «YYYY-MM-DD»
 */
export function operatorDelayDays(
  todayOverdueDays: number,
  endPlannedRu: string,
  paymentIso: string,
): number {
  const eff = effectiveOverdueDaysAsOf(endPlannedRu, paymentIso);
  return Math.max(0, Math.min(todayOverdueDays, todayOverdueDays - eff));
}
