import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { STATUS_UI, type PlanState } from "./status";

/**
 * Шкалы выполнения плана (07.09).
 *
 * Заказчик: «есть норма, норма это к примеру сто процентов, и нам нужно до
 * этой нормы дойти». Полукруг с подписями 0% и 100% — норма это правый
 * край дуги. Вся геометрия и цифра живут внутри svg (viewBox), а сам svg
 * вписывается в выделенный ему бокс целиком (preserveAspectRatio meet) —
 * поэтому гейдж никогда не обрезается, каким бы ни был размер плитки.
 */

const VB_W = 300;
const VB_H = 176;

export function HalfRing({
  state,
  wall = false,
  hidden = false,
  showLabels = true,
  fill = false,
  className,
}: {
  state: PlanState;
  wall?: boolean;
  /** Прибыль под ключом директора — дугу и цифру не показываем. */
  hidden?: boolean;
  showLabels?: boolean;
  /** Занять весь бокс родителя (высоту и ширину), сохранив пропорции. */
  fill?: boolean;
  className?: string;
}) {
  const ui = STATUS_UI[state.status];
  const shown = useCountUp(hidden ? 0 : state.pct);

  const stroke = 30;
  const radius = (VB_W - stroke) / 2 - 6;
  const cx = VB_W / 2;
  const cy = VB_H - 30;
  const circ = Math.PI * radius;
  const filled = hidden ? 0 : Math.min(100, state.pct) / 100;

  const innerR = radius - stroke - 6;
  const tickA = (Math.min(100, state.expectedPct) / 100) * Math.PI - Math.PI;
  const showTick = !hidden && state.expectedPct > 3 && state.expectedPct < 98;

  const arc = (r: number) =>
    `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  const track = wall ? "rgba(255,255,255,0.14)" : "rgba(15,23,42,0.08)";
  const hair = wall ? "rgba(255,255,255,0.22)" : "rgba(15,23,42,0.14)";
  const label = wall ? "rgba(255,255,255,0.5)" : "rgba(15,23,42,0.4)";

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn(fill ? "h-full w-full" : "h-auto w-full", className)}
      role="img"
      aria-label={`${state.pct}% от нормы`}
    >
      <path d={arc(innerR)} fill="none" stroke={hair} strokeWidth={1.5} />
      <path d={arc(radius)} fill="none" stroke={track} strokeWidth={stroke} />
      {filled > 0 && (
        <path
          d={arc(radius)}
          fill="none"
          stroke={wall ? ui.hexWall : ui.hex}
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - filled)}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
      )}
      {showTick && (
        <line
          x1={cx + Math.cos(tickA) * (radius - stroke / 2 - 4)}
          y1={cy + Math.sin(tickA) * (radius - stroke / 2 - 4)}
          x2={cx + Math.cos(tickA) * (radius + stroke / 2 + 4)}
          y2={cy + Math.sin(tickA) * (radius + stroke / 2 + 4)}
          stroke={wall ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.6)"}
          strokeWidth={5}
          strokeLinecap="round"
        />
      )}

      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fontSize={hidden ? 46 : shown >= 100 ? 62 : 70}
        fontWeight={800}
        letterSpacing={-2.5}
        fill={hidden ? label : wall ? "#ffffff" : "#0f172a"}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {hidden ? "•••" : `${shown}%`}
      </text>

      {showLabels && (
        <>
          <text x={cx - radius} y={cy + 26} textAnchor="middle" fontSize={22} fontWeight={600} fill={label}>
            0%
          </text>
          <text x={cx + radius} y={cy + 26} textAnchor="middle" fontSize={22} fontWeight={600} fill={label}>
            100%
          </text>
        </>
      )}
    </svg>
  );
}

/**
 * Толстая шкала до нормы: правый край — 100%, засечка — где должны быть
 * сегодня. Высота ≈ десятая часть плитки, чтобы читалась издалека.
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
      style={{ height: "max(8px, min(9cqh, 26px))" }}
      className={cn(
        "relative w-full overflow-hidden rounded-full",
        wall ? "bg-white/[0.12]" : "bg-ink/[0.08]",
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
            wall ? "bg-white/90" : "bg-ink/60",
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
      style={{
        fontSize: "max(9px, min(3.4cqmin, 18px))",
        padding: "max(2px,0.7cqmin) max(6px,1.7cqmin)",
      }}
      className={cn(
        "inline-flex w-fit shrink-0 items-center truncate rounded-full font-bold",
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
