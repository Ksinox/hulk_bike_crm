import { useState } from "react";
import { GripVertical, Minus, Plus, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sensitive } from "@/components/Sensitive";
import type { BoardTile, TileSize } from "./board";
import type { MetricDef, MetricValue } from "./metrics";

/**
 * Плитка показателя (06.09).
 *
 * Одна плитка — один вопрос и один ответ: крупное число, под ним строка
 * контекста, и полоса плана, если план задан. Цвет говорит сам за себя:
 * зелёный — идём хорошо, жёлтый — присмотреться, красный — горит.
 * На экране-стене (второй монитор под потолком) те же плитки, но
 * типографика крупнее, а фон тёмный — читается издалека.
 */

export const SIZE_SPAN: Record<TileSize, { col: number; row: number }> = {
  s: { col: 1, row: 1 },
  m: { col: 2, row: 1 },
  l: { col: 2, row: 2 },
};

const TONE_ACCENT = {
  good: "text-green-ink",
  warn: "text-orange-ink",
  bad: "text-red-ink",
  neutral: "text-ink",
} as const;

const TONE_ACCENT_WALL = {
  good: "text-emerald-300",
  warn: "text-amber-300",
  bad: "text-red-400",
  neutral: "text-white",
} as const;

export function AnalyticsTile({
  def,
  value,
  tile,
  wall = false,
  editing = false,
  onSize,
  onRemove,
  onPlan,
  dragHandlers,
  dragging,
  dropBefore,
}: {
  def: MetricDef;
  value: MetricValue | undefined;
  tile: BoardTile;
  wall?: boolean;
  editing?: boolean;
  onSize?: (size: TileSize) => void;
  onRemove?: () => void;
  onPlan?: (plan: number | null) => void;
  dragHandlers?: {
    onDragStart: (e: React.DragEvent) => void;
    onDragOver: (e: React.DragEvent) => void;
    onDrop: (e: React.DragEvent) => void;
    onDragEnd: () => void;
  };
  dragging?: boolean;
  dropBefore?: boolean;
}) {
  const [planOpen, setPlanOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState(
    tile.plan != null ? String(tile.plan) : "",
  );
  const span = SIZE_SPAN[tile.size];
  const tone = value?.tone ?? "neutral";
  const big = tile.size === "l";

  const planValue = tile.plan ?? null;
  const fact = value?.value ?? 0;
  const pct =
    planValue && planValue > 0
      ? Math.min(999, Math.round((fact / planValue) * 100))
      : null;
  const planDone = pct != null && pct >= 100;

  const numberClass = wall
    ? big
      ? "text-[92px] leading-[0.95]"
      : tile.size === "m"
        ? "text-[68px] leading-[0.95]"
        : "text-[54px] leading-[0.95]"
    : big
      ? "text-[46px] leading-none"
      : tile.size === "m"
        ? "text-[34px] leading-none"
        : "text-[28px] leading-none";

  return (
    <div
      draggable={editing}
      onDragStart={dragHandlers?.onDragStart}
      onDragOver={dragHandlers?.onDragOver}
      onDrop={dragHandlers?.onDrop}
      onDragEnd={dragHandlers?.onDragEnd}
      style={{ gridColumn: `span ${span.col}`, gridRow: `span ${span.row}` }}
      className={cn(
        "group relative flex min-w-0 flex-col overflow-hidden rounded-[20px] transition-shadow",
        wall
          ? "border border-white/10 bg-white/[0.06] p-6 backdrop-blur"
          : "bg-surface p-4 shadow-card-sm",
        editing && "cursor-grab",
        dragging && "opacity-40",
        dropBefore && (wall ? "ring-2 ring-white/60" : "ring-2 ring-blue-500"),
      )}
    >
      {/* Заголовок */}
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "font-bold uppercase tracking-wider",
            wall ? "text-[15px] text-white/60" : "text-[11px] text-muted-2",
          )}
        >
          {def.title}
        </div>
        {editing && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <GripVertical size={14} className="text-muted-2" />
            <button
              type="button"
              title="Меньше"
              onClick={() => onSize?.(smaller(tile.size))}
              disabled={tile.size === "s"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 hover:bg-surface-soft hover:text-ink disabled:opacity-30"
            >
              <Minus size={13} />
            </button>
            <button
              type="button"
              title="Больше"
              onClick={() => onSize?.(bigger(tile.size))}
              disabled={tile.size === "l"}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-2 hover:bg-surface-soft hover:text-ink disabled:opacity-30"
            >
              <Plus size={13} />
            </button>
            {def.planable && (
              <button
                type="button"
                title="План"
                onClick={() => setPlanOpen((v) => !v)}
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-md hover:bg-surface-soft",
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

      {/* Значение — по центру плитки: на крупных блоках число не должно
          прилипать к нижнему краю, его читают первым. */}
      <div className="mt-2 flex min-w-0 flex-1 flex-col justify-center gap-1">
        <div
          className={cn(
            "font-display font-extrabold tabular-nums",
            numberClass,
            wall ? TONE_ACCENT_WALL[tone] : TONE_ACCENT[tone],
          )}
        >
          {/* Прибыль и закуп прячем и на стене: экран видят все, кто рядом.
              Открывается тем же ключом директора, что и в «Продажах». */}
          {def.sensitive ? (
            <Sensitive dark={wall}>{value?.display ?? "—"}</Sensitive>
          ) : (
            (value?.display ?? "—")
          )}
        </div>
        {value?.caption && (
          <div
            className={cn(
              wall ? "text-[17px] text-white/70" : "text-[12.5px] text-muted",
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
      </div>

      {/* План */}
      {planValue != null && planValue > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <div
            className={cn(
              "flex items-baseline justify-between",
              wall ? "text-[15px]" : "text-[11px]",
            )}
          >
            <span className={wall ? "text-white/60" : "text-muted-2"}>
              план {def.format(planValue)}
            </span>
            <span
              className={cn(
                "font-bold tabular-nums",
                planDone
                  ? wall
                    ? "text-emerald-300"
                    : "text-green-ink"
                  : wall
                    ? "text-white/80"
                    : "text-ink-2",
              )}
            >
              {pct}%
            </span>
          </div>
          <div
            className={cn(
              "overflow-hidden rounded-full",
              wall ? "h-2.5 bg-white/15" : "h-1.5 bg-surface-soft",
            )}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                planDone
                  ? wall
                    ? "bg-emerald-400"
                    : "bg-green"
                  : wall
                    ? "bg-white/70"
                    : "bg-blue-600",
              )}
              style={{ width: `${Math.min(100, pct ?? 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Ввод плана */}
      {editing && planOpen && (
        <div className="absolute inset-x-3 bottom-3 flex items-center gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-card">
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

function smaller(s: TileSize): TileSize {
  return s === "l" ? "m" : "s";
}
function bigger(s: TileSize): TileSize {
  return s === "s" ? "m" : "l";
}
