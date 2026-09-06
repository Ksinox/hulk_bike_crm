import type { BoardPeriod } from "./board";

/**
 * Статус показателя (06.09, правка заказчика вечером).
 *
 * Заказчик: «должно сразу визуально считываться, хороший показатель или
 * плохой; тонкие линии — такое себе». Поэтому цвет несёт не полоска, а вся
 * плитка, и решает его не голый процент от плана, а ТЕМП: успеваем ли мы
 * к концу периода. На шестой день месяца «26% из плана» — это норма, а не
 * красное; красным должно гореть то, что действительно отстаёт.
 */

export type PlanStatus = "ahead" | "ontrack" | "risk" | "behind";

/**
 * Сколько периода уже прошло, 0…1.
 *
 * «Неделя» у нас — скользящие 7 дней, они прошли целиком, поэтому 1.
 * «Месяц» и «год» считаются с первого числа, значит прошла только часть.
 * «Сегодня» меряем по рабочему дню 9:00–21:00 — в 10 утра сравнивать
 * дневной план с фактом бессмысленно.
 */
export function periodProgress(period: BoardPeriod, now = new Date()): number {
  if (period === "week") return 1;
  if (period === "today") {
    const h = now.getHours() + now.getMinutes() / 60;
    return clamp01((h - 9) / 12);
  }
  if (period === "month") {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const passed = now.getDate() - 1 + (now.getHours() + 1) / 24;
    return clamp01(passed / days);
  }
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return clamp01((now.getTime() - start) / (end - start));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0.02, v));
}

export type PlanState = {
  /** Процент выполнения плана, 0…999. */
  pct: number;
  /** Где мы должны быть к этой минуте, 0…100 (для метки на шкале). */
  expectedPct: number;
  /** Темп: 1 — идём ровно по графику, 1.2 — на 20% впереди. */
  pace: number;
  status: PlanStatus;
  /** Короткая подпись под цифрой: «идём с опережением» и т.п. */
  label: string;
};

/**
 * @param periodic — накопительный показатель (выручка, продажи) или
 *   моментальный (загрузка парка, активные аренды). У моментального темпа
 *   нет: сравниваем факт с планом напрямую.
 */
export function planState(
  fact: number,
  plan: number,
  periodic: boolean,
  period: BoardPeriod,
  now = new Date(),
): PlanState {
  const pct = plan > 0 ? Math.min(999, Math.round((fact / plan) * 100)) : 0;
  const progress = periodic ? periodProgress(period, now) : 1;
  const expected = plan * progress;
  const pace = expected > 0 ? fact / expected : fact > 0 ? 2 : 0;

  let status: PlanStatus;
  if (pct >= 100) status = "ahead";
  else if (pace >= 1) status = "ontrack";
  else if (pace >= 0.8) status = "risk";
  else status = "behind";

  let label: string;
  if (pct >= 100) label = "план закрыт";
  else if (!periodic || progress >= 0.995) {
    label =
      status === "risk" ? "чуть не дотянули" : status === "behind" ? "отстаём" : "почти";
  } else if (status === "ontrack") {
    label = pace >= 1.1 ? "идём с опережением" : "идём по плану";
  } else if (status === "risk") {
    label = "чуть отстаём";
  } else {
    label = "отстаём от графика";
  }

  return {
    pct,
    expectedPct: Math.min(100, Math.round(progress * 100)),
    pace,
    status,
    label,
  };
}

/**
 * Палитра статусов. Один набор на светлую доску, второй — на тёмный экран
 * второго монитора: там цвета берём насыщеннее, а фон плитки — стеклянный
 * с заметной заливкой, чтобы блок читался цветом от двери.
 */
export const STATUS_UI: Record<
  PlanStatus,
  {
    /** Цвет самой цифры и дуги. */
    ink: string;
    inkWall: string;
    /** Заливка плитки. */
    fill: string;
    fillWall: string;
    /** Вертикальная полоса слева — главный маркер издалека. */
    rail: string;
    railWall: string;
    /** Дорожка шкалы под заливкой. */
    track: string;
    trackWall: string;
    /** Заливка шкалы/дуги. */
    bar: string;
    barWall: string;
    /** Цвет чипа-подписи. */
    chip: string;
    chipWall: string;
    /** Hex для SVG-дуги. */
    hex: string;
    hexWall: string;
  }
> = {
  ahead: {
    ink: "text-emerald-700",
    inkWall: "text-emerald-300",
    fill: "bg-emerald-50/70",
    fillWall: "bg-emerald-400/[0.14]",
    rail: "bg-emerald-500",
    railWall: "bg-emerald-400",
    track: "bg-emerald-500/15",
    trackWall: "bg-emerald-400/20",
    bar: "bg-emerald-500",
    barWall: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-800",
    chipWall: "bg-emerald-400/20 text-emerald-200",
    hex: "#10B981",
    hexWall: "#34D399",
  },
  ontrack: {
    ink: "text-blue-700",
    inkWall: "text-sky-300",
    fill: "bg-blue-50/70",
    fillWall: "bg-sky-400/[0.13]",
    rail: "bg-blue-600",
    railWall: "bg-sky-400",
    track: "bg-blue-600/15",
    trackWall: "bg-sky-400/20",
    bar: "bg-blue-600",
    barWall: "bg-sky-400",
    chip: "bg-blue-600/12 text-blue-800",
    chipWall: "bg-sky-400/20 text-sky-100",
    hex: "#2563EB",
    hexWall: "#38BDF8",
  },
  risk: {
    ink: "text-amber-700",
    inkWall: "text-amber-300",
    fill: "bg-amber-50",
    fillWall: "bg-amber-400/[0.15]",
    rail: "bg-amber-500",
    railWall: "bg-amber-400",
    track: "bg-amber-500/20",
    trackWall: "bg-amber-400/25",
    bar: "bg-amber-500",
    barWall: "bg-amber-400",
    chip: "bg-amber-500/20 text-amber-900",
    chipWall: "bg-amber-400/20 text-amber-100",
    hex: "#F59E0B",
    hexWall: "#FBBF24",
  },
  behind: {
    ink: "text-red-700",
    inkWall: "text-red-400",
    fill: "bg-red-50",
    fillWall: "bg-red-500/[0.16]",
    rail: "bg-red-500",
    railWall: "bg-red-400",
    track: "bg-red-500/18",
    trackWall: "bg-red-400/25",
    bar: "bg-red-500",
    barWall: "bg-red-400",
    chip: "bg-red-500/18 text-red-900",
    chipWall: "bg-red-400/20 text-red-100",
    hex: "#EF4444",
    hexWall: "#F87171",
  },
};

/**
 * Показатели без плана тоже должны говорить цветом: просрочка — красная,
 * деньги — зелёные. Берём тон из самого показателя.
 */
export const TONE_UI = {
  good: { ink: "text-emerald-700", inkWall: "text-emerald-300", rail: "bg-emerald-500", railWall: "bg-emerald-400" },
  warn: { ink: "text-amber-700", inkWall: "text-amber-300", rail: "bg-amber-500", railWall: "bg-amber-400" },
  bad: { ink: "text-red-700", inkWall: "text-red-400", rail: "bg-red-500", railWall: "bg-red-400" },
  neutral: { ink: "text-ink", inkWall: "text-white", rail: "bg-ink/15", railWall: "bg-white/25" },
} as const;
