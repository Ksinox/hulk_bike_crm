import { useState } from "react";
import { GripVertical, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardPeriod, BoardTile, TileSize } from "./board";
import type { MetricDef, MetricValue } from "./metrics";
import { planState, STATUS_UI, TONE_UI } from "./status";
import { HalfRing, PlanBarThick, StatusChip } from "./Gauge";
import { SizePicker } from "./SizePicker";

/**
 * Плитка показателя (07.09, вторая правка заказчика).
 *
 * Два требования, из которых вырос весь этот файл:
 *
 * 1. «Аккуратно» — бенто-сетка: крупная плитка-герой с фактурой и мягкой
 *    маской, остальные спокойные, с тонкой рамкой; ничего не кричит,
 *    кроме цифры.
 * 2. «Должно подстраиваться под монитор» — ни одного фиксированного
 *    кегля. Плитка объявлена контейнером (container-type: size), и все
 *    размеры внутри заданы в cqmin/cqh: стала плитка меньше (мелкий
 *    монитор или много показателей) — пропорционально уменьшились цифра,
 *    подписи, отступы и гейдж. Ничего не обрезается и не переносится.
 */

/** Ширина плитки в колонках 6-колоночной бенто-сетки и высота в рядах. */
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
  /** Действующий период плитки — от него считается ожидаемый темп. */
  period: BoardPeriod;
  wall?: boolean;
  /** Узкий экран: высокие плитки не растягиваем на две строки. */
  compact?: boolean;
  /** Сколько колонок в сетке — чтобы плитка не вылезала за её край. */
  cols?: number;
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
  const span = SIZE_SPAN[tile.size];
  const hero = tile.size === "l";
  const revealed = useSensitiveRevealed();
  const hidden = !!def.sensitive && !revealed;

  const planValue =
    !def.comingSoon && tile.plan != null && tile.plan > 0 ? tile.plan : null;
  const state =
    planValue != null
      ? planState(value?.value ?? 0, planValue, !!def.periodic, period)
      : null;
  const tone = value?.tone ?? "neutral";
  const toneUi = TONE_UI[tone];
  const ui = state ? STATUS_UI[state.status] : null;

  // Загрузка парка сама в процентах: дуга рисует показатель, засечка — план.
  const ringIsValue = !!def.percentValue && state != null;
  const ringState =
    ringIsValue && state
      ? {
          ...state,
          pct: Math.round(value?.value ?? 0),
          expectedPct: Math.min(100, planValue!),
        }
      : state;
  // Полукруг помещается только там, где плитка шире одной колонки.
  const withRing = state != null && tile.size !== "s" && !compact;

  const spanStyle = {
    gridColumn: `span ${Math.min(span.col, cols)}`,
    gridRow: `span ${compact ? 1 : span.row}`,
  };

  if (ghost) {
    return (
      <div
        data-tile-index={index}
        data-flip-key={def.id}
        style={spanStyle}
        className="rounded-[clamp(14px,2.5cqmin,28px)] border-2 border-dashed border-blue-500/70 bg-blue-500/[0.07]"
      />
    );
  }

  return (
    <div
      data-tile-index={index}
      data-flip-key={def.id}
      style={{
        ...spanStyle,
        containerType: "size",
        borderRadius: "clamp(14px, 3cqmin, 30px)",
        padding: "clamp(9px, 3.6cqmin, 32px)",
      }}
      className={cn(
        "group/tile relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        heroSurface(hero, wall, ui),
        editing && "select-none",
      )}
    >
      {hero && <HeroTexture wall={wall} />}

      {/* Заголовок: пилюля у героя, микро-строчка у остальных */}
      <header className="relative flex shrink-0 items-start justify-between gap-2">
        <span
          style={{
            fontSize: "max(9px, min(3.2cqmin, 18px))",
            ...(hero
              ? {
                  padding: "max(3px,0.9cqmin) max(7px,1.8cqmin)",
                  borderRadius: 999,
                }
              : {}),
          }}
          className={cn(
            "min-w-0 truncate font-bold uppercase tracking-[0.14em]",
            hero
              ? wall
                ? "bg-white/10 text-white/70"
                : "bg-ink/[0.06] text-ink/55"
              : wall
                ? "text-white/45"
                : "text-muted-2",
          )}
        >
          {def.title}
        </span>
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
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-2 hover:bg-white/60 hover:text-ink active:cursor-grabbing"
            >
              <GripVertical size={15} />
            </span>
            <SizePicker value={tile.size} onChange={(s) => onSize?.(s)} />
            {def.planable && !def.comingSoon && (
              <button
                type="button"
                title="План"
                onClick={() => setPlanOpen((v) => !v)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/60",
                  planValue != null ? "text-blue-600" : "text-muted-2 hover:text-ink",
                )}
              >
                <Target size={13} />
              </button>
            )}
            <button
              type="button"
              title="Убрать с доски"
              onClick={onRemove}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 hover:bg-red-soft hover:text-red-ink"
            >
              <X size={13} />
            </button>
          </div>
        )}
      </header>

      {/* Тело: цифра слева, гейдж справа */}
      <div
        style={withRing ? { gap: "2.5cqmin" } : undefined}
        className={cn(
          "relative flex min-h-0 flex-1",
          withRing ? "items-center" : "flex-col justify-center",
        )}
      >
        <div
          style={{ gap: "max(2px, 1.1cqmin)" }}
          className={cn(
            "flex min-w-0 flex-col justify-center",
            withRing ? "flex-1" : "w-full",
          )}
        >
          {!ringIsValue && (
            <div
              style={{ fontSize: numberSize(tile.size, withRing) }}
              className={cn(
                "truncate font-display font-extrabold leading-[0.9] tracking-[-0.03em] tabular-nums",
                hero
                  ? wall
                    ? "text-white"
                    : "text-ink"
                  : ui
                    ? wall
                      ? ui.inkWall
                      : ui.ink
                    : wall
                      ? toneUi.inkWall
                      : toneUi.ink,
              )}
            >
              {def.sensitive ? (
                <Sensitive dark={wall}>{value?.display ?? "—"}</Sensitive>
              ) : (
                (value?.display ?? "—")
              )}
            </div>
          )}

          {value?.caption && (
            <div
              style={{
                fontSize: ringIsValue
                  ? "max(12px, min(5.2cqmin, 32px))"
                  : "max(10px, min(3.8cqmin, 23px))",
              }}
              className={cn(
                "truncate",
                ringIsValue && "font-bold",
                wall ? "text-white/60" : "text-muted",
              )}
            >
              {value.caption}
            </div>
          )}
          {value?.extra && (
            <div
              style={{ fontSize: "max(9px, min(3.2cqmin, 20px))" }}
              className={cn(
                "truncate font-semibold",
                wall ? "text-white/45" : "text-muted-2",
              )}
            >
              {value.extra}
            </div>
          )}
          {state && !hidden && (
            <StatusChip state={state} wall={wall} />
          )}
        </div>

        {withRing && ringState && (
          <div
            className={cn(
              "flex shrink-0 items-center justify-center",
              hero ? "w-[46%]" : "w-[40%]",
            )}
          >
            <HalfRing
              state={ringState}
              wall={wall}
              hidden={hidden}
              showLabels={hero}
            />
          </div>
        )}
      </div>

      {/* План внизу: подпись + шкала там, где нет полукруга */}
      {state && (
        <footer
          style={{ marginTop: "1.8cqmin", gap: "1.1cqmin" }}
          className="relative flex shrink-0 flex-col"
        >
          <div
            style={{ fontSize: "max(9px, min(3.2cqmin, 20px))" }}
            className="flex items-baseline justify-between gap-2"
          >
            <span className={wall ? "text-white/45" : "text-muted-2"}>
              план {def.format(planValue!)}
            </span>
            {!withRing && (
              <span
                style={{ fontSize: "max(11px, min(4.6cqmin, 26px))" }}
                className={cn("font-extrabold tabular-nums", wall ? ui!.inkWall : ui!.ink)}
              >
                {hidden ? <Sensitive dark={wall}>{state.pct}%</Sensitive> : `${state.pct}%`}
              </span>
            )}
          </div>
          {!withRing && <PlanBarThick state={state} wall={wall} hidden={hidden} />}
        </footer>
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

/** Кегль цифры — в единицах контейнера, поэтому едет вместе с плиткой. */
function numberSize(size: TileSize, withRing: boolean): string {
  if (size === "l")
    return withRing
      ? "max(22px, min(17cqh, 12cqw))"
      : "max(24px, min(30cqh, 15cqw))";
  if (size === "m")
    return withRing
      ? "max(18px, min(30cqh, 10cqw))"
      : "max(20px, min(38cqh, 13cqw))";
  return "max(16px, min(30cqh, 24cqw))";
}

/** Поверхность плитки: герой заметный, остальные спокойные. */
function heroSurface(
  hero: boolean,
  wall: boolean,
  ui: (typeof STATUS_UI)[keyof typeof STATUS_UI] | null,
): string {
  if (wall) {
    return hero
      ? cn("border border-white/10", ui ? ui.fillWall : "bg-white/[0.07]")
      : cn("border border-white/[0.07]", ui ? ui.fillWall : "bg-white/[0.04]");
  }
  return hero
    ? cn("border border-black/[0.04] shadow-card", ui ? ui.fill : "bg-surface")
    : cn("border border-black/[0.04] shadow-card-sm", ui ? ui.fill : "bg-surface");
}

/**
 * Фактура плитки-героя: тонкая диагональная штриховка, погашенная
 * радиальной маской — как в образце заказчика. Чистый CSS, ничего не грузим.
 */
function HeroTexture({ wall }: { wall: boolean }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        backgroundImage: `repeating-linear-gradient(45deg, ${
          wall ? "rgba(255,255,255,0.10)" : "rgba(15,23,42,0.07)"
        } 0px 1px, transparent 1px 10px)`,
        WebkitMaskImage:
          "radial-gradient(ellipse 80% 60% at 100% 0%, #000 55%, transparent 105%)",
        maskImage:
          "radial-gradient(ellipse 80% 60% at 100% 0%, #000 55%, transparent 105%)",
      }}
    />
  );
}
