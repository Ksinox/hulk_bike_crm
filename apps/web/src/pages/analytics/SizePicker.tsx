import { useEffect, useRef, useState } from "react";
import { Scaling } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TileSize } from "./board";

/**
 * Выбор размера плитки (06.09, вечерняя правка).
 *
 * Было «−» и «+»: заказчик справедливо сказал, что непонятно, что получится.
 * Стало — три схемки: видно форму до нажатия, а после нажатия плитка
 * меняется на глазах, соседние расступаются с анимацией.
 */

const OPTIONS: { size: TileSize; label: string; cells: [number, number] }[] = [
  { size: "s", label: "Маленькая", cells: [1, 1] },
  { size: "m", label: "Широкая", cells: [2, 1] },
  { size: "l", label: "Крупная", cells: [2, 2] },
];

export function SizePicker({
  value,
  onChange,
}: {
  value: TileSize;
  onChange: (size: TileSize) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        title="Размер плитки"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-md hover:bg-white/60",
          open ? "bg-white/70 text-ink" : "text-muted-2 hover:text-ink",
        )}
      >
        <Scaling size={13} />
      </button>

      {open && (
        <div className="absolute right-0 top-7 z-30 flex gap-1.5 rounded-2xl border border-border bg-surface p-2 shadow-card-lg">
          {OPTIONS.map((o) => {
            const active = o.size === value;
            return (
              <button
                key={o.size}
                type="button"
                title={o.label}
                onClick={() => {
                  onChange(o.size);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-[62px] flex-col items-center gap-1.5 rounded-xl px-1.5 py-2 transition-colors",
                  active ? "bg-ink text-white" : "text-muted hover:bg-surface-soft hover:text-ink",
                )}
              >
                <ShapePreview cells={o.cells} active={active} />
                <span className="text-[10px] font-bold leading-none">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Схемка 2×2 клетки, где закрашена та форма, которую выберут. */
function ShapePreview({
  cells,
  active,
}: {
  cells: [number, number];
  active: boolean;
}) {
  const [cols, rows] = cells;
  return (
    <span className="grid h-7 w-7 grid-cols-2 grid-rows-2 gap-[3px]">
      {[0, 1, 2, 3].map((i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const filled = col < cols && row < rows;
        return (
          <span
            key={i}
            className={cn(
              "rounded-[3px]",
              filled
                ? active
                  ? "bg-white"
                  : "bg-blue-600"
                : active
                  ? "bg-white/25"
                  : "bg-ink/12",
            )}
          />
        );
      })}
    </span>
  );
}
