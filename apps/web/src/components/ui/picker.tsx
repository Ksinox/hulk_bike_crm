import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { isTouchPrimary } from "@/lib/useIsMobile";

/**
 * Выбор из списка — наш, а не системный.
 *
 * Правило заказчика (20.09, ЖЕЛЕЗНО): нативных select в CRM нет. Системный
 * список рисуется операционной системой, выбивается из оформления, а на
 * телефоне и планшете открывает колесо во весь экран поверх формы. Здесь
 * список — обычное всплывающее окно в нашем стиле: строки крупные (на
 * тач-устройстве 48px), выбранная помечена галочкой, Esc закрывает.
 *
 * Где вариантов два-три и они короткие — лучше Segmented: видно сразу всё,
 * без лишнего нажатия.
 */
export type PickerOption<T extends string | number> = {
  value: T;
  label: string;
  hint?: string;
  icon?: ReactNode;
};

export function Picker<T extends string | number>({
  value,
  onChange,
  options,
  placeholder = "Выберите…",
  id,
  disabled,
  invalid,
  size = "md",
  className,
  align = "start",
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: PickerOption<T>[];
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  /** Подсветить, что поле обязательно и ещё не заполнено. */
  invalid?: boolean;
  size?: "sm" | "md";
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const touch = isTouchPrimary();
  const current = options.find((o) => o.value === value) ?? null;

  // Позиция окна считается от кнопки: под ней, а если снизу не влезает —
  // над ней. Ширина не меньше кнопки, чтобы подписи не обрезались.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const place = () => {
      const r = btn.current!.getBoundingClientRect();
      const h = Math.min(320, options.length * (touch ? 48 : 38) + 16);
      const below = window.innerHeight - r.bottom;
      const top = below > h + 12 ? r.bottom + 6 : Math.max(12, r.top - h - 6);
      const width = Math.max(r.width, 220);
      const left =
        align === "end"
          ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
          : Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setBox({ left, top, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, options.length, touch, align]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btn.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const i = options.findIndex((o) => o.value === value);
      const next = e.key === "ArrowDown" ? i + 1 : i - 1;
      const pick = options[(next + options.length) % options.length];
      if (pick) onChange(pick.value);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open, options, value, onChange]);

  return (
    <>
      <button
        id={id}
        ref={btn}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[10px] border bg-white text-left text-ink outline-none transition-colors",
          size === "sm" ? "h-9 px-2.5 text-[13px]" : "h-11 px-3.5 text-[14px]",
          touch && size === "md" && "h-12 text-[15px]",
          invalid ? "border-red-300 bg-red-soft/20" : "border-border",
          open && "border-blue-600",
          disabled ? "cursor-not-allowed opacity-60" : "hover:border-ink-2",
          className,
        )}
      >
        <span className={cn("min-w-0 truncate", !current && "text-muted-2")}>
          {current?.label ?? placeholder}
        </span>
        <ChevronDown
          size={size === "sm" ? 14 : 16}
          className={cn("shrink-0 text-muted-2 transition-transform", open && "rotate-180")}
        />
      </button>

      {open &&
        box &&
        createPortal(
          <div
            ref={pop}
            role="listbox"
            style={{ left: box.left, top: box.top, width: box.width }}
            className="scrollbar-thin fixed z-[400] max-h-[320px] overflow-y-auto rounded-[14px] border border-border bg-white p-1 shadow-card-lg"
          >
            {options.map((o) => {
              const on = o.value === value;
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-[10px] px-3 text-left transition-colors",
                    touch ? "min-h-[48px] text-[15px]" : "min-h-[38px] text-[13.5px]",
                    on ? "bg-blue-50 font-semibold text-blue-800" : "text-ink hover:bg-surface-soft",
                  )}
                >
                  {o.icon}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.label}</span>
                    {o.hint && (
                      <span className="block truncate text-[11.5px] font-normal text-muted-2">
                        {o.hint}
                      </span>
                    )}
                  </span>
                  {on && <Check size={15} className="shrink-0 text-blue-700" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * Два-четыре коротких варианта — кнопками в ряд: выбор виден целиком, без
 * лишнего нажатия. Тот же принцип, что у плиток статей в «Финансах».
 */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = "md",
  className,
}: {
  value: T | null;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  size?: "sm" | "md";
  className?: string;
}) {
  const touch = isTouchPrimary();
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center rounded-xl px-3.5 font-semibold transition-colors",
              size === "sm" ? "h-9 text-[13px]" : "h-11 text-[14px]",
              touch && size === "md" && "h-12 text-[15px]",
              on
                ? "bg-ink text-white"
                : "border border-border bg-white text-ink-2 hover:border-ink hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Галочка — своя, а не системная. Системная рисуется операционкой (у каждой
 * своя), она 14px и пальцем в неё не попасть. Здесь квадрат 22px, вся строка
 * кликабельна, на тач-устройстве высота строки 48px.
 */
export function CheckBox({
  checked,
  onChange,
  label,
  hint,
  tone = "blue",
  className,
  compact,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
  tone?: "blue" | "red";
  className?: string;
  /** Плотная строка — для фильтров и списков, где не нужен крупный блок. */
  compact?: boolean;
}) {
  const touch = isTouchPrimary();
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[12px] text-left transition-colors",
        compact ? "min-h-[34px] px-1" : "min-h-[44px] px-2",
        touch && !compact && "min-h-[48px]",
        !compact && "hover:bg-surface-soft",
        className,
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[7px] border-2 transition-colors",
          compact ? "h-[18px] w-[18px]" : "h-[22px] w-[22px]",
          checked
            ? tone === "red"
              ? "border-red-ink bg-red-ink text-white"
              : "border-blue-600 bg-blue-600 text-white"
            : "border-border bg-white",
        )}
      >
        {checked && <Check size={compact ? 12 : 15} strokeWidth={3} />}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block",
            compact ? "text-[12.5px]" : "text-[13.5px]",
            checked ? "font-semibold text-ink" : "text-ink-2",
          )}
        >
          {label}
        </span>
        {hint && <span className="block text-[11.5px] text-muted-2">{hint}</span>}
      </span>
    </button>
  );
}
