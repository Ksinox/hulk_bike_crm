/**
 * AccordionSection — переиспользуемая сворачиваемая секция карточки
 * аренды (drawer-режим v0.7.8).
 *
 * Плавность раскрытия/сворачивания реализована через анимацию
 * `grid-template-rows: 0fr → 1fr` + внутренний `overflow-hidden`.
 * Этот приём даёт настоящую плавную анимацию высоты без знания точной
 * высоты контента (в отличие от max-height-хака). duration-300 ease-in-out.
 */
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function AccordionSection({
  title,
  icon,
  defaultOpen = true,
  children,
  badge,
}: {
  title: string;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  badge?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border border-border bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left hover:bg-surface-soft/60 transition-colors"
      >
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-semibold text-ink">
          {icon}
          <span className="truncate">{title}</span>
          {badge}
        </span>
        <ChevronDown
          size={18}
          className={cn(
            "shrink-0 text-muted-2 transition-transform duration-300",
            open && "rotate-180",
          )}
        />
      </button>
      {/* Плавное раскрытие через grid-template-rows 0fr↔1fr. */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>
  );
}
