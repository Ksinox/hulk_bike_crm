import { useState } from "react";
import { GripVertical, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardPeriod, BoardTile, TileSize } from "./board";
import type { MetricDef, MetricValue } from "./metrics";
import { planState, STATUS_UI } from "./status";
import { HalfRing, PlanBarThick, StatusChip } from "./Gauge";
import { SizePicker } from "./SizePicker";
import { ResizeHandle } from "./ResizeHandle";

/**
 * Плитка показателя (07.09, третья правка — «а у тебя цирк»).
 *
 * Стилистика намеренно спокойная, как в образце заказчика: одна
 * плитка-герой на тёмном фоне с диагональной фактурой, остальные —
 * ровные карточки с тонкой рамкой. Цветом говорит только то, что должно:
 * дуга гейджа, процент выполнения и красная цифра, если горит. Заливку
 * всей плитки убрал — от неё рябило.
 *
 * Размеры внутри — в единицах контейнера (cqh/cqw/cqmin), поэтому плитка
 * одинаково аккуратна и на ноутбуке, и на большом мониторе.
 */

/** Колонок и рядов под плитку. Ширина героя зависит от ширины сетки. */
export function spanOf(size: TileSize, cols: number) {
  if (size === "s") return { col: 1, row: 1 };
  if (size === "m") return { col: Math.min(2, cols), row: 1 };
  return { col: Math.min(cols, Math.max(2, Math.round(cols / 2))), row: 2 };
}

/** Спаны для расчёта числа рядов на экране-стене. */
export const SIZE_SPAN: Record<TileSize, { col: number; row: number }> = {
  s: { col: 1, row: 1 },
  m: { col: 2, row: 1 },
  l: { col: 3, row: 2 },
};

