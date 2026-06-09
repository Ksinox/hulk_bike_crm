import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type SheetChildren = ReactNode | ((api: { close: () => void }) => ReactNode);

/**
 * Мобильный нижний лист с плавной анимацией:
 *  - выезжает снизу (sheet-up), фон плавно затемняется (fade);
 *  - закрывается тем же ходом вниз, потом размонтируется (onClose);
 *  - «утянуть» пальцем вниз (swipe-to-dismiss): лист следует за пальцем за
 *    «ручку» сверху; отпустил за порогом — закрылся, не дотянул — пружинит назад.
 *
 * `children` может быть функцией `({ close }) => …` — тогда внутренние кнопки
 * («×», выбор пункта) вызывают анимированное закрытие, а не резкий unmount.
 */
export function MobileBottomSheet({
  onClose,
  children,
  panelClassName,
  z = 70,
}: {
  onClose: () => void;
  children: SheetChildren;
  panelClassName?: string;
  /** z-index оверлея (по умолчанию 70 — выше карточек). */
  z?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  // dragY дублируем в ref — решение «закрыть/вернуть» в endDrag не должно
  // зависеть от тайминга ре-рендера (замыкание могло бы видеть старое значение).
  const dragYRef = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

  const close = () => setClosing(true);

  const onPointerDown = (e: React.PointerEvent) => {
    startY.current = e.clientY;
    dragYRef.current = 0;
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* синтетический указатель — capture не критичен */
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startY.current == null) return;
    const dy = Math.max(0, e.clientY - startY.current);
    dragYRef.current = dy;
    setDragY(dy);
  };
  const endDrag = () => {
    if (startY.current == null) return;
    startY.current = null;
    setDragging(false);
    const h = panelRef.current?.offsetHeight ?? 400;
    const dy = dragYRef.current;
    dragYRef.current = 0;
    // закрываем, если утянули больше порога (≈28% высоты, не более 140px)
    if (dy > Math.min(140, h * 0.28)) close();
    else setDragY(0);
  };

  // Стиль панели: во время перетаскивания — без перехода (следуем за пальцем);
  // при закрытии — уезжает вниз с переходом; при отпускании < порога — пружинит
  // обратно; в покое — управляет CSS-анимация sheet-up (см. className).
  const panelStyle: CSSProperties = closing
    ? {
        transform: "translateY(110%)",
        transition: "transform 260ms cubic-bezier(0.4,0,1,1)",
      }
    : dragging
      ? { transform: `translateY(${dragY}px)`, transition: "none" }
      : dragY > 0
        ? {
            transform: "translateY(0)",
            transition: "transform 260ms cubic-bezier(0.22,1,0.36,1)",
          }
        : {};

  const content =
    typeof children === "function" ? children({ close }) : children;

  return (
    <div
      className={cn(
        "fixed inset-0 flex items-end bg-ink/50 backdrop-blur-sm",
        closing ? "animate-fade-out" : "animate-fade-in",
      )}
      style={{ zIndex: z }}
      onClick={close}
    >
      <div
        ref={panelRef}
        className={cn(
          "w-full rounded-t-3xl bg-surface shadow-card-lg",
          // въезд снизу — только в покое; во время drag/закрытия рулит inline-transform
          !closing && !dragging && dragY === 0 && "animate-sheet-up",
          "pb-[max(env(safe-area-inset-bottom),1.5rem)]",
          panelClassName,
        )}
        style={panelStyle}
        onClick={(e) => e.stopPropagation()}
        onTransitionEnd={(e) => {
          if (closing && e.propertyName === "transform") onClose();
        }}
      >
        {/* «ручка» — тянем её вниз, чтобы закрыть лист */}
        <div
          className="flex touch-none justify-center pb-1.5 pt-2.5"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="h-1.5 w-10 rounded-full bg-muted-2/40" />
        </div>
        {content}
      </div>
    </div>
  );
}
