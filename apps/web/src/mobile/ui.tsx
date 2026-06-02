import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Свайп нижней шторки вниз для закрытия. Возвращает обработчики на «ручку»
 * (полоску сверху) и стиль для панели (translateY при перетаскивании +
 * плавный возврат). Тянуть можно только вниз; отпустил ниже порога — закрыли.
 */
export function useSheetDrag(onClose: () => void) {
  const [dy, setDy] = useState(0);
  const startY = useRef<number | null>(null);
  const handleProps = {
    onTouchStart: (e: React.TouchEvent) => {
      startY.current = e.touches[0]?.clientY ?? null;
    },
    onTouchMove: (e: React.TouchEvent) => {
      if (startY.current == null) return;
      const d = (e.touches[0]?.clientY ?? 0) - startY.current;
      if (d > 0) setDy(d);
    },
    onTouchEnd: () => {
      if (dy > 90) onClose();
      setDy(0);
      startY.current = null;
    },
  };
  const sheetStyle: React.CSSProperties = {
    transform: dy ? `translateY(${dy}px)` : undefined,
    transition:
      startY.current == null ? "transform .22s cubic-bezier(.22,1,.36,1)" : "none",
  };
  return { handleProps, sheetStyle };
}

/** «Ручка» шторки — серая полоска с большой тач-зоной для свайпа вниз. */
export function SheetHandle({
  handleProps,
}: {
  handleProps: ReturnType<typeof useSheetDrag>["handleProps"];
}) {
  return (
    <div
      {...handleProps}
      className="-mx-4 -mt-3 mb-2 flex touch-none cursor-grab justify-center pb-1 pt-3"
    >
      <div className="h-1.5 w-11 rounded-full bg-border-strong" />
    </div>
  );
}

/** Поисковая строка — общая для всех мобильных списков. */
export function MobileSearch({
  value,
  onChange,
  placeholder = "Поиск…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-11 w-full rounded-2xl bg-surface pl-9 pr-9 text-[14px] text-ink shadow-card-sm outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-2"
          aria-label="Очистить"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}

/** Горизонтальные чипы-фильтры со счётчиком. */
export type ChipOption<T extends string> = {
  id: T;
  label: string;
  count?: number;
};

export function MobileChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors",
              active
                ? "bg-ink text-white"
                : "bg-surface text-muted shadow-card-sm",
            )}
          >
            {o.label}
            {o.count != null && o.count > 0 && (
              <span
                className={cn(
                  "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                  active ? "bg-white/25 text-white" : "bg-surface-soft text-muted-2",
                )}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Нижняя шторка (bottom sheet) — общий контейнер для деталей/действий. */
export function MobileSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { handleProps, sheetStyle } = useSheetDrag(onClose);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={sheetStyle}
        className="max-h-[85vh] overflow-y-auto rounded-t-3xl bg-bg px-4 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-card-lg animate-sheet-up"
      >
        <SheetHandle handleProps={handleProps} />
        {title && (
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="font-display text-[17px] font-bold text-ink">
              {title}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted shadow-card-sm"
              aria-label="Закрыть"
            >
              <X size={17} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Пустое состояние списка. */
export function MobileEmpty({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-muted-2 shadow-card">
        {icon}
      </div>
      <div className="mt-3 text-[15px] font-bold text-ink">{title}</div>
      {hint && <div className="mt-1 max-w-[260px] text-[13px] text-muted">{hint}</div>}
    </div>
  );
}

/** Плавающая кнопка действия (FAB) — над нижним таб-баром. */
export function MobileFab({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 items-center gap-2 rounded-full bg-blue-600 px-5 text-[15px] font-bold text-white shadow-card-lg active:scale-95"
    >
      {icon}
      {label && <span>{label}</span>}
    </button>
  );
}

/** Строка «ключ — значение» для шторок-деталей. */
export function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cn("text-right text-[13px] font-semibold text-ink", valueClass)}>
        {value}
      </span>
    </div>
  );
}
