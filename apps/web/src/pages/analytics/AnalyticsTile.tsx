import { useState } from "react";
import {
  Bike,
  GripVertical,
  Receipt,
  Target,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardPeriod, BoardTile } from "./board";
import { METRIC_GROUP_UI, type MetricDef, type MetricValue } from "./metrics";
import { planState, STATUS_UI } from "./status";
import { HalfRing, PlanBarThick } from "./Gauge";
import { ResizeHandle } from "./ResizeHandle";

/**
 * Плитка показателя (07.09, четвёртая правка — «с десяти метров непонятно»).
 *
 * Схема, по которой собрана плитка:
 *  1. Заголовок читается ПЕРВЫМ: обычный регистр, жирный, крупный (около
 *     40% от цифры), слева иконка направления в цветном квадратике —
 *     «это про продажи» видно раньше, чем прочитано слово.
 *  2. Один тип визуала на один тип показателя:
 *       • процент (загрузка парка)     → радиальный гейдж до нормы 100%;
 *       • показатель с планом          → огромная цифра + толстая шкала + %;
 *       • показатель без плана         → огромная цифра + подпись.
 *  3. Цифра заполняет плитку: кегль считается от высоты плитки И от длины
 *     числа, поэтому «4» выходит гигантской, а «274 000 ₽» — во всю ширину.
 *  4. Всё в единицах контейнера (cqh/cqw) — ничего не обрезается ни на
 *     ноутбуке, ни на мониторе под потолком.
 */

const GROUP_ICON = {
  bike: Bike,
  wallet: Wallet,
  wrench: Wrench,
  receipt: Receipt,
  target: Target,
} as const;

