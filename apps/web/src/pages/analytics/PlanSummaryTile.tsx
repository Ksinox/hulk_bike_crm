import { GripVertical, Minus, Plus, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import { useSensitiveRevealed } from "@/lib/sensitive";
import type { BoardTile, TileSize } from "./board";
import { METRIC_BY_ID, type MetricValue } from "./metrics";
import { SIZE_SPAN } from "./AnalyticsTile";

/**
 * Плитка «План и факт» (06.09) — главный показатель по словам заказчика.
 * Собирает в один список все показатели доски, которым задан план, и
 * показывает, где идём хорошо, а где отстаём. Пустой план — не строка,
 * а подсказка: план ставится кнопкой-мишенью на самой плитке.
 */
export function PlanSummaryTile({
  tile,
  tiles,
  values,
  wall = false,
  compact = false,
  editing = false,
  onSize,
  onRemove,
  dragHandlers,
  dragging,
  dropBefore,
}: {
  tile: BoardTile;
  tiles: BoardTile[];
  values: Record<string, MetricValue>;
  wall?: boolean;
  /** Узкий экран: список планов растёт по содержимому, а не на две строки. */
  compact?: boolean;
  editing?: boolean;
  onSize?: (size: TileSize) => void;
  onRemove?: () => void;
  dragHandlers?: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dragging?: boolean;
  dropBefore?: boolean;
}) {
  const span = SIZE_SPAN[tile.size];
  // Прибыль закрыта ключом директора — в сводке нельзя показывать ни сумму,
  // ни процент: по «59% из 500 000 ₽» цифра считается в уме.
  const revealed = useSensitiveRevealed();
  const rows = tiles
    .filter((t) => t.plan != null && t.plan > 0)
    .map((t) => {
      const def = METRIC_BY_ID.get(t.metric);
      const v = values[t.metric];
      if (!def || !v) return null;
      const plan = t.plan ?? 0;
      const pct = plan > 0 ? Math.round((v.value / plan) * 100) : 0;
      return {
        id: t.metric,
        title: def.title,
        fact: def.format(v.value),
        plan: def.format(plan),
        pct,
        hidden: !!def.sensitive && !revealed,
      };
    })
    .filter(Boolean) as {
    id: string;
    title: string;
    fact: string;
    plan: string;
    pct: number;
    hidden: boolean;
  }[];

  return (
    <div
      draggable={editing}
      onDragStart={dragHandlers?.onDragStart}
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
      onDragEnd={dragHandlers?.onDragEnd}
      style={{
        gridColumn: `span ${span.col}`,
        gridRow: `span ${compact ? 1 : span.row}`,
      }}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-[20px]",
        wall
          ? "border border-white/10 bg-white/[0.06] p-6 backdrop-blur"
          : "bg-surface p-4 shadow-card-sm",
        editing && "cursor-grab",
        dragging && "opacity-40",
        dropBefore && (wall ? "ring-2 ring-white/60" : "ring-2 ring-blue-500"),
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex items-center gap-1.5 font-bold uppercase tracking-wider",
            wall ? "text-[15px] text-white/60" : "text-[11px] text-muted-2",
          )}
        >
          <Target size={wall ? 15 : 12} /> План и факт
        </div>
        {editing && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <GripVertical size={14} className="text-muted-2" />
            <button
              type="button"
              title="Меньше"
              onClick={() => onSize?.(tile.size === "l" ? "m" : "s")}
              disabled={tile.size === "s"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 hover:bg-surface-soft hover:text-ink disabled:opacity-30"
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              title="Больше"
              onClick={() => onSize?.(tile.size === "s" ? "m" : "l")}
              disabled={tile.size === "l"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 hover:bg-surface-soft hover:text-ink disabled:opacity-30"
            >
              <Plus size={13} />
            </button>
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
            wall ? "text-[17px] text-white/60" : "text-[12.5px] text-muted",
          )}
        >
          Планы пока не заданы. Нажмите «Настроить», выберите плитку и поставьте
          план кнопкой-мишенью — здесь появится строка «факт из плана».
        </div>
      ) : (
        <div className="mt-3 flex min-h-0 flex-1 flex-col justify-center gap-2.5 overflow-hidden">
          {rows.map((r) => {
            const done = r.pct >= 100;
            return (
              <div key={r.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      "min-w-0 truncate font-semibold",
                      wall ? "text-[17px] text-white/80" : "text-[12.5px] text-ink-2",
                    )}
                  >
                    {r.title}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      wall ? "text-[16px] text-white/70" : "text-[12px] text-muted",
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
                      "w-[52px] shrink-0 text-right font-bold tabular-nums",
                      wall
                        ? done
                          ? "text-[18px] text-emerald-300"
                          : "text-[18px] text-white"
                        : done
                          ? "text-[13px] text-green-ink"
                          : "text-[13px] text-ink",
                    )}
                  >
                    {r.hidden ? (
                      <Sensitive dark={wall}>{r.pct}%</Sensitive>
                    ) : (
                      `${r.pct}%`
                    )}
                  </span>
                </div>
                <div
                  className={cn(
                    "overflow-hidden rounded-full",
                    wall ? "h-2 bg-white/15" : "h-1.5 bg-surface-soft",
                  )}
                >
                  {/* Полоса тоже выдаёт цифру — у закрытых показателей её нет. */}
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-700",
                      done
                        ? wall
                          ? "bg-emerald-400"
                          : "bg-green"
                        : wall
                          ? "bg-white/70"
                          : "bg-blue-600",
                    )}
                    style={{ width: r.hidden ? 0 : `${Math.min(100, r.pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
