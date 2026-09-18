import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Переключатель вкладок раздела (18.09): «Развитие» — «Текущие работы» /
 * «Что уже сделано», «Настройки» — «Основные» / «Хранилище». На компьютере —
 * капсула по центру, на телефоне — во всю ширину, кнопки под палец.
 */
export function SectionTabs<T extends string>({
  tabs,
  value,
  onChange,
  touch = false,
  align = "center",
  attr,
}: {
  tabs: { id: T; label: string; icon: LucideIcon; badge?: number }[];
  value: T;
  onChange: (id: T) => void;
  touch?: boolean;
  align?: "center" | "start";
  /** Имя data-атрибута кнопки — для сценариев проверки. */
  attr: string;
}) {
  return (
    <div className={cn("flex", touch ? "w-full" : align === "center" ? "justify-center" : "justify-start")}>
      <div
        role="tablist"
        className={cn(
          "gap-1 rounded-full bg-surface p-1 shadow-card-sm",
          touch ? "grid w-full" : "inline-flex",
        )}
        style={touch ? { gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` } : undefined}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const on = value === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              {...{ [`data-${attr}`]: t.id }}
              onClick={() => onChange(t.id)}
              className={cn(
                "relative inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full font-bold transition-colors",
                touch ? "h-11 px-2 text-[14px]" : "h-9 px-4 text-[13px]",
                on ? "bg-ink text-white" : "text-muted hover:text-ink",
              )}
            >
              {/* Телефон: без значка, счётчик — кружком в углу, чтобы
                  «Что уже сделано» помещалось целиком и на 360px. */}
              {!touch && <Icon size={14} />}
              <span className="truncate">{t.label}</span>
              {!on && (t.badge ?? 0) > 0 && (
                <span
                  className={cn(
                    "shrink-0 rounded-full bg-red px-1.5 py-px text-[10px] font-bold leading-4 text-white",
                    touch && "absolute -top-1.5 right-1 ring-2 ring-surface",
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
