import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { STATUS_UI, type PlanState } from "./status";

/**
 * Шкалы выполнения плана (07.09, вторая правка заказчика).
 *
 * Заказчик: «есть норма, норма это к примеру сто процентов, и нам нужно до
 * этой нормы дойти» + «всё должно подстраиваться под монитор». Поэтому:
 *
 *  • полукруг с подписями 0% и 100% — норма видна как правый край дуги;
 *  • вся геометрия и цифра живут ВНУТРИ svg (viewBox), поэтому гейдж
 *    масштабируется вместе с плиткой без единой строчки на JS;
 *  • заливка и счётчик анимируются при появлении — дуга доезжает до нормы.
 */

const VB_W = 300;
const VB_H = 186;

export function HalfRing({
  state,
  wall = false,
  hidden = false,
  showLabels = true,
  className,
}: {
  state: PlanState;
  wall?: boolean;
  /** Прибыль под ключом директора — дугу и цифру не показываем. */
  hidden?: boolean;
  showLabels?: boolean;
  className?: string;
}) {
  const ui = STATUS_UI[state.status];
  const shown = useCountUp(hidden ? 0 : state.pct);

  const stroke = 26;
  const radius = (VB_W - stroke) / 2 - 8;
  const cx = VB_W / 2;
  const cy = VB_H - 26;
  const circ = Math.PI * radius;
  const filled = hidden ? 0 : Math.min(100, state.pct) / 100;

  // Тонкая внутренняя дуга — как в образце, добавляет аккуратности.
  const innerR = radius - stroke - 5;
  // Засечка «где мы должны быть сегодня».
  const tickA = (Math.min(100, state.expectedPct) / 100) * Math.PI - Math.PI;
  const showTick = !hidden && state.expectedPct > 3 && state.expectedPct < 98;

  const arc = (r: number) =>
    `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const track = wall ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.08)";
  const hair = wall ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.14)";
  const label = wall ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.35)";

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      className={cn("h-auto w-full", className)}
      role="img"
      aria-label={`${state.pct}% от плана`}
    >
      <path d={arc(innerR)} fill="none" stroke={hair} strokeWidth={1.5} />
      <path
        d={arc(radius)}
        fill="none"
        stroke={track}
        strokeWidth={stroke}
        strokeLinecap="butt"
      />
      {filled > 0 && (
        <path
          d={arc(radius)}
          fill="none"
          stroke={wall ? ui.hexWall : ui.hex}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - filled)}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      )}
      {showTick && (
        <line
          x1={cx + Math.cos(tickA) * (radius - stroke / 2 - 3)}
          y1={cy + Math.sin(tickA) * (radius - stroke / 2 - 3)}
          x2={cx + Math.cos(tickA) * (radius + stroke / 2 + 3)}
          y2={cy + Math.sin(tickA) * (radius + stroke / 2 + 3)}
          stroke={wall ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.6)"}
          strokeWidth={5}
          strokeLinecap="round"
        />
      )}

      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fontSize={62}
        fontWeight={800}
        letterSpacing={-2}
        fill={hidden ? label : wall ? ui.hexWall : ui.hex}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {hidden ? "•••" : `${shown}%`}
      </text>

      {showLabels && (
        <>
          <text x={cx - radius} y={cy + 24} textAnchor="middle" fontSize={20} fill={label}>
            0%
          </text>
          <text x={cx + radius} y={cy + 24} textAnchor="middle" fontSize={20} fill={label}>
            100%
          </text>
        </>
      )}
    </svg>
  );
}

/**
 * Толстая шкала — для узких плиток, где полукруг не помещается.
 * Норма (100%) отмечена правым краем, засечка — ожидаемый темп.
 */
export function PlanBarThick({
  state,
  wall = false,
  hidden = false,
  className,
}: {
  state: PlanState;
  wall?: boolean;
  hidden?: boolean;
  className?: string;
}) {
  const ui = STATUS_UI[state.status];
  const showTick = !hidden && state.expectedPct > 3 && state.expectedPct < 98;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full",
        "h-[max(6px,min(2.2cqh,14px))]",
        wall ? ui.trackWall : ui.track,
        className,
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-700 ease-out",
          wall ? ui.barWall : ui.bar,
        )}
        style={{ width: hidden ? 0 : `${Math.min(100, state.pct)}%` }}
      />
      {showTick && (
        <span
          aria-hidden
          className={cn(
            "absolute top-0 h-full w-[3px] rounded-full",
            wall ? "bg-white/85" : "bg-ink/55",
          )}
          style={{ left: `calc(${state.expectedPct}% - 1.5px)` }}
        />
      )}
    </div>
  );
}

/** Чип статуса: «идём с опережением» / «отстаём от графика». */
export function StatusChip({
  state,
  wall = false,
  className,
}: {
  state: PlanState;
  wall?: boolean;
  className?: string;
}) {
  const ui = STATUS_UI[state.status];
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full font-bold",
        "px-[max(6px,1.6cqmin)] py-[max(2px,0.7cqmin)]",
        "text-[max(9px,min(3.4cqmin,17px))]",
        wall ? ui.chipWall : ui.chip,
        className,
      )}
    >
      {state.label}
    </span>
  );
}

/** Счётчик добегает до значения — цифра «доходит до нормы», а не появляется. */
function useCountUp(target: number, ms = 900): number {
  const [v, setV] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      setV(Math.round(a + (target - a) * eased));
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
