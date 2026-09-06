import { GripVertical, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardPeriod, BoardTile, TileSize } from "./board";
import { METRIC_BY_ID, type MetricValue } from "./metrics";
import { SIZE_SPAN } from "./AnalyticsTile";
import { planState, STATUS_UI, type PlanState } from "./status";
import { PlanBarThick } from "./Gauge";
import { SizePicker } from "./SizePicker";

/**
 * Плитка «План и факт» (06.09; переработана вечером по фидбэку).
 *
 * Главный ответ на вопрос «как идут дела»: все планы доски одним списком.
 * Полосы намеренно толстые, с засечкой «где мы должны быть сегодня», и
 * каждая красится по статусу — список читается сверху вниз как светофор,
 * без чтения цифр.
 */
export function PlanSummaryTile({
  tile,
  tiles,
  values,
  periodOf,
  wall = false,
  compact = false,
  editing = false,
  onSize,
  onRemove,
  onDragStart,
  ghost,
  index,
}: {
  tile: BoardTile;
  tiles: BoardTile[];
  values: Record<string, MetricValue>;
  /** Действующий период плитки — от него считается ожидаемый темп. */
  periodOf: (metricId: string) => BoardPeriod;
  wall?: boolean;
  /** Узкий экран: список растёт по содержимому, а не на две строки. */
  compact?: boolean;
  editing?: boolean;
  onSize?: (size: TileSize) => void;
  onRemove?: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  ghost?: boolean;
  index?: number;
}) {
  const span = SIZE_SPAN[tile.size];
  const revealed = useSensitiveRevealed();

  const rows = tiles
    .filter((t) => t.plan != null && t.plan > 0)
    .map((t) => {
      const def = METRIC_BY_ID.get(t.metric);
      const v = values[t.metric];
      if (!def || !v) return null;
      const plan = t.plan ?? 0;
      return {
        id: t.metric,
        title: def.title,
        fact: def.format(v.value),
        plan: def.format(plan),
        state: planState(v.value, plan, !!def.periodic, periodOf(t.metric)),
        hidden: !!def.sensitive && !revealed,
      };
    })
    .filter(Boolean) as {
    id: string;
    title: string;
    fact: string;
    plan: string;
    state: PlanState;
    hidden: boolean;
  }[];

  const spanStyle = {
    gridColumn: `span ${span.col}`,
    gridRow: `span ${compact ? 1 : span.row}`,
  };

  if (ghost) {
    return (
      <div
        data-tile-index={index}
        data-flip-key="plan.summary"
        style={spanStyle}
        className="rounded-[20px] border-2 border-dashed border-blue-500/70 bg-blue-500/[0.07]"
      />
    );
  }

  return (
    <div
      data-tile-index={index}
      data-flip-key="plan.summary"
      style={spanStyle}
      className={cn(
        "group/tile relative flex min-w-0 flex-col overflow-hidden rounded-[20px]",
        wall
          ? "border border-white/10 bg-white/[0.06] p-6 backdrop-blur"
          : "bg-surface p-4 shadow-card-sm",
        editing && "select-none",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 font-bold uppercase tracking-wider",
            wall ? "text-[16px] text-white/65" : "text-[11px] text-muted-2",
          )}
        >
          <Target size={wall ? 16 : 12} /> План и факт
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
              className="flex h-6 w-6 cursor-grab items-center justify-center rounded-md text-muted-2 hover:bg-surface-soft hover:text-ink active:cursor-grabbing"
            >
              <GripVertical size={15} />
            </span>
            <SizePicker value={tile.size} onChange={(s) => onSize?.(s)} />
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

      {rows.length === 0 ? (
        <div
          className={cn(
            "mt-3 leading-snug",
            wall ? "text-[18px] text-white/60" : "text-[12.5px] text-muted",
          )}
        >
          Планы пока не заданы. Нажмите «Настроить», выберите плитку и поставьте
          план кнопкой-мишенью — здесь появится строка «факт из плана».
        </div>
      ) : (
        <div
          className={cn(
            "mt-3 flex min-h-0 flex-1 flex-col justify-center overflow-hidden",
            wall ? "gap-3.5" : "gap-2.5",
          )}
        >
          {rows.map((r) => {
            const ui = STATUS_UI[r.state.status];
            return (
              <div key={r.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "min-w-0 truncate font-semibold",
                      wall ? "text-[19px] text-white/85" : "text-[12.5px] text-ink-2",
                    )}
                  >
                    {r.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      wall ? "text-[17px] text-white/70" : "text-[12px] text-muted",
                    )}
                  >
                    {r.hidden ? (
                      <>
                        <Sensitive dark={wall}>{r.fact}</Sensitive> из {r.plan}
                      </>
                    ) : (
                      <>
                        {r.fact} из {r.plan}
                      </>
                    )}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-right font-extrabold tabular-nums",
                      wall ? "w-[86px] text-[22px]" : "w-[52px] text-[14px]",
                      wall ? ui.inkWall : ui.ink,
                    )}
                  >
                    {r.hidden ? (
                      <Sensitive dark={wall}>{r.state.pct}%</Sensitive>
                    ) : (
                      `${r.state.pct}%`
                    )}
                  </span>
                </div>
                <PlanBarThick
                  state={r.state}
                  wall={wall}
                  hidden={r.hidden}
                  height={wall ? 16 : 9}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
