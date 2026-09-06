import { GripVertical, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardPeriod, BoardTile, TileSize } from "./board";
import { METRIC_BY_ID, type MetricValue } from "./metrics";
import { SIZE_SPAN } from "./AnalyticsTile";
import { planState, STATUS_UI, type PlanState } from "./status";
import { SizePicker } from "./SizePicker";

/**
 * Плитка «План и факт» (07.09, вторая правка).
 *
 * Список всех планов доски. Высота у плитки чужая — её задаёт сетка,
 * поэтому строки делят её поровну: чем больше планов, тем мельче строка,
 * но список всегда помещается целиком, без прокрутки и обрезки.
 */
export function PlanSummaryTile({
  tile,
  tiles,
  values,
  periodOf,
  wall = false,
  compact = false,
  cols = 6,
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
  periodOf: (metricId: string) => BoardPeriod;
  wall?: boolean;
  compact?: boolean;
  /** Сколько колонок в сетке — чтобы плитка не вылезала за её край. */
  cols?: number;
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
      if (!def || !v || def.comingSoon) return null;
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
    gridColumn: `span ${Math.min(span.col, cols)}`,
    gridRow: `span ${compact ? 1 : span.row}`,
  };

  if (ghost) {
    return (
      <div
        data-tile-index={index}
        data-flip-key="plan.summary"
        style={spanStyle}
        className="rounded-[clamp(14px,2.5cqmin,28px)] border-2 border-dashed border-blue-500/70 bg-blue-500/[0.07]"
      />
    );
  }

  // Строка занимает свою долю высоты: 100% / (кол-во строк) с запасом на
  // заголовок. Дальше всё внутри строки считается от этого кегля.
  const n = Math.max(1, rows.length);
  const line = `min(${(72 / n).toFixed(2)}cqh, ${wall ? 22 : 15}px)`;

  return (
    <div
      data-tile-index={index}
      data-flip-key="plan.summary"
      style={{ ...spanStyle, containerType: "size" }}
      className={cn(
        "group/tile relative flex min-h-0 min-w-0 flex-col overflow-hidden",
        "rounded-[clamp(14px,3cqmin,30px)] p-[clamp(10px,3.4cqmin,28px)]",
        wall
          ? "border border-white/[0.07] bg-white/[0.04]"
          : "border border-black/[0.04] bg-surface shadow-card-sm",
        editing && "select-none",
      )}
    >
      <div className="flex shrink-0 items-start justify-between gap-2">
        <div
          className={cn(
            "flex items-center gap-[0.8cqmin] font-bold uppercase tracking-[0.14em]",
            "text-[max(8px,min(3cqmin,17px))]",
            wall ? "text-white/45" : "text-muted-2",
          )}
        >
          <Target className="h-[1em] w-[1em]" /> План и факт
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
            "mt-[2cqmin] leading-snug text-[max(10px,min(3.6cqmin,20px))]",
            wall ? "text-white/50" : "text-muted",
          )}
        >
          Планы пока не заданы. Нажмите «Настроить», выберите плитку и поставьте
          план кнопкой-мишенью — здесь появится строка «факт из плана».
        </div>
      ) : (
        <div className="mt-[1.6cqmin] flex min-h-0 flex-1 flex-col justify-between">
          {rows.map((r) => {
            const ui = STATUS_UI[r.state.status];
            return (
              <div key={r.id} className="flex min-h-0 flex-col justify-center gap-[0.5cqh]">
                <div
                  className="flex items-baseline justify-between gap-[1.5cqmin]"
                  style={{ fontSize: line }}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate font-semibold",
                      wall ? "text-white/85" : "text-ink-2",
                    )}
                  >
                    {r.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      wall ? "text-white/55" : "text-muted",
                    )}
                    style={{ fontSize: `calc(${line} * 0.88)` }}
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
                      wall ? ui.inkWall : ui.ink,
                    )}
                    style={{ fontSize: `calc(${line} * 1.12)`, width: "4.2em" }}
                  >
                    {r.hidden ? (
                      <Sensitive dark={wall}>{r.state.pct}%</Sensitive>
                    ) : (
                      `${r.state.pct}%`
                    )}
                  </span>
                </div>
                <div
                  className={cn(
                    "relative w-full overflow-hidden rounded-full",
                    wall ? ui.trackWall : ui.track,
                  )}
                  style={{ height: `calc(${line} * 0.42)` }}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700",
                      wall ? ui.barWall : ui.bar,
                    )}
                    style={{
                      width: r.hidden ? 0 : `${Math.min(100, r.state.pct)}%`,
                    }}
                  />
                  {!r.hidden &&
                    r.state.expectedPct > 3 &&
                    r.state.expectedPct < 98 && (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-0 h-full w-[2px] rounded-full",
                          wall ? "bg-white/80" : "bg-ink/50",
                        )}
                        style={{ left: `calc(${r.state.expectedPct}% - 1px)` }}
                      />
                    )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
