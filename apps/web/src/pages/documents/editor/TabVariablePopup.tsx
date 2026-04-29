import { useEffect, useMemo, useRef, useState } from "react";
import type { VariableDescriptor } from "@/lib/api/document-templates";

/**
 * Popup-меню переменных по Tab. Полностью независим от Mention extension —
 * мы сами открываем его, фильтруем, и при выборе вставляем VariableNode
 * напрямую через editor.chain. Так избегаем хрупкости с программным
 * `@`-триггером (Mention plugin часто не поднимался корректно).
 *
 * Управление: ввод фильтрует по label / key, ↑↓ навигация, Enter выбор,
 * Escape закрытие. Клик по пункту тоже работает.
 */
export function TabVariablePopup({
  items,
  anchor,
  onPick,
  onClose,
}: {
  items: VariableDescriptor[];
  /** Координаты относительно viewport — где показать popup. */
  anchor: { left: number; top: number };
  onPick: (v: VariableDescriptor) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 30);
    return items
      .filter(
        (v) =>
          v.label.toLowerCase().includes(q) ||
          v.key.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [items, query]);

  // При смене фильтра возвращаемся к первому элементу.
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Автофокус на input — чтобы пользователь сразу мог фильтровать.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(
        (i) => (i + 1) % Math.max(filtered.length, 1),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(
        (i) =>
          (i + filtered.length - 1) % Math.max(filtered.length, 1),
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[selectedIndex];
      if (item) onPick(item);
      return;
    }
    if (e.key === "Tab") {
      // Tab внутри popup тоже ничего не должен ломать — гасим, чтобы
      // фокус не сбежал на toolbar или соседний компонент.
      e.preventDefault();
    }
  };

  // Закрытие при клике вне popup.
  const popupRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onMouseDown = (ev: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(ev.target as Node)
      ) {
        onClose();
      }
    };
    window.addEventListener("mousedown", onMouseDown, true);
    return () => window.removeEventListener("mousedown", onMouseDown, true);
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      style={{
        position: "fixed",
        left: anchor.left,
        top: anchor.top,
        zIndex: 1000,
      }}
      className="w-[300px] rounded-[10px] border border-border bg-white shadow-card"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        placeholder="Поиск переменной..."
        className="block w-full border-b border-border bg-surface-soft px-3 py-2 text-[13px] outline-none"
      />
      <div className="max-h-[260px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-muted-2">
            Нет переменных по запросу
          </div>
        ) : (
          filtered.map((item, index) => (
            <button
              key={item.key}
              type="button"
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={() => onPick(item)}
              className={
                "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] " +
                (index === selectedIndex
                  ? "bg-blue-50 text-blue-700"
                  : "text-ink hover:bg-surface-soft")
              }
            >
              <span className="font-semibold">{item.label}</span>
              <span className="text-[10px] font-mono text-muted-2">
                {item.key}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
