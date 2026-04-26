import { useEffect, useRef, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type MenuAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: "primary" | "warn" | "danger" | "ghost";
};

/**
 * Выпадающее меню действий по аренде.
 * Первый action из списка — отдельная primary-кнопка слева от "Действия".
 * Остальные — в dropdown.
 */
export function RentalActionsMenu({
  actions,
  onAction,
}: {
  actions: MenuAction[];
  onAction: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const primary = actions[0];
  const rest = actions.slice(1);
  const PrimaryIcon = primary.icon;

  const primaryToneCls =
    primary.tone === "primary"
      ? "bg-blue-600 text-white hover:bg-blue-700"
      : primary.tone === "warn"
        ? "bg-orange-soft text-orange-ink hover:bg-orange/20"
        : primary.tone === "danger"
          ? "bg-red-soft text-red-ink hover:bg-red/20"
          : "bg-surface-soft text-ink-2 hover:bg-border";

  // Primary-кнопку с тоном "primary" (например «Завершить аренду»)
  // делаем визуально крупнее — это основное действие на карточке.
  const primarySizeCls =
    primary.tone === "primary"
      ? "px-4 py-2 text-[13px]"
      : "px-3 py-1.5 text-[12px]";

  return (
    <div ref={ref} className="relative inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onAction(primary.id)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full font-semibold transition-colors whitespace-nowrap",
          primarySizeCls,
          primaryToneCls,
        )}
      >
        <PrimaryIcon size={primary.tone === "primary" ? 14 : 13} />
        {primary.label}
      </button>

      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-ink-2 transition-colors",
              open ? "bg-surface-soft" : "hover:bg-surface-soft",
            )}
            title="Ещё действия"
          >
            Действия
            <ChevronDown
              size={13}
              className={cn(
                "transition-transform",
                open && "rotate-180",
              )}
            />
          </button>

          {open && (
            <div className="absolute right-0 top-full z-50 mt-2 w-[260px] origin-top-right animate-modal-in overflow-hidden rounded-[14px] border border-border bg-surface shadow-card-lg">
              <div className="py-1">
                {rest.map((a) => {
                  const Icon = a.icon;
                  const itemToneCls =
                    a.tone === "danger"
                      ? "text-red-ink hover:bg-red-soft/40"
                      : a.tone === "warn"
                        ? "text-orange-ink hover:bg-orange-soft/40"
                        : "text-ink-2 hover:bg-blue-50";
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onAction(a.id);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-semibold transition-colors",
                        itemToneCls,
                      )}
                    >
                      <Icon size={14} className="shrink-0" />
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
