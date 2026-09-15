import { cn } from "@/lib/utils";

/**
 * Переключатель «вкл / выкл» (14.09) — свой компонент вместо браузерной
 * галочки. Кнопка с role="switch": работает с клавиатуры (пробел, Enter),
 * размер под палец — дорожка 44×26.
 */
export function Switch({
  checked,
  onChange,
  disabled,
  label,
  id,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Подпись для скринридера, если рядом нет видимого текста с htmlFor. */
  label?: string;
  id?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[26px] w-11 shrink-0 items-center rounded-full transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2",
        checked ? "bg-blue-600" : "bg-border-strong",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute left-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.25)] transition-transform",
          checked && "translate-x-[18px]",
        )}
      />
    </button>
  );
}
