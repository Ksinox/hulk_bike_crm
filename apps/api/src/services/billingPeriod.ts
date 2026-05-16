/**
 * Резолвер расчётного периода на бэке.
 *
 * Зеркало apps/web/src/lib/billingPeriod.ts — две реализации синхронны
 * по поведению, юнит-тесты на обеих сторонах проверяют табличные кейсы.
 * Используется:
 *   • API /billing-period/anchors при POST (вычисление transition)
 *   • overdueScheduler (граница архивации)
 *   • документ-рендер / отчёты по периоду — позже
 */

export type BillingPeriodKind = "regular" | "transition";

export type BillingAnchorRow = {
  id: number;
  effectiveFrom: string; // YYYY-MM-DD
  ruleStartDay: number;
  kind: BillingPeriodKind;
  transitionEndDate: string | null;
};

export type BillingPeriod = {
  start: Date;
  end: Date; // exclusive
  kind: BillingPeriodKind;
  ruleStartDay: number;
  label: string;
};

const DEFAULT_RULE_START_DAY = 15;

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

function clampDay(day: number): number {
  if (!Number.isFinite(day)) return DEFAULT_RULE_START_DAY;
  return Math.min(28, Math.max(1, Math.floor(day)));
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y as number, (m as number) - 1, d as number, 0, 0, 0, 0);
}

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDay(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_RU_SHORT[d.getMonth()]}`;
}

function makeLabel(
  start: Date,
  lastDayInclusive: Date,
  kind: BillingPeriodKind,
): string {
  const base = `${fmtDay(start)} — ${fmtDay(lastDayInclusive)}`;
  return kind === "transition" ? `${base} (переходный)` : base;
}

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

function findActiveAnchor(
  anchors: readonly BillingAnchorRow[],
  date: Date,
): BillingAnchorRow {
  if (anchors.length === 0) {
    return {
      id: -1,
      effectiveFrom: "1970-01-01",
      ruleStartDay: DEFAULT_RULE_START_DAY,
      kind: "regular",
      transitionEndDate: null,
    };
  }
  const sorted = [...anchors].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  const t = date.getTime();
  let active = sorted[0]!;
  for (const a of sorted) {
    if (parseISODate(a.effectiveFrom).getTime() <= t) {
      active = a;
    } else {
      break;
    }
  }
  return active;
}

/** Основной резолвер: период, в котором находится `date`. */
export function periodFor(
  date: Date,
  anchors: readonly BillingAnchorRow[],
): BillingPeriod {
  const active = findActiveAnchor(anchors, date);
  if (active.kind === "transition" && active.transitionEndDate) {
    const start = parseISODate(active.effectiveFrom);
    const endExclusive = new Date(
      parseISODate(active.transitionEndDate).getTime() + 86_400_000,
    );
    if (
      date.getTime() >= start.getTime() &&
      date.getTime() < endExclusive.getTime()
    ) {
      const lastDay = new Date(endExclusive.getTime() - 86_400_000);
      return {
        start,
        end: endExclusive,
        kind: "transition",
        ruleStartDay: active.ruleStartDay,
        label: makeLabel(start, lastDay, "transition"),
      };
    }
    return makeRegularPeriod(date, active.ruleStartDay);
  }
  return makeRegularPeriod(date, active.ruleStartDay);
}

/** Вычислить раскладку переходного периода (для POST новой anchor). */
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

/** Идёт ли сейчас переходный период (есть ли активный transition-якорь, чей end >= today). */
export function isTransitionActive(
  anchors: readonly BillingAnchorRow[],
  today: Date,
): { active: true; anchor: BillingAnchorRow } | { active: false } {
  for (const a of anchors) {
    if (a.kind !== "transition" || !a.transitionEndDate) continue;
    const start = parseISODate(a.effectiveFrom);
    const endExcl = new Date(
      parseISODate(a.transitionEndDate).getTime() + 86_400_000,
    );
    if (
      today.getTime() >= start.getTime() &&
      today.getTime() < endExcl.getTime()
    ) {
      return { active: true, anchor: a };
    }
  }
  return { active: false };
}

/**
 * Какое сейчас «эффективное» правило старта периода (для UI и обратной
 * совместимости с app_settings.billing_period_start_day).
 *
 * Берём rule_start_day самого позднего по effective_from якоря: для
 * regular-якоря это и есть текущее правило, для transition — правило,
 * которое начнёт действовать сразу после переходного.
 */
export function currentRuleStartDay(
  anchors: readonly BillingAnchorRow[],
): number {
  if (anchors.length === 0) return DEFAULT_RULE_START_DAY;
  const sorted = [...anchors].sort((a, b) =>
    a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
  return sorted[sorted.length - 1]!.ruleStartDay;
}
