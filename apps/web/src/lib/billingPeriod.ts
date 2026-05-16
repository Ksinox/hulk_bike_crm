/**
 * Расчётный период бизнеса (date-aware версия v0.7).
 *
 * Раньше был один глобальный day-of-month, и при смене (15→1) ВСЯ
 * история задним числом пересчитывалась по новой формуле. Это давало
 * скачок цифр в день переключения. Теперь храним «якоря» (anchors) —
 * запись, начиная с какой даты действует то или иное правило. Резолвер
 * для каждой даты подтягивает якорь, активный на тот момент, и считает
 * период по нему. Платежи прошлых месяцев остаются в своих периодах.
 *
 * Anchor.kind:
 *   'regular'    — обычный период длиной в месяц, начало на ruleStartDay.
 *   'transition' — короткий «переходный» период от effectiveFrom до
 *                  transitionEndDate включительно. После окончания
 *                  transition этот же якорь действует как regular с
 *                  ruleStartDay (новой схемой).
 *
 * Источник правды — таблица billing_period_anchors на сервере. Web
 * подтягивает её через useBillingPeriodAnchors() и складывает в этот
 * модуль через setBillingPeriodAnchors(). Все потребители читают через
 * currentBillingPeriod() / periodFor(date) / listRecentBillingPeriods().
 *
 * Если якорей ещё нет (не загрузились) — fallback на ruleStartDay=15.
 */

export type BillingPeriodKind = "regular" | "transition";

export type BillingAnchor = {
  id: number;
  /** ISO YYYY-MM-DD, с этого дня (включительно) действует якорь. */
  effectiveFrom: string;
  /** День месяца 1..28 — старт regular-периода под этим правилом. */
  ruleStartDay: number;
  kind: BillingPeriodKind;
  /** ISO YYYY-MM-DD — последний день переходного периода. null для regular. */
  transitionEndDate: string | null;
};

export type BillingPeriod = {
  /** Первая секунда первого дня периода (включительно). */
  start: Date;
  /** Первая секунда дня СЛЕДУЮЩЕГО за последним днём (исключительно). */
  end: Date;
  /** Человекочитаемая метка, например "01 май — 31 май" или "15 май — 31 май (переходный)". */
  label: string;
  kind: BillingPeriodKind;
  /** Правило, которое действовало для этого периода. */
  ruleStartDay: number;
};

const DEFAULT_RULE_START_DAY = 15;
const FALLBACK_ANCHOR: BillingAnchor = {
  id: -1,
  effectiveFrom: "1970-01-01",
  ruleStartDay: DEFAULT_RULE_START_DAY,
  kind: "regular",
  transitionEndDate: null,
};

let anchors: BillingAnchor[] = [FALLBACK_ANCHOR];

export function setBillingPeriodAnchors(next: BillingAnchor[]): void {
  if (!Array.isArray(next) || next.length === 0) {
    anchors = [FALLBACK_ANCHOR];
    return;
  }
  // Сортируем по effectiveFrom ascending — резолвер полагается на это.
  anchors = [...next].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

export function getBillingPeriodAnchors(): readonly BillingAnchor[] {
  return anchors;
}

// === обратная совместимость со старой настройкой (v0.4.1..v0.6) ===
// Используется в useAppSettings до тех пор, пока существует app_settings.
// billing_period_start_day. Превращаем плоское значение в один якорь от
// «эпохи». При наличии настоящих anchors из API эта функция перетирается
// фактическими данными.
export function setBillingPeriodStartDay(day: number): void {
  if (!Number.isFinite(day) || day < 1 || day > 28) return;
  setBillingPeriodAnchors([
    {
      id: -1,
      effectiveFrom: "1970-01-01",
      ruleStartDay: Math.floor(day),
      kind: "regular",
      transitionEndDate: null,
    },
  ]);
}

export function getBillingPeriodStartDay(): number {
  // Возвращаем самое последнее regular-правило (если идёт transition —
  // то ruleStartDay этого transition'а, т.е. правило, которое начнёт
  // действовать сразу после переходного периода).
  const last = anchors[anchors.length - 1];
  return last?.ruleStartDay ?? DEFAULT_RULE_START_DAY;
}

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

/** YYYY-MM-DD → Date в локальной TZ, время 00:00:00. */
function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y as number, (m as number) - 1, d as number, 0, 0, 0, 0);
}

