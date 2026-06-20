import { Sparkles, RefreshCw, X } from "lucide-react";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  onClose: () => void;
};

/**
 * Тост «Доступна новая версия» — в одном визуальном языке с lib/toast
 * (светлый bg-surface, цветная рамка/иконка, жирный заголовок, spring-вход).
 * Отличия от обычных тостов: ПЕРСИСТЕНТНЫЙ (не авто-исчезает, без полосы-
 * таймера) и CTA «Обновить» — крупная синяя кнопка (главное действие).
 */
export function UpdateToast({
  title,
  description,
  actionLabel,
  onAction,
  onClose,
}: Props) {
  return (
    <div
      role="alert"
      className="animate-modal-in fixed bottom-5 right-5 z-[1001] w-full max-w-[440px] overflow-hidden rounded-xl border border-blue-300 bg-surface shadow-card-lg"
    >
      <div className="flex items-start gap-3.5 p-4 pb-[18px]">
        <Sparkles size={26} className="mt-0.5 shrink-0 text-blue-500" />
        <div className="min-w-0 flex-1">
          <div className="text-[15.5px] font-bold leading-tight text-ink">
            {title}
          </div>
          <div className="mt-1 text-[13.5px] leading-snug text-ink-2">
            {description}
          </div>
          {actionLabel && onAction && (
            <button
              type="button"
              onClick={onAction}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3.5 py-2 text-[13.5px] font-bold text-white transition-colors hover:bg-blue-600 active:scale-[0.98]"
            >
              <RefreshCw size={15} /> {actionLabel}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть"
          className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted-2 transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <X size={17} />
        </button>
      </div>
    </div>
  );
}
