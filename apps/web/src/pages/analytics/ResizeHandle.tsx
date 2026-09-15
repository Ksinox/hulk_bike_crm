import { useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Уголок «растянуть» (07.09, четвёртая правка — «это должен быть канвас»).
 *
 * Тянешь правый нижний угол — за мышью идёт контур будущей плитки, а
 * сама плитка перескакивает по клеткам сетки: ширина и высота меняются
 * независимо, в любых пределах сетки. Соседние плитки расступаются с
 * анимацией (FLIP в доске). Контур рисуется fixed-слоем, поэтому его не
 * режет overflow плитки.
 */
export function ResizeHandle({
  w,
  h,
  cols,
  maxRows = 6,
  onChange,
  dark,
}: {
  w: number;
  h: number;
  cols: number;
  maxRows?: number;
  onChange: (w: number, h: number) => void;
  dark?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const applied = useRef({ w, h });
  const [outline, setOutline] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
    w: number;
    h: number;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const tile = ref.current?.closest<HTMLElement>("[data-tile-index]");
    const grid = tile?.parentElement;
    if (!tile || !grid) return;
    e.preventDefault();
    e.stopPropagation();

    const t = tile.getBoundingClientRect();
    const g = grid.getBoundingClientRect();
    const gs = getComputedStyle(grid);
    const colGap = parseFloat(gs.columnGap) || 0;
    const rowGap = parseFloat(gs.rowGap) || 0;
    // Размер одной клетки: по ширине — из сетки, по высоте — из самой плитки.
    const cellW = (g.width - colGap * (cols - 1)) / cols;
    const cellH = (t.height - rowGap * (h - 1)) / h;
    applied.current = { w, h };

    const move = (ev: PointerEvent) => {
      const width = Math.max(cellW * 0.6, ev.clientX - t.left);
      const height = Math.max(cellH * 0.6, ev.clientY - t.top);
      const nw = Math.max(1, Math.min(cols, Math.round((width + colGap) / (cellW + colGap))));
      const nh = Math.max(1, Math.min(maxRows, Math.round((height + rowGap) / (cellH + rowGap))));
      setOutline({ left: t.left, top: t.top, width, height, w: nw, h: nh });
      if (nw !== applied.current.w || nh !== applied.current.h) {
        applied.current = { w: nw, h: nh };
        onChange(nw, nh);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setOutline(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <>
      <span
        ref={ref}
        role="button"
        title="Потяните, чтобы изменить ширину и высоту"
        onPointerDown={onPointerDown}
        className={cn(
          "absolute bottom-0 right-0 z-10 flex h-9 w-9 cursor-nwse-resize items-end justify-end p-2",
          "opacity-0 transition-opacity group-hover/tile:opacity-100",
        )}
      >
        <svg viewBox="0 0 10 10" className="h-full w-full">
          <path
            d="M9 1 L9 9 L1 9"
            fill="none"
            strokeWidth={1.8}
            strokeLinecap="round"
            stroke={dark ? "rgba(255,255,255,0.6)" : "rgba(15,23,42,0.4)"}
          />
        </svg>
      </span>

      {outline && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[9998] rounded-[18px] border-2 border-dashed border-blue-500/80 bg-blue-500/[0.06]"
          style={{
            left: outline.left,
            top: outline.top,
            width: outline.width,
            height: outline.height,
          }}
        >
          <span className="absolute bottom-2 right-2 rounded-full bg-ink px-2.5 py-1 text-[12px] font-bold tabular-nums text-white shadow-card">
            {outline.w} × {outline.h}
          </span>
        </div>
      )}
    </>
  );
}
