import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { TileSize } from "./board";

/**
 * Уголок «растянуть» (07.09, третья правка).
 *
 * Заказчик: «сейчас я не могу уменьшить или как-то растянуть, увеличить не
 * могу». Кнопки со схемками остались, но главное теперь — потянуть плитку
 * за правый нижний угол, как окно: тянешь вправо-вниз — плитка растёт,
 * влево-вверх — уменьшается. Размер меняется сразу, на глазах.
 */

const ORDER: TileSize[] = ["s", "m", "l"];

export function ResizeHandle({
  size,
  onChange,
  dark,
}: {
  size: TileSize;
  onChange: (s: TileSize) => void;
  dark?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const applied = useRef<TileSize>(size);

  const onPointerDown = (e: React.PointerEvent) => {
    const tile = ref.current?.closest<HTMLElement>("[data-tile-index]");
    if (!tile) return;
    e.preventDefault();
    e.stopPropagation();
    const r = tile.getBoundingClientRect();
    const from = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    const startIndex = ORDER.indexOf(size);
    applied.current = size;

    const move = (ev: PointerEvent) => {
      // Берём тот жест, который выражен сильнее: тянут обычно по диагонали.
      const step = Math.max(
        (ev.clientX - from.x) / from.w,
        (ev.clientY - from.y) / from.h,
      );
      let i = startIndex;
      if (step > 0.4) i = Math.min(ORDER.length - 1, startIndex + 1);
      else if (step < -0.3) i = Math.max(0, startIndex - 1);
      const next = ORDER[i]!;
      if (next !== applied.current) {
        applied.current = next;
        onChange(next);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "nwse-resize";
  };

  return (
    <span
      ref={ref}
      role="button"
      title="Потяните, чтобы растянуть плитку"
      onPointerDown={onPointerDown}
      className={cn(
        "absolute bottom-0 right-0 z-10 flex h-7 w-7 cursor-nwse-resize items-end justify-end p-1.5",
        "opacity-0 transition-opacity group-hover/tile:opacity-100",
      )}
    >
      <svg viewBox="0 0 10 10" className="h-full w-full">
        <path
          d="M9 1 L9 9 L1 9"
          fill="none"
          strokeWidth={1.6}
          strokeLinecap="round"
          stroke={dark ? "rgba(255,255,255,0.55)" : "rgba(15,23,42,0.35)"}
        />
      </svg>
    </span>
  );
}
