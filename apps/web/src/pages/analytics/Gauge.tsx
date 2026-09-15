import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { STATUS_UI, type PlanState } from "./status";

/**
 * Радиальный гейдж «до нормы» (07.09) — повтор элемента, который прислал
 * заказчик (AnimatedRadialChart): градиентная дорожка с тенью, тонкая
 * внутренняя дуга, заливка до значения, «палочка» на конце заливки,
 * подписи 0% и 100%, счётчик в центре. Отличия ровно два:
 *   • цвет — один критерий: наполняется хорошо → зелёный,
 *     слабый показатель → оранжево-красный;
 *   • вся геометрия в viewBox, поэтому гейдж масштабируется с плиткой.
 * Анимация на requestAnimationFrame (без framer-motion): значение
 * доезжает за 2 секунды с easeOut, палочка едет вместе с ним.
 */

const SIZE = 300;
const H = SIZE * 0.7;

export function HalfRing({
  state,
  wall = false,
  hidden = false,
  showLabels = true,
  fill = false,
  duration = 2,
  className,
}: {
  state: PlanState;
  wall?: boolean;
  /** Прибыль под ключом директора — дугу и цифру не показываем. */
  hidden?: boolean;
  showLabels?: boolean;
  /** Занять весь бокс родителя, сохранив пропорции. */
  fill?: boolean;
  duration?: number;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const target = hidden ? 0 : Math.min(100, state.pct);
  const v = useAnimatedValue(target, duration * 1000);

  const strokeWidth = Math.max(12, SIZE * 0.06);
  const radius = SIZE * 0.35;
  const center = SIZE / 2;
  const circumference = Math.PI * radius;
  const innerLineRadius = radius - strokeWidth - 4;
  const innerRadius = radius - strokeWidth / 2;

  const offset = circumference - (v / 100) * circumference;
  const angle = -Math.PI + (v / 100) * Math.PI;
  const lx1 = center + Math.cos(angle) * innerRadius;
  const ly1 = center + Math.sin(angle) * innerRadius;
  const lx2 = lx1 - Math.cos(angle) * 30;
  const ly2 = ly1 - Math.sin(angle) * 30;

  const good = state.status !== "weak";
  const fontSize = Math.max(16, SIZE * 0.1) * 1.45;
  const labelFontSize = Math.max(12, SIZE * 0.04) * 1.35;
  const arc = (r: number) =>
    `M ${center - r} ${center} A ${r} ${r} 0 0 1 ${center + r} ${center}`;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      className={cn("overflow-visible", fill ? "h-full w-full" : "h-auto w-full", className)}
      role="img"
      aria-label={`${state.pct}% от нормы`}
    >
      <defs>
        {/* Дорожка: светлая, с серебром — как в образце */}
        <linearGradient id={`base-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
          {wall ? (
            <>
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="50%" stopColor="#d1d5db" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#6b7280" stopOpacity="0.6" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#e5e7eb" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#d1d5db" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#9ca3af" stopOpacity="0.8" />
            </>
          )}
        </linearGradient>
        {/* Заливка: один критерий цвета — хорошо / слабо */}
        <linearGradient id={`progress-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          {good ? (
            <>
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="50%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#ea580c" />
              <stop offset="100%" stopColor="#dc2626" />
            </>
          )}
        </linearGradient>
        <linearGradient id={`text-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          {wall ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#9ca3af" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#475569" />
            </>
          )}
        </linearGradient>
        <linearGradient id={`needle-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={wall ? "#ffffff" : "#0f172a"} stopOpacity="0.7" />
          <stop offset="100%" stopColor="#6b7280" stopOpacity="0.3" />
        </linearGradient>
        <filter id={`shadow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Тонкая внутренняя дуга */}
      <path
        d={arc(innerLineRadius)}
        fill="none"
        stroke="#6b7280"
        strokeWidth={1}
        strokeLinecap="butt"
        opacity={0.6}
      />
      {/* Дорожка */}
      <path
        d={arc(radius)}
        fill="none"
        stroke={`url(#base-${uid})`}
        strokeWidth={strokeWidth}
        strokeLinecap="butt"
        filter={`url(#shadow-${uid})`}
      />
      {/* Заливка до значения */}
      {!hidden && (
        <path
          d={arc(radius)}
          fill="none"
          stroke={`url(#progress-${uid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          filter={`url(#shadow-${uid})`}
        />
      )}
      {/* Палочка на конце заливки — едет вместе с ней */}
      {!hidden && (
        <line
          x1={lx1}
          y1={ly1}
          x2={lx2}
          y2={ly2}
          stroke={`url(#needle-${uid})`}
          strokeWidth={1.5}
          strokeLinecap="butt"
        />
      )}

      {/* Счётчик в центре */}
      <text
        x={center}
        y={center + 34}
        textAnchor="middle"
        fontSize={fontSize}
        fontWeight={800}
        letterSpacing={-2}
        fill={hidden ? "#6b7280" : `url(#text-${uid})`}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {hidden ? "•••" : `${Math.round(v)}%`}
      </text>

      {showLabels && (
        <>
          <text
            x={center - radius - 5}
            y={center + strokeWidth / 2 + labelFontSize * 1.15}
            fontSize={labelFontSize}
            fontWeight={500}
            fill="#9ca3af"
          >
            0%
          </text>
          <text
            x={center + radius - 24}
            y={center + strokeWidth / 2 + labelFontSize * 1.15}
            fontSize={labelFontSize}
            fontWeight={500}
            fill="#9ca3af"
          >
            100%
          </text>
        </>
      )}
    </svg>
  );
}

/**
 * Толстая шкала до нормы: правый край — 100%. Цвет — тот же один критерий.
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
    </div>
  );
}

/**
 * Метка «план выполнен» — галочка в зелёном кружке, как принято в
 * современных дашбордах: видна издалека и не требует чтения процентов.
 */
export function DoneBadge({
  wall = false,
  withText = true,
  className,
}: {
  wall?: boolean;
  withText?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-[0.35em] rounded-full font-bold",
        withText ? "px-[0.7em] py-[0.25em]" : "p-[0.25em]",
        wall ? "bg-emerald-400/20 text-emerald-200" : "bg-emerald-500/15 text-emerald-800",
        className,
      )}
      title="План выполнен"
    >
      <svg viewBox="0 0 20 20" className="h-[1.15em] w-[1.15em]" aria-hidden>
        <circle cx="10" cy="10" r="10" fill={wall ? "#34d399" : "#10b981"} />
        <path d="M5.5 10.5 8.5 13.5 14.5 7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {withText && <span>план выполнен</span>}
    </span>
  );
}

/** Значение доезжает до цели с easeOut — как animate() у framer-motion. */
function useAnimatedValue(target: number, ms: number): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const eased = 1 - Math.pow(1 - k, 3);
      const cur = a + (target - a) * eased;
      setV(cur);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      from.current = v;
    };
    // v намеренно не в зависимостях: это стартовая точка следующей анимации
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, ms]);
  return v;
}
