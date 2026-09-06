import { useState } from "react";
import { GripVertical, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardPeriod, BoardTile, TileSize } from "./board";
import type { MetricDef, MetricValue } from "./metrics";
import { planState, STATUS_UI, TONE_UI } from "./status";
import { PlanRing, PlanBarThick, StatusChip } from "./Gauge";
import { SizePicker } from "./SizePicker";

/**
 * Плитка показателя (06.09; переработана вечером по фидбэку заказчика).
 *
 * Правило одно: плитка должна читаться раньше, чем её начали читать.
 * Поэтому статус несёт не полоска в два пикселя, а сама плитка — цветная
 * заливка, толстая полоса слева и кольцо с процентом. Зелёная стена
 * плиток и один красный блок среди них видны от двери, без чтения цифр.
 */

export const SIZE_SPAN: Record<TileSize, { col: number; row: number }> = {
  s: { col: 1, row: 1 },
  m: { col: 2, row: 1 },
  l: { col: 2, row: 2 },
};

export function AnalyticsTile({
  def,
  value,
  tile,
  period,
  wall = false,
  compact = false,
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
  editing?: boolean;
  onSize?: (size: TileSize) => void;
  onRemove?: () => void;
  onPlan?: (plan: number | null) => void;
  /** Взяли плитку в руку (своё перетаскивание, не HTML5-drag). */
  onDragStart?: (e: React.PointerEvent) => void;
  /** Плитка сейчас «в руке» — на её месте держим пустое гнездо. */
  ghost?: boolean;
  /** Позиция на доске: по ней ищем, над какой плиткой курсор. */
  index?: number;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState(
    tile.plan != null ? String(tile.plan) : "",
  );
  const span = SIZE_SPAN[tile.size];
  const big = tile.size === "l";
  const revealed = useSensitiveRevealed();
  const hidden = !!def.sensitive && !revealed;

  const planValue = tile.plan != null && tile.plan > 0 ? tile.plan : null;
  const state =
    planValue != null
      ? planState(value?.value ?? 0, planValue, !!def.periodic, period)
      : null;
  const tone = value?.tone ?? "neutral";
  const toneUi = TONE_UI[tone];
  const statusUi = state ? STATUS_UI[state.status] : null;

  // Кольцо помещается только на широких плитках; на маленькой — толстая шкала.
  const ringSize = wall ? (big ? 208 : 132) : big ? 128 : 84;
  const ringStroke = wall ? (big ? 26 : 18) : big ? 16 : 11;
  const withRing = state != null && tile.size !== "s" && !compact;
  // Загрузка парка: кольцо рисует сам показатель, засечка — план.
  const ringIsValue = withRing && !!def.percentValue;
  const ringState =
    ringIsValue && state
      ? { ...state, pct: Math.round(value?.value ?? 0), expectedPct: Math.min(100, planValue!) }
      : state;

  // Без кольца цифре достаётся вся плитка — значит, она должна быть крупнее.
  const numberClass = wall
    ? big
      ? withRing
        ? "text-[86px] leading-[0.92]"
        : "text-[104px] leading-[0.92]"
      : tile.size === "m"
        ? "text-[62px] leading-[0.92]"
        : "text-[50px] leading-[0.92]"
    : big
      ? withRing
        ? "text-[44px] leading-none"
        : "text-[56px] leading-none"
      : tile.size === "m"
        ? "text-[34px] leading-none"
        : "text-[27px] leading-none";

  const spanStyle = {
    gridColumn: `span ${span.col}`,
    gridRow: `span ${compact ? 1 : span.row}`,
  };

  // Плитка «в руке» — на доске от неё остаётся пустое гнездо, и оно
  // переезжает вместе с порядком: видно, куда плитка сядет.
  if (ghost) {
    return (
      <div
        data-tile-index={index}
        data-flip-key={def.id}
        style={spanStyle}
        className="rounded-[20px] border-2 border-dashed border-blue-500/70 bg-blue-500/[0.07]"
      />
    );
  }

  return (
    <div
      data-tile-index={index}
      data-flip-key={def.id}
      style={spanStyle}
      className={cn(
        "group/tile relative flex min-w-0 flex-col overflow-hidden rounded-[20px]",
        wall
          ? cn(
              "border border-white/10 backdrop-blur",
              statusUi ? statusUi.fillWall : "bg-white/[0.06]",
            )
          : cn("shadow-card-sm", statusUi ? statusUi.fill : "bg-surface"),
        wall ? "p-6 pl-8" : "p-4 pl-5",
        editing && "select-none",
      )}
    >
      {/* Полоса статуса слева — то, что видно первым и издалека. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0",
          wall ? "w-[10px]" : "w-[6px]",
          statusUi
            ? wall
              ? statusUi.railWall
              : statusUi.rail
            : wall
              ? toneUi.railWall
              : toneUi.rail,
        )}
      />

      {/* Заголовок */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "font-bold uppercase tracking-wider",
            wall ? "text-[16px] text-white/65" : "text-[11px] text-muted-2",
          )}
        >
          {def.title}
        </div>
        {editing && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5 transition-opacity",
              // На телефоне наведения нет — панель держим видимой.
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
            {def.planable && (
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
      </div>

      {/* Цифра + кольцо */}
      <div
        className={cn(
          "mt-2 flex min-w-0 flex-1",
          withRing
            ? cn("items-center", big ? "gap-6" : "gap-4")
            : "flex-col items-start justify-center",
        )}
      >
        <div className={cn("flex min-w-0 flex-1 flex-col justify-center", wall ? "gap-1.5" : "gap-1")}>
          {!ringIsValue && (
          <div
            className={cn(
              "font-display font-extrabold tabular-nums",
              numberClass,
              statusUi
                ? wall
                  ? statusUi.inkWall
                  : statusUi.ink
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
              className={cn(
                ringIsValue
                  ? wall
                    ? "text-[26px] font-bold text-white/85"
                    : "text-[17px] font-bold text-ink-2"
                  : wall
                    ? "text-[18px] text-white/70"
                    : "text-[12.5px] text-muted",
              )}
            >
              {value.caption}
            </div>
          )}
          {value?.extra && (
            <div
              className={cn(
                "font-semibold",
                wall ? "text-[16px] text-white/60" : "text-[12px] text-muted-2",
              )}
            >
              {value.extra}
            </div>
          )}
          {state && !hidden && (
            <StatusChip state={state} wall={wall} className={wall ? "mt-1 self-start" : "mt-0.5 self-start"} />
          )}
          {state && withRing && (
            <div
              className={cn(
                wall ? "mt-1 text-[17px] text-white/55" : "text-[11.5px] text-muted-2",
              )}
            >
              план {def.format(planValue!)}
            </div>
          )}
        </div>

        {withRing && ringState && (
          <PlanRing
            state={ringState}
            size={ringSize}
            stroke={ringStroke}
            wall={wall}
            hidden={hidden}
          />
        )}
      </div>

      {/* План: подпись + толстая шкала (на плитках без кольца) */}
      {state && !withRing && (
        <div className={cn("flex flex-col", wall ? "mt-4 gap-2" : "mt-3 gap-1.5")}>
          <div
            className={cn(
              "flex items-baseline justify-between gap-2",
              wall ? "text-[16px]" : "text-[11.5px]",
            )}
          >
            <span className={wall ? "text-white/60" : "text-muted-2"}>
              план {def.format(planValue!)}
            </span>
            {(
              <span
                className={cn(
                  "font-bold tabular-nums",
                  wall ? statusUi!.inkWall : statusUi!.ink,
                  wall ? "text-[20px]" : "text-[13px]",
                )}
              >
                {hidden ? <Sensitive dark={wall}>{state.pct}%</Sensitive> : `${state.pct}%`}
              </span>
            )}
          </div>
          {(
            <PlanBarThick
              state={state}
              wall={wall}
              hidden={hidden}
              height={wall ? 20 : 10}
            />
          )}
        </div>
      )}

      {/* Ввод плана */}
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
