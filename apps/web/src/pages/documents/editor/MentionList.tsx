import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import type { VariableDescriptor } from "@/lib/api/document-templates";

export type MentionListHandle = {
  onKeyDown: (event: KeyboardEvent) => boolean;
};

/**
 * Popup-список переменных, который показывается при наборе «@» в редакторе.
 * Поддерживает навигацию стрелками и выбор по Enter.
 */
export const MentionList = forwardRef<
  MentionListHandle,
  {
    items: VariableDescriptor[];
    command: (item: { id: string; label: string }) => void;
  }
>(function MentionList({ items, command }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (item) command({ id: item.key, label: item.label });
  };

  const upHandler = () => {
    setSelectedIndex((idx) => (idx + items.length - 1) % Math.max(items.length, 1));
  };
  const downHandler = () => {
    setSelectedIndex((idx) => (idx + 1) % Math.max(items.length, 1));
  };
  const enterHandler = () => selectItem(selectedIndex);

  useImperativeHandle(
    ref,
    () => ({
      onKeyDown: (event) => {
        if (event.key === "ArrowUp") {
          upHandler();
          return true;
        }
        if (event.key === "ArrowDown") {
          downHandler();
          return true;
        }
        if (event.key === "Enter") {
          enterHandler();
          return true;
        }
        return false;
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, selectedIndex],
  );

  if (items.length === 0) {
    return (
      <div className="rounded-[10px] border border-border bg-white px-3 py-2 text-[12px] text-muted-2 shadow-card">
        Нет переменных по запросу
      </div>
    );
  }

  return (
    <div className="max-h-[260px] w-[280px] overflow-y-auto rounded-[10px] border border-border bg-white py-1 shadow-card">
      {items.map((item, index) => (
        <button
          key={item.key}
          type="button"
          className={
            "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[13px] " +
            (index === selectedIndex
              ? "bg-blue-50 text-blue-700"
              : "text-ink hover:bg-surface-soft")
          }
          onMouseEnter={() => setSelectedIndex(index)}
          onClick={() => selectItem(index)}
        >
          <span className="font-semibold">{item.label}</span>
          <span className="text-[10px] font-mono text-muted-2">
            {item.key}
          </span>
        </button>
      ))}
    </div>
  );
});