function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_RU_SHORT[d.getMonth()]}`;
}

function makeLabel(start: Date, lastDayInclusive: Date, kind: BillingPeriodKind): string {
  const base = `${fmtDay(start)} — ${fmtDay(lastDayInclusive)}`;
  return kind === "transition" ? `${base} (переходный)` : base;
}

/** Период regular для даты `date` и правила `startDay`. */
function makeRegularPeriod(date: Date, startDay: number): BillingPeriod {
  const sd = clampDay(startDay);
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const periodMonth = d >= sd ? m : m - 1;
  const start = new Date(y, periodMonth, sd, 0, 0, 0, 0);
  const end = new Date(y, periodMonth + 1, sd, 0, 0, 0, 0);
  const lastDay = new Date(end.getTime() - 86_400_000);
  return {
    start,
    end,
    kind: "regular",
    ruleStartDay: sd,
    label: makeLabel(start, lastDay, "regular"),
  };
}

function clampDay(day: number): number {
  if (!Number.isFinite(day)) return DEFAULT_RULE_START_DAY;
  return Math.min(28, Math.max(1, Math.floor(day)));
}

/** Найти якорь, активный на дату `date`. */
function findActiveAnchor(date: Date): BillingAnchor {
  // anchors отсортированы по effectiveFrom ascending; ищем последний
  // с effectiveFrom <= date.
  const t = date.getTime();
  let active = anchors[0]!;
  for (const a of anchors) {
    if (parseISODate(a.effectiveFrom).getTime() <= t) {
      active = a;
    } else {
      break;
    }
  }
  return active;
}

/** Главный резолвер: период, в котором находится дата. */
export function periodFor(date: Date): BillingPeriod {
  const active = findActiveAnchor(date);
  if (active.kind === "transition" && active.transitionEndDate) {
    const start = parseISODate(active.effectiveFrom);
    const endExclusive = new Date(
      parseISODate(active.transitionEndDate).getTime() + 86_400_000,
    );
    if (date.getTime() >= start.getTime() && date.getTime() < endExclusive.getTime()) {
      const lastDay = new Date(endExclusive.getTime() - 86_400_000);
      return {
        start,
        end: endExclusive,
        kind: "transition",
        ruleStartDay: active.ruleStartDay,
        label: makeLabel(start, lastDay, "transition"),
      };
    }
    // Дата за пределами переходного — действует уже regular по
    // ruleStartDay этого же якоря.
    return makeRegularPeriod(date, active.ruleStartDay);
  }
  return makeRegularPeriod(date, active.ruleStartDay);
}

/** Алиас для обратной совместимости. */
export function billingPeriodFor(date: Date): BillingPeriod {
  return periodFor(date);
}

/** Текущий период (на момент `now`). */
export function currentBillingPeriod(now: Date = new Date()): BillingPeriod {
  return periodFor(now);
}

/** Проверка попадания платежа/события в период. Граница end эксклюзивна. */
export function isInBillingPeriod(date: Date, period: BillingPeriod): boolean {
  const t = date.getTime();
  return t >= period.start.getTime() && t < period.end.getTime();
}

/**
 * Список последних N периодов, начиная с текущего и идя в прошлое.
 *
 * На стыке эр генерация может пересечь transition или смену правила —
 * каждый шаг подтягивает «период, в котором сейчас находимся минус 1 мс».
 */
export function listRecentBillingPeriods(
  count: number,
  now: Date = new Date(),
): BillingPeriod[] {
  const out: BillingPeriod[] = [];
  let cursor = now;
  for (let i = 0; i < count; i++) {
    const p = periodFor(cursor);
    out.push(p);
    // Следующая итерация — за день до начала текущего периода.
    cursor = new Date(p.start.getTime() - 1);
  }
  return out;
}

/**
 * Вычислить, как разложится переключение правила.
 *
 * Используется на бэке (при POST нового якоря) и на фронте (превью в /settings).
 *
 *   - currentPeriod — какой период идёт сейчас под текущим правилом,
 *     с ним ничего не делаем, он доживает до своего естественного конца.
 *   - transitionStart — день, следующий за концом текущего периода
 *     (= currentPeriod.end).
 *   - transitionEnd — день ПЕРЕД первым «естественным» стартом новой
 *     схемы (включительно).
 *   - firstNewPeriod — первый полноценный период новой схемы.
 *
 * Если currentRule === newRule — возвращает null (нечего переключать).
 */
export function planTransition(
  today: Date,
  currentRule: number,
  newRule: number,
): {
  currentPeriod: BillingPeriod;
  transitionStart: Date;
  transitionEnd: Date;
  firstNewPeriod: BillingPeriod;
} | null {
  const cr = clampDay(currentRule);
  const nr = clampDay(newRule);
  if (cr === nr) return null;

  const currentPeriod = makeRegularPeriod(today, cr);
  const transitionStart = currentPeriod.end;
  // Найти первую дату >= transitionStart, у которой день месяца == nr.
  let candidate = new Date(
    transitionStart.getFullYear(),
    transitionStart.getMonth(),
    nr,
    0,
    0,
    0,
    0,
  );
  if (candidate.getTime() < transitionStart.getTime()) {
    candidate = new Date(
      transitionStart.getFullYear(),
      transitionStart.getMonth() + 1,
      nr,
      0,
      0,
      0,
      0,
    );
  }
  const transitionEndExclusive = candidate;
  const transitionEnd = new Date(transitionEndExclusive.getTime() - 86_400_000);
  const firstNewPeriod = makeRegularPeriod(transitionEndExclusive, nr);
  return { currentPeriod, transitionStart, transitionEnd, firstNewPeriod };
}

/** Формат "01 май" для лейблов в UI/тестах. */
export function formatBillingDate(d: Date): string {
  return fmtDay(d);
}
