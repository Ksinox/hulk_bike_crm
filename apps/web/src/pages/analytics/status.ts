import type { BoardPeriod } from "./board";

/**
 * Статус показателя относительно плана (07.09, пятая правка заказчика).
 *
 * Раньше здесь был «темп»: сравнение с тем, где должны быть к сегодняшнему
 * дню, и подписи «отстаём от графика», «идём с опережением», «чуть не
 * дотянули». Заказчик: «продано 3 из 10, 30% — согласен, а почему написано
 * "с опережением"? Непонятно. Это вообще не надо». Поэтому теперь только
 * честный процент от плана и один критерий цвета:
 *   • weak — наполнилось меньше половины: оранжево-красный;
 *   • good — половина и больше: зелёный;
 *   • done — план выполнен (100%+): зелёный + галочка.
 */

export type PlanStatus = "weak" | "good" | "done";

/** Порог «хорошо»: от этой доли плана заливка становится зелёной. */
export const GOOD_FROM_PCT = 50;

export type PlanState = {
  /** Процент выполнения плана, 0…999. */
  pct: number;
  status: PlanStatus;
  /** План выполнен. */
  done: boolean;
};

export function planState(
  fact: number,
  plan: number,
  _periodic = false,
  _period: BoardPeriod = "month",
): PlanState {
  const pct = plan > 0 ? Math.min(999, Math.round((fact / plan) * 100)) : 0;
  const status: PlanStatus = pct >= 100 ? "done" : pct >= GOOD_FROM_PCT ? "good" : "weak";
  return { pct, status, done: pct >= 100 };
}

/**
 * Сколько периода уже прошло, 0…1 — нужно советам, чтобы сказать «столько-то
 * в день до конца месяца». В статусе больше не участвует.
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

/** Палитра: два цвета, третий — тот же зелёный для выполненного плана. */
export const STATUS_UI: Record<
  PlanStatus,
  {
    ink: string;
    inkWall: string;
    bar: string;
    barWall: string;
    chip: string;
    chipWall: string;
    hex: string;
    hexWall: string;
  }
> = {
  done: {
    ink: "text-emerald-700",
    inkWall: "text-emerald-300",
    bar: "bg-emerald-500",
    barWall: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-800",
    chipWall: "bg-emerald-400/20 text-emerald-200",
    hex: "#10B981",
    hexWall: "#34D399",
  },
  good: {
    ink: "text-emerald-700",
    inkWall: "text-emerald-300",
    bar: "bg-emerald-500",
    barWall: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-800",
    chipWall: "bg-emerald-400/20 text-emerald-200",
    hex: "#10B981",
    hexWall: "#34D399",
  },
  weak: {
    ink: "text-orange-700",
    inkWall: "text-orange-300",
    bar: "bg-orange-500",
    barWall: "bg-orange-400",
    chip: "bg-orange-500/15 text-orange-900",
    chipWall: "bg-orange-400/20 text-orange-100",
    hex: "#EA580C",
    hexWall: "#F97316",
  },
};

/** Показатели без плана тоже говорят цветом: просрочка — красная. */
export const TONE_UI = {
  good: { ink: "text-emerald-700", inkWall: "text-emerald-300" },
  warn: { ink: "text-orange-700", inkWall: "text-orange-300" },
  bad: { ink: "text-red-700", inkWall: "text-red-400" },
  neutral: { ink: "text-ink", inkWall: "text-white" },
} as const;
