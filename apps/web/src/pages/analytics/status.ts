import type { BoardPeriod } from "./board";
import { currentBillingPeriod } from "@/lib/billingPeriod";

/**
 * Статус показателя относительно плана (07.09, пятая правка заказчика).
 *
 * Раньше здесь был «темп»: сравнение с тем, где должны быть к сегодняшнему
 * дню, и подписи «отстаём от графика», «идём с опережением», «чуть не
 * дотянули». Заказчик: «продано 3 из 10, 30% — согласен, а почему написано
 * "с опережением"? Непонятно. Это вообще не надо». Поэтому теперь только
 * честный процент от плана и один критерий цвета.
 *
 * Правки 7.0 (19.09, п.12) — геймификация, пороги заказчика:
 *   • red    — меньше 33% плана;
 *   • orange — от 33 до 50% (между «красным» и «жёлтым» заказчик порога
 *              не назвал — промежуточный оранжевый);
 *   • yellow — от 50%;
 *   • green  — от 90%;
 *   • done   — план выполнен (100%+): зелёный + галочка.
 */

/**
 * Хвост плана рядом с крупной цифрой: «16 500 ₽ /100 000».
 *
 * Единицу в хвосте не повторяем — она уже стоит у факта. На узком экране
 * (планшет, 07.09) полный «/100 000 ₽» не помещался и обрезал само число.
 */
export function planTail(display: string, planText: string): string {
  const fact = display.trimEnd();
  let tail = planText.trimEnd();
  for (const unit of ["₽", "%"]) {
    if (fact.endsWith(unit) && tail.endsWith(unit)) {
      return tail.slice(0, -unit.length).trimEnd();
    }
  }
  return tail;
}

export type PlanStatus = "red" | "orange" | "yellow" | "green" | "done";

/** Порог «идём нормально» (советы, гейдж): половина плана. */
export const GOOD_FROM_PCT = 50;
/** Пороги цвета (правки 7.0). */
export const RED_BELOW_PCT = 33;
export const GREEN_FROM_PCT = 90;

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
  const status: PlanStatus =
    pct >= 100
      ? "done"
      : pct >= GREEN_FROM_PCT
        ? "green"
        : pct >= GOOD_FROM_PCT
          ? "yellow"
          : pct >= RED_BELOW_PCT
            ? "orange"
            : "red";
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
  if (period === "billing") {
    const bp = currentBillingPeriod(now);
    const span = bp.end.getTime() - bp.start.getTime();
    return clamp01((now.getTime() - bp.start.getTime()) / span);
  }
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  return clamp01((now.getTime() - start) / (end - start));
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0.02, v));
}

/** Палитра: красный → оранжевый → жёлтый → зелёный; выполнено — зелёный. */
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
  green: {
    ink: "text-emerald-700",
    inkWall: "text-emerald-300",
    bar: "bg-emerald-500",
    barWall: "bg-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-800",
    chipWall: "bg-emerald-400/20 text-emerald-200",
    hex: "#10B981",
    hexWall: "#34D399",
  },
  yellow: {
    ink: "text-amber-600",
    inkWall: "text-amber-300",
    bar: "bg-amber-400",
    barWall: "bg-amber-300",
    chip: "bg-amber-400/20 text-amber-800",
    chipWall: "bg-amber-300/20 text-amber-100",
    hex: "#F59E0B",
    hexWall: "#FCD34D",
  },
  orange: {
    ink: "text-orange-700",
    inkWall: "text-orange-300",
    bar: "bg-orange-500",
    barWall: "bg-orange-400",
    chip: "bg-orange-500/15 text-orange-900",
    chipWall: "bg-orange-400/20 text-orange-100",
    hex: "#EA580C",
    hexWall: "#F97316",
  },
  red: {
    ink: "text-red-600",
    inkWall: "text-red-400",
    bar: "bg-red-500",
    barWall: "bg-red-500",
    chip: "bg-red-500/15 text-red-800",
    chipWall: "bg-red-500/20 text-red-100",
    hex: "#EF4444",
    hexWall: "#F87171",
  },
};

/** Показатели без плана тоже говорят цветом: просрочка — красная. */
export const TONE_UI = {
  good: { ink: "text-emerald-700", inkWall: "text-emerald-300" },
  warn: { ink: "text-orange-700", inkWall: "text-orange-300" },
  bad: { ink: "text-red-700", inkWall: "text-red-400" },
  neutral: { ink: "text-ink", inkWall: "text-white" },
} as const;
