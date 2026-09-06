import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Перетаскивание плиток «как в Notion» (06.09, вечерняя правка).
 *
 * Раньше это был штатный HTML5-drag: плитка просто становилась
 * полупрозрачной, и заказчик справедливо сказал, что не видно ни того,
 * что держишь, ни того, куда сядет. Теперь всё на указателе:
 *
 *  • плитка «остаётся в руке» — её точная копия летит за курсором;
 *  • на доске она превращается в пустое гнездо и переезжает вместе с
 *    порядком, поэтому соседи расступаются прямо во время движения;
 *  • перестановка происходит сразу, а не в момент отпускания.
 *
 * Работает и пальцем: pointer-события покрывают мышь и тач.
 */

export type DragState = {
  /** Индекс плитки, которую держим (живой, меняется при перестановке). */
  index: number;
  /** Разметка плитки на момент захвата — её и показываем «в руке». */
  html: string;
  width: number;
  height: number;
  /** Смещение курсора внутри плитки, чтобы она не прыгала под руку. */
  offsetX: number;
  offsetY: number;
  x: number;
  y: number;
};

export function useTileDrag(move: (from: number, to: number) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const ref = useRef<DragState | null>(null);
  ref.current = drag;

  const start = useCallback((index: number, e: React.PointerEvent) => {
    const tile = (e.currentTarget as HTMLElement).closest<HTMLElement>(
      "[data-tile-index]",
    );
    if (!tile) return;
    e.preventDefault();
    const r = tile.getBoundingClientRect();
    const clone = tile.cloneNode(true) as HTMLElement;
    // Сетка внутри «руки» не нужна, а кнопки редактирования только мешают.
    clone.style.gridColumn = "";
    clone.style.gridRow = "";
    clone.style.width = `${r.width}px`;
    clone.style.height = `${r.height}px`;
    setDrag({
      index,
      html: clone.outerHTML,
      width: r.width,
      height: r.height,
      offsetX: e.clientX - r.left,
      offsetY: e.clientY - r.top,
      x: e.clientX,
      y: e.clientY,
    });
  }, []);

  useEffect(() => {
    if (!drag) return;

    const onMove = (e: PointerEvent) => {
      const cur = ref.current;
      if (!cur) return;
      setDrag({ ...cur, x: e.clientX, y: e.clientY });

      // Под курсором ищем соседнюю плитку — и меняемся с ней местами.
      const under = document
        .elementsFromPoint(e.clientX, e.clientY)
        .find((el) => (el as HTMLElement).dataset?.tileIndex != null) as
        | HTMLElement
        | undefined;
      if (!under) return;
      const to = Number(under.dataset.tileIndex);
      if (Number.isNaN(to) || to === cur.index) return;
      move(cur.index, to);
      ref.current = { ...cur, index: to, x: e.clientX, y: e.clientY };
      setDrag(ref.current);
    };

    const onUp = () => setDrag(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // Пока тащим — не выделяем текст и не скроллим страницу пальцем.
    const prevSelect = document.body.style.userSelect;
    const prevTouch = document.body.style.touchAction;
    document.body.style.userSelect = "none";
    document.body.style.touchAction = "none";
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = prevSelect;
      document.body.style.touchAction = prevTouch;
    };
    // move стабилен между рендерами вызывающего компонента
  }, [drag !== null, move]); // eslint-disable-line react-hooks/exhaustive-deps

  return { drag, start };
}
