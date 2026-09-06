import { cn } from "@/lib/utils";
import { STATUS_UI, type PlanState } from "./status";

/**
 * Кольцо и шкала выполнения плана (06.09, вечерняя правка).
 *
 * Заказчик: «тонкая-тонюсенькая линия очень плохо считывается, тем более
 * на втором мониторе». Поэтому здесь всё намеренно толстое: дуга кольца
 * 12–24px, шкала 10–24px, и обязательно засечка «где мы должны быть
 * сегодня» — по ней видно опережение и отставание без чтения цифр.
 */

export function PlanRing({
  state,
  size,
  stroke,
  wall = false,
  hidden = false,
}: {
  state: PlanState;
  size: number;
  stroke: number;
  wall?: boolean;
  /** Прибыль под ключом директора — дугу не рисуем, по ней читается сумма. */
  hidden?: boolean;
}) {
  const ui = STATUS_UI[state.status];
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = hidden ? 0 : Math.min(100, state.pct) / 100;
  // Засечка «ожидаем к этой минуте» — рисуем, только если период ещё идёт.
  const showTick = !hidden && state.expectedPct > 4 && state.expectedPct < 99;
  const tickAngle = (state.expectedPct / 100) * 360 - 90;
  const tickOuter = size / 2 + stroke / 2 + (wall ? 4 : 2.5);
  const tickInner = size / 2 - stroke / 2 - (wall ? 4 : 2.5);
  const rad = (tickAngle * Math.PI) / 180;
  const cx = size / 2;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Дорожка нейтральная — так залитая часть читается контрастнее. */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={wall ? "rgba(255,255,255,0.13)" : "rgba(15,23,42,0.09)"}
        />
        {filled > 0 && (
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={wall ? ui.hexWall : ui.hex}
          strokeDasharray={`${c * filled} ${c}`}
          transform={`rotate(-90 ${cx} ${cx})`}
          style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.22,1,0.36,1)" }}
        />
        )}
        {showTick && (
          <line
            x1={cx + Math.cos(rad) * tickInner}
            y1={cx + Math.sin(rad) * tickInner}
            x2={cx + Math.cos(rad) * tickOuter}
            y2={cx + Math.sin(rad) * tickOuter}
            strokeWidth={wall ? 5 : 3}
            strokeLinecap="round"
            stroke={wall ? "rgba(255,255,255,0.85)" : "rgba(15,23,42,0.55)"}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div
          className={cn(
            "font-display font-extrabold leading-none tabular-nums",
            wall ? ui.inkWall : ui.ink,
          )}
          style={{ fontSize: Math.round(size * (wall ? 0.28 : 0.3)) }}
        >
          {hidden ? "•••" : `${state.pct}%`}
        </div>
      </div>
    </div>
  );
}

/**
 * Толстая шкала — там, где кольцо не помещается (маленькая плитка, сводка).
 * Засечка ожидаемого темпа — вертикальная риска поверх дорожки.
 */
export function PlanBarThick({
  state,
  wall = false,
  height,
  hidden = false,
  className,
}: {
  state: PlanState;
  wall?: boolean;
  height: number;
  hidden?: boolean;
  className?: string;
}) {
  const ui = STATUS_UI[state.status];
  const showTick = !hidden && state.expectedPct > 4 && state.expectedPct < 99;
  return (
    <div
      className={cn(
        "relative w-full overflow-hidden rounded-full",
        wall ? ui.trackWall : ui.track,
        className,
      )}
      style={{ height }}
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
          title="где должны быть к сегодня"
          className={cn(
            "absolute top-0 h-full rounded-full",
            wall ? "bg-white/85" : "bg-ink/55",
          )}
          style={{
            left: `calc(${state.expectedPct}% - ${wall ? 2 : 1.5}px)`,
            width: wall ? 4 : 3,
          }}
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
        "inline-flex shrink-0 items-center rounded-full font-bold",
        wall ? "px-3 py-1 text-[16px]" : "px-2 py-0.5 text-[11px]",
        wall ? ui.chipWall : ui.chip,
        className,
      )}
    >
      {state.label}
    </span>
  );
}