export function AnalyticsTile({
  def,
  value,
  tile,
  period,
  wall = false,
  compact = false,
  cols = 6,
  primary = false,
  editing = false,
  onSize,
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
  compact?: boolean;
  cols?: number;
  /**
   * Плитка-герой на тёмном фоне. Такая на доске одна — как в образце
   * заказчика: один заметный блок, остальные ровные и спокойные.
   */
  primary?: boolean;
  editing?: boolean;
  onSize?: (size: TileSize) => void;
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
  const span = spanOf(tile.size, cols);
  const big = tile.size === "l";
  const hero = big && primary;
  const tiny = tile.size === "s";
  const revealed = useSensitiveRevealed();
  const hidden = !!def.sensitive && !revealed;
  const dark = hero || wall;

  const planValue =
    !def.comingSoon && tile.plan != null && tile.plan > 0 ? tile.plan : null;
  const state =
    planValue != null
      ? planState(value?.value ?? 0, planValue, !!def.periodic, period)
      : null;
  const tone = value?.tone ?? "neutral";
  const ui = state ? STATUS_UI[state.status] : null;

  const ringIsValue = !!def.percentValue && state != null;
  const ringState =
    ringIsValue && state
      ? {
          ...state,
          pct: Math.round(value?.value ?? 0),
          expectedPct: Math.min(100, planValue!),
        }
      : state;
  const withRing = state != null && !tiny && !compact;
  // Кегль цифры считаем от реального размера плитки, а не от «геройства».

  const spanStyle = {
    gridColumn: `span ${span.col}`,
    gridRow: `span ${compact ? 1 : span.row}`,
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

  /** Цифра спокойная; красным горит только то, что требует действия. */
  const numberTone = dark
    ? tone === "bad"
      ? "text-red-400"
      : "text-white"
    : tone === "bad"
      ? "text-red-ink"
      : "text-ink";

  const title = (
    <span
      style={{ fontSize: "max(9px, min(3.1cqmin, 17px))" }}
      className={cn(
        "flex min-w-0 items-center gap-[0.6em] font-semibold uppercase tracking-[0.16em]",
        dark ? "text-white/45" : "text-muted-2",
      )}
    >
      {state && (
        <span
          aria-hidden
          className={cn(
            "h-[0.55em] w-[0.55em] shrink-0 rounded-full",
            dark ? ui!.barWall : ui!.bar,
          )}
        />
      )}
      <span className="truncate">{def.title}</span>
    </span>
  );

  const number = !ringIsValue && (
    <div
      style={{ fontSize: numberSize(tile.size, withRing) }}
      className={cn(
        "truncate font-display font-extrabold leading-[0.92] tracking-[-0.035em] tabular-nums",
        numberTone,
      )}
    >
      {def.sensitive ? (
        <Sensitive dark={dark}>{value?.display ?? "—"}</Sensitive>
      ) : (
        (value?.display ?? "—")
      )}
    </div>
  );

  const caption = value?.caption ? (
    <div
      style={{
        fontSize: ringIsValue
          ? "max(12px, min(5cqmin, 30px))"
          : "max(10px, min(3.6cqmin, 22px))",
      }}
      className={cn(
        "truncate",
        ringIsValue ? "font-bold" : "a-hide-xs",
        dark ? "text-white/50" : "text-muted",
      )}
    >
      {value.caption}
    </div>
  ) : null;

  const extra = value?.extra ? (
    <div
      style={{ fontSize: "max(9px, min(3.1cqmin, 19px))" }}
      className={cn(
        "a-hide-sm truncate font-semibold",
        dark ? "text-white/35" : "text-muted-2",
      )}
    >
      {value.extra}
    </div>
  ) : null;

  const gauge =
    withRing && ringState ? (
      <div
        className="flex shrink-0 items-center justify-center"
        style={{ width: big ? "48%" : "42%" }}
      >
        <HalfRing
          state={ringState}
          wall={dark}
          hidden={hidden}
          showLabels={big}
        />
      </div>
    ) : null;

  return (
    <div
      data-tile-index={index}
      data-flip-key={def.id}
      style={{
        ...spanStyle,
        containerType: "size",
        borderRadius: "clamp(16px, 3cqmin, 30px)",
        padding: "clamp(12px, 3.8cqmin, 38px)",
      }}
      className={cn(
        "group/tile relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        hero
          ? wall
            ? "bg-white/[0.08] ring-1 ring-inset ring-white/10"
            : "bg-ink"
          : wall
            ? "bg-white/[0.035] ring-1 ring-inset ring-white/[0.07]"
            : "bg-surface ring-1 ring-inset ring-black/[0.05]",
        editing && "select-none",
      )}
    >
      {hero && <HeroTexture />}

      <div className="relative flex shrink-0 items-start justify-between gap-2">
        {title}
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
                "flex h-6 w-6 cursor-grab items-center justify-center rounded-md active:cursor-grabbing",
                dark
                  ? "text-white/50 hover:bg-white/15 hover:text-white"
                  : "text-muted-2 hover:bg-surface-soft hover:text-ink",
              )}
            >
              <GripVertical size={15} />
            </span>
            <SizePicker value={tile.size} onChange={(s) => onSize?.(s)} dark={dark} />
            {def.planable && !def.comingSoon && (
              <button
                type="button"
                title="План"
                onClick={() => setPlanOpen((v) => !v)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md",
                  dark
                    ? "text-white/50 hover:bg-white/15 hover:text-white"
                    : planValue != null
                      ? "text-blue-600 hover:bg-surface-soft"
                      : "text-muted-2 hover:bg-surface-soft hover:text-ink",
                )}
              >
                <Target size={13} />
              </button>
            )}
            <button
              type="button"
              title="Убрать с доски"
              onClick={onRemove}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                dark
                  ? "text-white/50 hover:bg-red-500/30 hover:text-white"
                  : "text-muted-2 hover:bg-red-soft hover:text-red-ink",
              )}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Три раскладки, как в образце: герой — цифра внизу, средняя —
          цифра слева и гейдж справа, маленькая — всё по центру. */}
      {big ? (
        <div className="relative flex min-h-0 flex-1 items-end gap-[3cqmin]">
          <div className="flex min-w-0 flex-1 flex-col justify-end gap-[1.2cqmin]">
            {number}
            {caption}
            {extra}
            {state && !hidden && (
              <StatusChip state={state} wall={dark} className="a-hide-sm" />
            )}
          </div>
          {gauge}
        </div>
      ) : tiny ? (
        <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-[1cqmin] text-center">
          {number}
          {caption}
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 items-center gap-[2.5cqmin] overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-[1cqmin]">
            {number}
            {caption}
            {extra}
            {state && !hidden && (
              <StatusChip state={state} wall={dark} className="a-hide-sm" />
            )}
          </div>
          {gauge}
        </div>
      )}

      {state && !withRing && (
        <footer
          style={{ marginTop: "1.8cqmin", gap: "1cqmin" }}
          className="relative flex shrink-0 flex-col"
        >
          <div
            style={{ fontSize: "max(9px, min(3.1cqmin, 19px))" }}
            className="a-hide-xxs flex items-baseline justify-between gap-2"
          >
            <span className={dark ? "text-white/40" : "text-muted-2"}>
              план {def.format(planValue!)}
            </span>
            <span
              style={{ fontSize: "max(11px, min(4.4cqmin, 25px))" }}
              className={cn("font-extrabold tabular-nums", dark ? ui!.inkWall : ui!.ink)}
            >
              {hidden ? <Sensitive dark={dark}>{state.pct}%</Sensitive> : `${state.pct}%`}
            </span>
          </div>
          <PlanBarThick state={state} wall={dark} hidden={hidden} />
        </footer>
      )}

      {editing && onSize && (
        <ResizeHandle size={tile.size} onChange={onSize} dark={dark} />
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

function numberSize(size: TileSize, withRing: boolean): string {
  if (size === "l")
    return withRing ? "max(26px, min(19cqh, 13cqw))" : "max(28px, min(32cqh, 16cqw))";
  if (size === "m")
    return withRing ? "max(18px, min(31cqh, 11cqw))" : "max(20px, min(40cqh, 14cqw))";
  return "max(16px, min(32cqh, 26cqw))";
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
