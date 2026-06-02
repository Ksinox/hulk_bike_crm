import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Полноэкранная мобильная форма-модалка. Шапка (Закрыть + заголовок),
 * прокручиваемое тело и липкий футер с кнопкой действия. Используется
 * для «тяжёлых» форм (новый клиент, новая аренда, оплата и т.п.).
 */
export function MobileFormScreen({
  title,
  onClose,
  onSubmit,
  submitLabel,
  canSubmit,
  submitting,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  canSubmit: boolean;
  submitting?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-3 pt-[env(safe-area-inset-top)]">
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full text-muted active:bg-surface-soft"
          aria-label="Закрыть"
        >
          <X size={20} />
        </button>
        <h1 className="font-display text-[17px] font-bold text-ink">{title}</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 pb-28">{children}</div>

      <footer className="absolute inset-x-0 bottom-0 border-t border-border bg-surface px-4 py-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
          className={cn(
            "flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold transition-colors",
            canSubmit && !submitting
              ? "bg-blue-600 text-white active:bg-blue-700"
              : "cursor-not-allowed bg-surface-soft text-muted-2",
          )}
        >
          {submitting && <Loader2 size={17} className="animate-spin" />}
          {submitLabel}
        </button>
      </footer>
    </div>
  );
}

/** Поле формы: лейбл (со звёздочкой) + контент + ошибка. */
export function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label className="mb-3.5 block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
        {required && <span className="ml-0.5 text-red-ink">*</span>}
      </span>
      {children}
      {error && <span className="mt-1 block text-[12px] text-red-ink">{error}</span>}
    </label>
  );
}

/** Текстовый инпут под мобильную форму. */
export function TextInput({
  value,
  onChange,
  placeholder,
  inputMode,
  invalid,
  maxLength,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "text" | "tel" | "numeric";
  invalid?: boolean;
  maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      inputMode={inputMode}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "h-12 w-full rounded-2xl bg-surface px-3.5 text-[15px] text-ink shadow-card-sm outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100",
        invalid && "ring-2 ring-red/40",
      )}
    />
  );
}

/** Сегмент-переключатель (например РФ / иностранец). */
export function SegmentToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-2xl bg-surface-soft p-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "flex-1 rounded-xl py-2 text-[13px] font-semibold transition-colors",
            value === o.id ? "bg-surface text-ink shadow-card-sm" : "text-muted",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Выбор одного из вариантов чипами (источник, метод оплаты и т.п.). */
export function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors",
            value === o.id ? "bg-ink text-white" : "bg-surface text-muted shadow-card-sm",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
