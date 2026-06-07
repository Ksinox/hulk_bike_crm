import { useEffect } from "react";
import { confirmDialog } from "@/lib/toast";
import { AlertCircle, Bell, Bike, Check, Clock, Trash2, X } from "lucide-react";
import type { ApiApplication } from "@/lib/api/clientApplications";
import { ApplicationView } from "@/pages/applications/ApplicationView";

/**
 * Карточка новой заявки. Чистый просмотр «личного дела»: единый
 * ApplicationView (селфи + документы + сгруппированная инфа), снизу —
 * действия (спам/отклонить/позже/оформить). На мобиле — на весь экран.
 *
 * Cross-origin картинки (web crm.hulkbike.ru, API api.hulkbike.ru) с
 * crossOrigin="use-credentials" — обрабатываются внутри ApplicationView.
 */

type Props = {
  application: ApiApplication;
  onConvertNow: () => void;
  onLater: () => void;
  /** Открывает форму причины и помечает заявку 'rejected'. */
  onReject?: () => void;
  /** Открывает форму причины и помечает заявку 'spam'. */
  onSpam?: () => void;
  /** Legacy: пометить как спам через старый DELETE (виджет дашборда). */
  onDelete?: () => void;
  /**
   * Заявка уже принята (клиент создан), но аренду не дооформили — даёт
   * «Оформить аренду» с префиллом (модель/срок/экипировка из заявки).
   * Спасает от потери флоу, если оформление прервали после создания клиента.
   */
  onCreateRental?: () => void;
  /** Read-only: только просмотр без кнопок действий. */
  readOnly?: boolean;
};

export function NewApplicationModal({
  application,
  onConvertNow,
  onLater,
  onReject,
  onSpam,
  onDelete,
  onCreateRental,
  readOnly,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onLater();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onLater]);

  const handleLegacyDelete = async () => {
    if (!onDelete) return;
    const ok = await confirmDialog({
      title: "Удалить заявку как спам?",
      message: "Удалить заявку как спам? Действие необратимо.",
      confirmText: "Удалить",
      danger: true,
    });
    if (ok) onDelete();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center overflow-y-auto bg-ink/60 p-0 backdrop-blur-sm sm:items-start sm:p-8">
      <div className="min-h-[100dvh] w-full rounded-none bg-surface shadow-card-lg sm:my-6 sm:min-h-0 sm:max-w-[600px] sm:rounded-3xl">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-surface/95 px-5 py-3.5 backdrop-blur-sm sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-soft text-orange-ink">
            <Bell size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-bold text-ink">Новая заявка</div>
            <div className="truncate text-[12px] text-muted">
              Заполнена клиентом по публичной ссылке
            </div>
          </div>
          <button
            type="button"
            onClick={onLater}
            aria-label="Закрыть"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-2 transition-colors hover:bg-surface-soft hover:text-ink"
          >
            <X size={18} />
          </button>
        </header>

        <div className="px-5 py-5 sm:px-6">
          <ApplicationView app={application} />
        </div>

        {!readOnly && (
          <footer className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-surface-soft/95 px-5 py-3.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap items-center gap-1">
              {onSpam && (
                <button
                  type="button"
                  onClick={onSpam}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-orange-ink transition-colors hover:bg-orange-soft/60"
                >
                  <AlertCircle size={14} /> Спам
                </button>
              )}
              {onReject && (
                <button
                  type="button"
                  onClick={onReject}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-red-ink transition-colors hover:bg-red-soft/60"
                >
                  <Trash2 size={14} /> Отклонить
                </button>
              )}
              {!onSpam && !onReject && onDelete && (
                <button
                  type="button"
                  onClick={handleLegacyDelete}
                  className="inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                >
                  <Trash2 size={14} /> Это спам
                </button>
              )}
            </div>
            <div className="flex flex-1 gap-2 sm:justify-end">
              <button
                type="button"
                onClick={onLater}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full border border-border bg-white px-5 text-[14px] font-semibold text-ink transition-colors hover:bg-surface-soft sm:flex-initial"
              >
                <Clock size={16} /> Позже
              </button>
              {application.status === "accepted" &&
              application.clientId != null &&
              onCreateRental ? (
                // Клиент уже создан, но аренду не дооформили — продолжаем с
                // префиллом из заявки (модель/срок/экипировка). Данные заявки
                // живут на сервере, поэтому прерванный флоу всегда можно
                // возобновить отсюда, не вводя всё заново.
                <button
                  type="button"
                  onClick={onCreateRental}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-green px-5 text-[14px] font-bold text-white shadow-card-sm transition-colors hover:bg-green-ink sm:flex-initial"
                >
                  <Bike size={16} /> Оформить аренду
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onConvertNow}
                  disabled={application.status === "accepted"}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-green px-5 text-[14px] font-bold text-white shadow-card-sm transition-colors hover:bg-green-ink disabled:opacity-50 sm:flex-initial"
                >
                  <Check size={16} />{" "}
                  {application.status === "accepted"
                    ? "Уже оформлено"
                    : "Оформить сейчас"}
                </button>
              )}
            </div>
          </footer>
        )}
        {readOnly && (
          <footer className="flex justify-end border-t border-border bg-surface-soft px-6 py-4">
            <button
              type="button"
              onClick={onLater}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-ink px-5 text-[13px] font-semibold text-white hover:bg-ink-2"
            >
              Закрыть
            </button>
          </footer>
        )}
      </div>
    </div>
  );
}
