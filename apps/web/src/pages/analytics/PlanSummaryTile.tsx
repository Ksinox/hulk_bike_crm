import { GripVertical, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardPeriod, BoardTile } from "./board";
import { METRIC_BY_ID, METRIC_GROUP_UI, type MetricValue } from "./metrics";
import { planState, STATUS_UI, type PlanState } from "./status";
import { ResizeHandle } from "./ResizeHandle";
import { DoneBadge } from "./Gauge";

/**
 * Плитка «План и факт» (07.09, четвёртая правка — «тонюсенькие линии»).
 *
 * Список всех планов доски. Каждая строка — название, «факт из плана»,
 * ТОЛСТАЯ шкала до нормы (больше половины высоты строки) и крупный процент
 * цветом статуса. Строки делят высоту плитки поровну: чем их больше, тем
 * мельче, но всё помещается без прокрутки.
 */
export function PlanSummaryTile({
  tile,
  tiles,
  values,
  periodOf,
  wall = false,
  compact = false,
  cols = 4,
  editing = false,
  onResize,
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
  cols?: number;
  editing?: boolean;
  onResize?: (w: number, h: number) => void;
  onRemove?: () => void;
  onDragStart?: (e: React.PointerEvent) => void;
  ghost?: boolean;
  index?: number;
}) {
  const revealed = useSensitiveRevealed();
  const w = Math.min(tile.w, cols);
  const h = compact ? 1 : tile.h;

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
    gridColumn: `span ${w}`,
    gridRow: `span ${h}`,
  };

  if (ghost) {
    return (
      <div
        data-tile-index={index}
        data-flip-key="plan.summary"
        style={{ ...spanStyle, borderRadius: 22 }}
        className={cn(
          "border-2 border-dashed",
          wall ? "border-white/25 bg-white/[0.03]" : "border-ink/20 bg-ink/[0.03]",
        )}
      />
    );
  }

  // Строка = своя доля высоты (за вычетом заголовка). От неё считается всё:
  // кегль названия, процент, толщина шкалы.
  const n = Math.max(1, rows.length);
  const line = compact
    ? "14px"
    : `max(10px, min(${(66 / n).toFixed(2)}cqh, 4.5cqw, ${wall ? 26 : 20}px))`;
  const group = METRIC_GROUP_UI.plan;

  return (
    <div
      data-tile-index={index}
      data-flip-key="plan.summary"
      style={{
        ...spanStyle,
        containerType: compact ? "inline-size" : "size",
        borderRadius: 22,
        minHeight: compact ? 150 : undefined,
      }}
      className={cn(
        "group/tile relative min-h-0 min-w-0 overflow-hidden",
        wall
          ? "bg-white/[0.035] ring-1 ring-inset ring-white/[0.07]"
          : "bg-surface ring-1 ring-inset ring-black/[0.05]",
        editing && "select-none",
      )}
    >
      <div
        style={{ padding: compact ? 16 : "clamp(10px, 4cqmin, 36px)" }}
        className={cn("flex min-h-0 min-w-0 flex-col", !compact && "absolute inset-0")}
      >
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div
          style={{ fontSize: compact ? "17px" : "max(12px, min(11cqh, 7cqw, 34px))" }}
          className={cn(
            "flex min-w-0 items-center gap-[0.5em] font-bold leading-tight",
            wall ? "text-white/85" : "text-ink",
          )}
        >
          <span
            className={cn(
              "flex h-[1.5em] w-[1.5em] shrink-0 items-center justify-center rounded-[0.4em]",
              wall ? group.chipDark : group.chip,
            )}
          >
            <Target className="h-[0.95em] w-[0.95em]" />
          </span>
          <span className="truncate">План и факт</span>
        </div>
        {editing && (
          <div
            className={cn(
              "relative z-10 flex shrink-0 items-center gap-0.5 transition-opacity",
              compact ? "opacity-100" : "opacity-0 group-hover/tile:opacity-100",
            )}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <span
              title="Перетащить"
              onPointerDown={onDragStart}
              className={cn(
                "flex h-7 w-7 cursor-grab items-center justify-center rounded-md active:cursor-grabbing",
                wall
                  ? "text-white/50 hover:bg-white/15 hover:text-white"
                  : "text-muted-2 hover:bg-surface-soft hover:text-ink",
              )}
            >
              <GripVertical size={16} />
            </span>
            <button
              type="button"
              title="Убрать с доски"
              onClick={onRemove}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md",
                wall
                  ? "text-white/50 hover:bg-red-500/30 hover:text-white"
                  : "text-muted-2 hover:bg-red-soft hover:text-red-ink",
              )}
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div
          style={{ marginTop: "2cqmin", fontSize: "max(11px, min(4cqmin, 20px))" }}
          className={cn("leading-snug", wall ? "text-white/50" : "text-muted")}
        >
          Планы пока не заданы. Нажмите «Настроить», выберите плитку и поставьте
          план кнопкой-мишенью — здесь появится строка «факт из плана».
        </div>
      ) : (
        <div
          style={{ marginTop: compact ? 10 : "1.5cqh" }}
          className="flex min-h-0 flex-1 flex-col justify-evenly"
        >
          {rows.map((r) => {
            const ui = STATUS_UI[r.state.status];
            return (
              <div key={r.id} style={{ fontSize: line }} className="flex min-h-0 items-center gap-[0.7em]">
                <span className={cn("min-w-0 flex-1 truncate font-bold", wall ? "text-white/85" : "text-ink")}>
                  {r.title}
                </span>
                <span
                  className={cn("a-hide-narrow shrink-0 truncate tabular-nums", wall ? "text-white/50" : "text-muted")}
                  style={{ fontSize: "0.8em", maxWidth: "30%" }}
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
                    "relative shrink-0 overflow-hidden rounded-full",
                    wall ? "bg-white/[0.12]" : "bg-ink/[0.08]",
                  )}
                  style={{ height: "0.6em", width: "24%" }}
                >
                  <span
                    className={cn(
                      "block h-full rounded-full transition-[width] duration-700",
                      wall ? ui.barWall : ui.bar,
                    )}
                    style={{ width: r.hidden ? 0 : `${Math.min(100, r.state.pct)}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "shrink-0 text-right font-display font-extrabold leading-none tabular-nums",
                    wall ? ui.inkWall : ui.ink,
                  )}
                  style={{ fontSize: "1.2em", width: r.state.done ? "4.6em" : "3.4em" }}
                >
                  {r.hidden ? (
                    <Sensitive dark={wall}>{r.state.pct}%</Sensitive>
                  ) : (
                    <span className="inline-flex items-center justify-end gap-[0.3em]">
                      {r.state.done && <DoneBadge wall={wall} withText={false} className="p-0" />}
                      {`${r.state.pct}%`}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}

      </div>

      {editing && onResize && !compact && (
        <ResizeHandle w={tile.w} h={tile.h} cols={cols} onChange={onResize} dark={wall} />
      )}
    </div>
  );
}
