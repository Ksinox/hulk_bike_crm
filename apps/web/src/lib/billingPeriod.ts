/**
 * Расчётный период бизнеса.
 *
 * По договорённости с заказчиком (v0.3.7): период считается с 15-го числа
 * одного месяца по 14-е следующего включительно. Все денежные KPI
 * (выручка на дашборде, выручка на вкладке «Аренды», KPI «За период»
 * в фильтрах) опираются именно на этот период, а не на календарный
 * месяц 1→30/31.
 *
 * Логика бизнеса: клиенты часто платят 13-14 числа за следующий цикл,
 * и эти платежи должны попадать в текущий период (где выдан скутер),
 * а не «теряться» на стыке месяцев.
 *
 * Меняется в одном месте — все потребители подтянутся.
 *
 * В будущем (итерация 5) день старта будет настраиваемым в админке,
 * сервис тогда станет читать значение из app_settings.
 */

const DEFAULT_PERIOD_START_DAY = 15;

// v0.4.1: реактивный override через настройки. Сервис app-settings
// при загрузке вызывает setBillingPeriodStartDay() с актуальным
// значением. Если настройка не выставлена — используется дефолт 15.
let runtimeStartDay: number = DEFAULT_PERIOD_START_DAY;

export function setBillingPeriodStartDay(day: number): void {
  if (Number.isFinite(day) && day >= 1 && day <= 28) {
    runtimeStartDay = Math.floor(day);
  }
}

export function getBillingPeriodStartDay(): number {
  return runtimeStartDay;
}

export type BillingPeriod = {
  /** Включительно: первая секунда дня start. */
  start: Date;
  /** Эксклюзивно: первая секунда дня СЛЕДУЮЩЕГО за last днём. */
  end: Date;
  /** Человекочитаемая метка "15 апр — 14 мая". */
  label: string;
};

const MONTHS_RU_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function startDay(): number {
  return runtimeStartDay;
}

function makePeriod(periodStartYear: number, periodStartMonth: number): BillingPeriod {
  const sd = startDay();
  const start = new Date(periodStartYear, periodStartMonth, sd, 0, 0, 0, 0);
  // Конец — следующий месяц, тот же sd, эксклюзивно: «по 14-е включительно»
  // ⇔ строго < 15 следующего месяца.
  const end = new Date(periodStartYear, periodStartMonth + 1, sd, 0, 0, 0, 0);
  const lastDate = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const label = `${String(start.getDate()).padStart(2, "0")} ${MONTHS_RU_SHORT[start.getMonth()]} — ${String(lastDate.getDate()).padStart(2, "0")} ${MONTHS_RU_SHORT[lastDate.getMonth()]}`;
  return { start, end, label };
}

/**
 * Возвращает расчётный период, в котором находится `date`.
 * - Если день `date` >= startDay → период начинается с этого месяца.
 * - Если день `date` < startDay → период начался в прошлом месяце.
 */
export function billingPeriodFor(date: Date): BillingPeriod {
  const sd = startDay();
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  if (d >= sd) return makePeriod(y, m);
  return makePeriod(y, m - 1);
}

/** Текущий расчётный период (на момент now). */
export function currentBillingPeriod(now: Date = new Date()): BillingPeriod {
  return billingPeriodFor(now);
}

/** date ∈ [period.start, period.end) ? */
export function isInBillingPeriod(date: Date, period: BillingPeriod): boolean {
  const t = date.getTime();
  return t >= period.start.getTime() && t < period.end.getTime();
}

/**
 * Список последних N расчётных периодов, начиная с текущего и идя в
 * прошлое. Используется в фильтрах «Период» в Аренды (итерация 4).
 */
export function listRecentBillingPeriods(count: number, now: Date = new Date()): BillingPeriod[] {
  const cur = currentBillingPeriod(now);
  const out: BillingPeriod[] = [cur];
  let y = cur.start.getFullYear();
  let m = cur.start.getMonth();
  for (let i = 1; i < count; i++) {
    m -= 1;
    if (m < 0) {
      m = 11;
      y -= 1;
    }
    out.push(makePeriod(y, m));
  }
  return out;
}
