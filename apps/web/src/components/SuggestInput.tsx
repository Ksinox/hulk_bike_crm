import { forwardRef, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Поле с подсказками из уже введённого (16.09, заказчик: «цвет — чтобы
 * предлагал из того, что писали раньше, меньше рутины»).
 *
 * Поставили курсор — под полем список прошлых значений (частые сверху),
 * печатаете — список сужается. Выбор касанием, мышью или ↑ ↓ + Enter.
 * Список рисуется поверх всего (портал), чтобы его не обрезала таблица с
 * прокруткой. Пока список закрыт, Enter и стрелки работают как у обычного
 * поля — таблица сама переводит курсор на строку ниже.
 */

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onValueChange: (v: string) => void;
  suggestions: string[];
  /** Сколько вариантов показывать. */
  limit?: number;
  /** Крупные строки списка — для пальца. */
  touch?: boolean;
  /** Заголовок списка (по умолчанию «Вписывали раньше»). */
  heading?: string;
  /** Подпись справа у варианта — например цена из прайса. */
  meta?: (s: string) => string | null | undefined;
  /** Показывать список, только когда введено столько букв (длинные справочники). */
  minChars?: number;
};

/** Ключ сравнения: без регистра, «ё» = «е». */
export function suggestKey(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, "е");
}

/**
 * Поиск по словам (2.0.2): «ремень gear» находит «Ремень вариатора — …
 * Yamaha Gear 4T» — каждое слово есть в тексте, порядок не важен.
 */
export function matchWords(text: string, query: string): boolean {
  const t = suggestKey(text);
  return suggestKey(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => t.includes(w));
}

/**
 * Список подсказок из значений: одинаковые без учёта регистра и «ё»
 * склеиваются, пишется самый частый вариант, частые — выше.
 */
export function rankSuggestions(values: (string | null | undefined)[]): string[] {
  const by = new Map<string, { label: string; n: number; spell: Map<string, number> }>();
  for (const raw of values) {
    const v = (raw ?? "").trim();
    if (!v) continue;
    const k = suggestKey(v);
    const e = by.get(k) ?? { label: v, n: 0, spell: new Map<string, number>() };
    e.n += 1;
    e.spell.set(v, (e.spell.get(v) ?? 0) + 1);
    by.set(k, e);
  }
  return [...by.values()]
    .map((e) => {
      const label = [...e.spell.entries()].sort((a, b) => b[1] - a[1])[0]![0];
      return { label: label.charAt(0).toUpperCase() + label.slice(1), n: e.n };
    })
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, "ru"))
    .map((e) => e.label);
}

export const SuggestInput = forwardRef<HTMLInputElement, Props>(function SuggestInput(
  {
    value,
    onValueChange,
    suggestions,
    limit = 8,
    touch = false,
    heading = "Вписывали раньше",
    meta,
    minChars = 0,
    onFocus,
    onBlur,
    onKeyDown,
    className,
    ...rest
  },
  outerRef,
) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const list = useMemo(() => {
    const q = suggestKey(value);
    const all = suggestions.filter((s) => suggestKey(s) !== q);
    if (!q) return all.slice(0, limit);
    const starts = all.filter((s) => suggestKey(s).startsWith(q));
    const inside = all.filter((s) => !suggestKey(s).startsWith(q) && matchWords(s, q));
    return [...starts, ...inside].slice(0, limit);
  }, [suggestions, value, limit]);

  const show = open && list.length > 0 && value.trim().length >= minChars;

  useLayoutEffect(() => {
    if (!show) return;
    const update = () => innerRef.current && setRect(innerRef.current.getBoundingClientRect());
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [show]);

  useEffect(() => setActive(-1), [value, open]);

  const pick = (s: string) => {
    onValueChange(s);
    setOpen(false);
  };

  const setRefs = (el: HTMLInputElement | null) => {
    innerRef.current = el;
    if (typeof outerRef === "function") outerRef(el);
    else if (outerRef) outerRef.current = el;
  };

  // Список не помещается снизу — открываем над полем.
  const below = rect ? window.innerHeight - rect.bottom : 0;
  const itemH = touch ? 44 : 34;
  const listH = Math.min(list.length, limit) * itemH + 30;
  const up = rect ? below < listH + 8 && rect.top > below : false;

  return (
    <>
      <input
        {...rest}
        ref={setRefs}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={show}
        aria-autocomplete="list"
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (show) {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => (i + 1) % list.length);
              return;
            }
            if (e.key === "ArrowUp" && active >= 0) {
              e.preventDefault();
              setActive((i) => i - 1);
              return;
            }
            if (e.key === "Enter" && active >= 0) {
              e.preventDefault();
              pick(list[active]!);
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
              return;
            }
          }
          onKeyDown?.(e);
        }}
      />
      {show &&
        rect &&
        createPortal(
          <div
            role="listbox"
            className="fixed z-[1200] overflow-hidden rounded-xl border border-border bg-surface shadow-card-lg"
            style={{
              left: Math.min(rect.left, window.innerWidth - Math.max(rect.width, 180) - 8),
              width: Math.max(rect.width, 180),
              ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
            }}
            // Касание списка не должно снимать фокус с поля (иначе он закроется).
            onPointerDown={(e) => e.preventDefault()}
            onMouseDown={(e) => e.preventDefault()}
          >
            <div className="flex items-center gap-1.5 border-b border-border bg-surface-soft px-2.5 py-1.5 text-[10.5px] font-semibold text-muted-2">
              <History size={11} /> {heading}
            </div>
            {list.map((s, i) => (
              <button
                key={s}
                type="button"
                role="option"
                aria-selected={i === active}
                onClick={() => pick(s)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 text-left font-medium text-ink",
                  touch ? "h-11 text-[15px]" : "h-[34px] text-[13px]",
                  i === active ? "bg-blue-50 text-blue-700" : "hover:bg-surface-soft",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{s}</span>
                {meta?.(s) && (
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums text-muted">{meta(s)}</span>
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
});