export function AnalyticsTile({
  def,
  value,
  tile,
  period,
  wall = false,
  compact = false,
  cols = 4,
  primary = false,
  editing = false,
  onResize,
  onRemove,
  onPlan,
  onDragStart,
  ghost,
  index,
}: {
  def: MetricDef;
  value: MetricValue | undefined;
  tile: BoardTile;
  period: BoardPeriod;
  wall?: boolean;
  /** Телефон: одна колонка, высота по содержимому. */
  compact?: boolean;
  cols?: number;
  /** Единственный тёмный блок-герой на светлой доске. */
  primary?: boolean;
  editing?: boolean;
  onResize?: (w: number, h: number) => void;
  onRemove?: () => void;
  onPlan?: (plan: number | null) => void;
  onDragStart?: (e: React.PointerEvent) => void;
  ghost?: boolean;
  index?: number;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState(
    tile.plan != null ? String(tile.plan) : "",
  );
  const w = Math.min(tile.w, cols);
  const h = compact ? 1 : tile.h;
  const hero = primary && !wall;
  const dark = hero || wall;
  const revealed = useSensitiveRevealed();
  const hidden = !!def.sensitive && !revealed;

  const planValue =
    !def.comingSoon && tile.plan != null && tile.plan > 0 ? tile.plan : null;
  const state =
    planValue != null
      ? planState(value?.value ?? 0, planValue, !!def.periodic, period)
      : null;
  const tone = value?.tone ?? "neutral";
  const ui = state ? STATUS_UI[state.status] : null;
  const group = METRIC_GROUP_UI[def.group];
  const GroupIcon = GROUP_ICON[group.icon];

  // Загрузка парка: дуга рисует сам показатель, засечка — план.
  const gaugeMode = !!def.percentValue && state != null && !compact;
  const gaugeState =
    gaugeMode && state
      ? {
          ...state,
          pct: Math.round(value?.value ?? 0),
          expectedPct: Math.min(100, planValue!),
        }
      : null;

  const spanStyle = {
    gridColumn: `span ${w}`,
    gridRow: `span ${h}`,
  };

  if (ghost) {
    return (
      <div
        data-tile-index={index}
        data-flip-key={def.id}
        style={{ ...spanStyle, borderRadius: "clamp(16px, 3cqmin, 30px)" }}
        className={cn(
          "border-2 border-dashed",
          wall ? "border-white/25 bg-white/[0.03]" : "border-ink/20 bg-ink/[0.03]",
        )}
      />
    );
  }

  const display = value?.display ?? "—";
  const numberTone = dark
    ? tone === "bad"
      ? "text-red-400"
      : "text-white"
    : tone === "bad"
      ? "text-red-ink"
      : "text-ink";

  return (
    <div
      data-tile-index={index}
      data-flip-key={def.id}
      style={{
        ...spanStyle,
        containerType: compact ? "inline-size" : "size",
        borderRadius: "clamp(16px, 3cqmin, 30px)",
        padding: "clamp(12px, 4.5cqmin, 40px)",
        minHeight: compact ? 150 : undefined,
      }}
      className={cn(
        "group/tile relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        hero
          ? "bg-ink"
          : wall
            ? "bg-white/[0.035] ring-1 ring-inset ring-white/[0.07]"
            : "bg-surface ring-1 ring-inset ring-black/[0.05]",
        editing && "select-none",
      )}
    >
      {hero && <HeroTexture />}

      {/* ---- Заголовок: иконка направления + название ---- */}
      <div className="relative flex shrink-0 items-center justify-between gap-2">
        <div
          style={{ fontSize: titleSize(compact) }}
          className={cn(
            "flex min-w-0 items-center gap-[0.5em] font-bold leading-tight",
            dark ? "text-white/85" : "text-ink",
          )}
        >
          <span
            className={cn(
              "flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-[0.4em]",
              dark ? group.chipDark : group.chip,
            )}
          >
            <GroupIcon className="h-[0.95em] w-[0.95em]" />
          </span>
          <span className="truncate">{def.title}</span>
        </div>
        {editing && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5 transition-opacity",
              compact ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100",
            )}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span
              title="Перетащить"
              onPointerDown={onDragStart}
              className={cn(
                "flex h-7 w-7 cursor-grab items-center justify-center rounded-md active:cursor-grabbing",
                dark
                  ? "text-white/50 hover:bg-white/15 hover:text-white"
                  : "text-muted-2 hover:bg-surface-soft hover:text-ink",
              )}
            >
              <GripVertical size={16} />
            </span>
            {def.planable && !def.comingSoon && (
              <button
                type="button"
                title="План"
                onClick={() => setPlanOpen((v) => !v)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md",
                  dark
                    ? "text-white/50 hover:bg-white/15 hover:text-white"
                    : planValue != null
                      ? "text-blue-600 hover:bg-surface-soft"
                      : "text-muted-2 hover:bg-surface-soft hover:text-ink",
                )}
              >
                <Target size={14} />
              </button>
            )}
            <button
              type="button"
              title="Убрать с доски"
              onClick={onRemove}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md",
                dark
                  ? "text-white/50 hover:bg-red-500/30 hover:text-white"
                  : "text-muted-2 hover:bg-red-soft hover:text-red-ink",
              )}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ---- Тело ---- */}
      {gaugeMode && gaugeState ? (
        /* Процент: гейдж до нормы занимает всё, что осталось */
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center">
          <div className="flex min-h-0 w-full flex-1 items-center justify-center py-[1cqh]">
            <HalfRing state={gaugeState} wall={dark} hidden={hidden} showLabels fill />
          </div>
          {value?.caption && (
            <div
              style={{ fontSize: captionSize(compact) }}
              className={cn(
                "a-hide-xs w-full truncate text-center font-semibold",
                dark ? "text-white/60" : "text-muted",
              )}
            >
              {value.caption}
              {value.extra ? ` · ${value.extra}` : ""}
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col justify-center">
          <div
            style={{ fontSize: numberSize(display, !!state, compact) }}
            className={cn(
              "truncate font-display font-extrabold leading-[0.95] tracking-[-0.035em] tabular-nums",
              numberTone,
            )}
          >
            {def.sensitive ? <Sensitive dark={dark}>{display}</Sensitive> : display}
          </div>
          {value?.caption && (
            <div
              style={{ fontSize: captionSize(compact), marginTop: "0.9cqh" }}
              className={cn(
                "a-hide-xs truncate",
                dark ? "text-white/55" : "text-muted",
              )}
            >
              {value.caption}
              {value.extra && <span className="a-hide-sm"> · {value.extra}</span>}
            </div>
          )}
        </div>
      )}

      {/* ---- План: толстая шкала до нормы + крупный процент ---- */}
      {state && !gaugeMode && (
        <footer className="relative flex shrink-0 flex-col" style={{ gap: "1.1cqh" }}>
          <div className="flex items-center" style={{ gap: "3cqw" }}>
            <PlanBarThick state={state} wall={dark} hidden={hidden} className="min-w-0 flex-1" />
            <span
              style={{ fontSize: pctSize(compact) }}
              className={cn(
                "shrink-0 font-display font-extrabold leading-none tabular-nums",
                dark ? ui!.inkWall : ui!.ink,
              )}
            >
              {hidden ? <Sensitive dark={dark}>{state.pct}%</Sensitive> : `${state.pct}%`}
            </span>
          </div>
          <div
            style={{ fontSize: captionSize(compact) }}
            className={cn(
              "a-hide-xxs flex items-baseline justify-between gap-2",
              dark ? "text-white/50" : "text-muted",
            )}
          >
            <span className="truncate">план {def.format(planValue!)}</span>
            {!hidden && (
              <span className={cn("shrink-0 font-semibold", dark ? ui!.inkWall : ui!.ink)}>
                {state.label}
              </span>
            )}
          </div>
        </footer>
      )}

      {editing && onResize && !compact && (
        <ResizeHandle w={tile.w} h={tile.h} cols={cols} onChange={onResize} dark={dark} />
      )}

      {editing && planOpen && (
        <div
          className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-card"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <input
            autoFocus
            inputMode="numeric"
            value={planDraft}
            onChange={(e) => setPlanDraft(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="план"
            className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-[13px] font-bold tabular-nums outline-none focus:border-blue-600"
          />
          <button
            type="button"
            onClick={() => {
              onPlan?.(planDraft ? Number(planDraft) : null);
              setPlanOpen(false);
            }}
            className="h-8 rounded-lg bg-ink px-3 text-[12px] font-bold text-white"
          >
            ОК
          </button>
          {planValue != null && (
            <button
              type="button"
              title="Убрать план"
              onClick={() => {
                setPlanDraft("");
                onPlan?.(null);
                setPlanOpen(false);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-red-soft hover:text-red-ink"
            >
              <X size={13} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** Заголовок ≈ 13% высоты плитки, но не шире плитки. */
function titleSize(compact: boolean): string {
  return compact ? "17px" : "max(12px, min(12cqh, 7.5cqw, 36px))";
}

function captionSize(compact: boolean): string {
  return compact ? "13px" : "max(10px, min(8.5cqh, 5cqw, 26px))";
}

function pctSize(compact: boolean): string {
  return compact ? "22px" : "max(14px, min(20cqh, 11cqw))";
}

/**
 * Цифра во всю ширину: ширина знака у дисплейного шрифта ≈ 0.6em, значит
 * кегль ≤ 92cqw / (0.6 × знаков). Сверху ограничиваем высотой — чтобы
 * с толстой шкалой и подписью всё влезло.
 */
function numberSize(display: string, withPlan: boolean, compact: boolean): string {
  if (compact) return "40px";
  const chars = Math.max(1, display.replace(/\s/g, "").length + (display.includes(" ") ? 0.4 : 0));
  const byWidth = (92 / (0.6 * chars)).toFixed(1);
  const byHeight = withPlan ? 44 : 52;
  return `max(20px, min(${byHeight}cqh, ${byWidth}cqw))`;
}

/** Диагональная штриховка под радиальной маской — из образца заказчика. */
function HeroTexture() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 opacity-30"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, #808080 0px 1px, transparent 1px 10px)",
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 50% at 100% 0%, #000 70%, transparent 110%)",
        maskImage:
          "radial-gradient(ellipse 80% 50% at 100% 0%, #000 70%, transparent 110%)",
      }}
    />
  );
}
