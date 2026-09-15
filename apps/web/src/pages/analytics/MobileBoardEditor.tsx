import { ArrowDown, ArrowUp, Minus, Plus, Target, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Board } from "./board";
import { METRIC_BY_ID, METRIC_GROUP_UI } from "./metrics";

/**
 * Настройка стены на телефоне и планшете (07.09).
 *
 * Тянуть плитки за угол пальцем на маленьком экране невозможно, поэтому
 * здесь то же самое, но списком: порядок — стрелками, ширина и высота в
 * клетках — минусом-плюсом, план — полем с единицей. Сверху живая
 * миниатюра второго монитора: видно, как доска сложится на стене.
 */
export function MobileBoardEditor({
  board,
  onMove,
  onResize,
  onPlan,
  onRemove,
  cols,
}: {
  board: Board;
  onMove: (from: number, to: number) => void;
  onResize: (index: number, w: number, h: number) => void;
  onPlan: (index: number, plan: number | null) => void;
  onRemove: (index: number) => void;
  /** Сколько колонок будет на стене — предел ширины плитки. */
  cols: number;
}) {
  return (
    <div className="flex flex-col gap-2">
      {board.tiles.map((tile, i) => {
        const def = METRIC_BY_ID.get(tile.metric);
        if (!def) return null;
        const ui = METRIC_GROUP_UI[def.group];
        return (
          <div
            key={tile.metric}
            className="rounded-2xl bg-surface p-3 shadow-card-sm"
          >
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold",
                  ui.chip,
                )}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">
                {def.title}
              </span>
              <button
                type="button"
                title="Выше"
                disabled={i === 0}
                onClick={() => onMove(i, i - 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-soft text-muted disabled:opacity-30"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                title="Ниже"
                disabled={i === board.tiles.length - 1}
                onClick={() => onMove(i, i + 1)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-soft text-muted disabled:opacity-30"
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                title="Убрать с доски"
                onClick={() => onRemove(i)}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-soft text-muted-2 active:bg-red-soft active:text-red-ink"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <Stepper
                label="Ширина"
                value={tile.w}
                min={1}
                max={cols}
                onChange={(v) => onResize(i, v, tile.h)}
              />
              <Stepper
                label="Высота"
                value={tile.h}
                min={1}
                max={3}
                onChange={(v) => onResize(i, tile.w, v)}
              />
              {def.planable && !def.comingSoon && (
                <label className="flex min-w-[150px] flex-1 items-center gap-1.5 rounded-xl bg-surface-soft px-2.5 py-1.5">
                  <Target size={14} className="shrink-0 text-muted-2" />
                  <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider text-muted-2">
                    План
                  </span>
                  <input
                    inputMode="numeric"
                    value={tile.plan != null ? String(tile.plan) : ""}
                    placeholder={def.percentValue ? "90" : "—"}
                    onChange={(e) => {
                      let v = e.target.value.replace(/[^\d]/g, "");
                      if (def.percentValue && Number(v) > 100) v = "100";
                      onPlan(i, v ? Number(v) : null);
                    }}
                    className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-right text-[13px] font-bold tabular-nums outline-none focus:border-blue-600"
                  />
                  <span className="shrink-0 text-[12px] font-bold text-muted-2">
                    {def.percentValue ? "%" : def.format(1).includes("₽") ? "₽" : "шт"}
                  </span>
                </label>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-xl bg-surface-soft px-2.5 py-1.5">
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
        {label}
      </span>
      <button
        type="button"
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-ink shadow-card-sm disabled:opacity-30"
      >
        <Minus size={15} />
      </button>
      <span className="w-5 text-center text-[14px] font-extrabold tabular-nums text-ink">
        {value}
      </span>
      <button
        type="button"
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface text-ink shadow-card-sm disabled:opacity-30"
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
