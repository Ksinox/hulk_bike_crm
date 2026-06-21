import { Sparkles, RefreshCw, X } from "lucide-react";

type Props = {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Вторичное действие — «Что нового» (ведёт в раздел релизов). */
  secondaryLabel?: string;
  onSecondary?: () => void;
  onClose: () => void;
};

/**
 * Тост «Доступна новая версия» — в одном визуальном языке с lib/toast
 * (светлый bg-surface, синяя рамка/иконка, жирный заголовок). Персистентный
 * (без авто-исчезновения). Две кнопки: «Обновить» (перезагрузка) и «Что нового»
 * (перезагрузка в раздел релизов). На мобиле — сверху, как push.
 */
export function UpdateToast({
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
  onClose,
}: Props) {
  return (
    <div
      role="alert"
      className="animate-modal-in fixed left-3 right-3 top-3 z-[1001] overflow-hidden rounded-xl border border-blue-300 bg-surface shadow-card-lg sm:bottom-5 sm:left-auto sm:right-5 sm:top-auto sm:w-full sm:max-w-[440px]"
    >
      <div className="flex items-start gap-2.5 p-3 pb-3.5 sm:gap-3.5 sm:p-4 sm:pb-[18px]">
        <Sparkles
          size={26}
          className="mt-0.5 h-[22px] w-[22px] shrink-0 text-blue-500 sm:h-[26px] sm:w-[26px]"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold leading-tight text-ink sm:text-[15.5px]">
            {title}
          </div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2 sm:mt-1 sm:text-[13.5px]">
            {description}
          </div>
          {(actionLabel || secondaryLabel) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {actionLabel && onAction && (
                <button
                  type="button"
                  onClick={onAction}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-500 px-3.5 py-2 text-[13px] font-bold text-white transition-colors hover:bg-blue-600 active:scale-[0.98]"
                >
                  <RefreshCw size={15} /> {actionLabel}
                </button>
              )}
              {secondaryLabel && onSecondary && (
                <button
                  type="button"
                  onClick={onSecondary}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-surface-soft px-3.5 py-2 text-[13px] font-bold text-blue-700 ring-1 ring-inset ring-blue-200 transition-colors hover:bg-blue-50 active:scale-[0.98]"
                >
                  <Sparkles size={15} /> {secondaryLabel}
                </button>
              )}
            </div>
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
