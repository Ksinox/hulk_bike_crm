import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type ChoiceOption<T extends string> = {
  value: T;
  title: string;
  text?: ReactNode;
  icon?: ReactNode;
};

/**
 * Выбор из нескольких крупных вариантов (14.09) — свой компонент вместо
 * радиокнопок. Для вопросов, которые нельзя пропустить: пока ничего не
 * выбрано, карточки подсвечены предупреждающей рамкой (`required`).
 * Клавиатура: стрелки переключают вариант, как у обычной радиогруппы.
 */
export function ChoiceCards<T extends string>({
  value,
  onChange,
  options,
  required,
  labelledBy,
  className,
}: {
  value: T | null;
  onChange: (next: T) => void;
  options: ChoiceOption<T>[];
  /** Подсветить, что ответ обязателен и ещё не дан. */
  required?: boolean;
  labelledBy?: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };

  const needAnswer = required && value == null;

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={cn("grid gap-2.5 sm:grid-cols-2", className)}
    >
      {options.map((o, i) => {
        const on = value === o.value;
        const focusable = value == null ? i === 0 : on;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={focusable ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "flex min-h-[64px] items-start gap-3 rounded-2xl border-[1.5px] bg-surface px-4 py-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
              on
                ? "border-blue-600 bg-blue-50"
                : needAnswer
                  ? "border-amber-400 hover:border-blue-600"
                  : "border-border hover:border-blue-600",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2",
                on ? "border-blue-600" : "border-muted-2",
              )}
            >
              {on && <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14.5px] font-bold text-ink">
                {o.icon}
                {o.title}
              </span>
              {o.text && (
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted">
                  {o.text}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
