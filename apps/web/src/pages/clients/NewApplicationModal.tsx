import { useEffect } from "react";
import { confirmDialog } from "@/lib/toast";
import { Bell, X } from "lucide-react";
import {
  useDeleteApplication,
  type ApiApplication,
} from "@/lib/api/clientApplications";
import { ApplicationView } from "@/pages/applications/ApplicationView";

/**
 * Карточка новой заявки. Чистый просмотр «личного дела»: единый
 * ApplicationView сам рендерит все действия (Принять/Отклонить под
 * ключевыми датами на компе; sticky-панель снизу на узких ширинах) и
 * вторичные ссылки (Позже / Спам / Удалить). Обёртка лишь прокидывает
 * обработчики. На мобиле (телефон) используется отдельный AppDetail.
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
  /** @deprecated Игнорируется: удаление теперь самодостаточно внутри модалки
   *  (жёсткий DELETE). Оставлен в типе, чтобы старые вызовы не падали. */
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

  const deleteApp = useDeleteApplication();
  const handleDelete = async () => {
    const ok = await confirmDialog({
      title: "Удалить заявку?",
      message:
        "Заявка и её фото будут удалены безвозвратно. Если клиент и аренда по ней уже оформлены — они останутся (счётчик «оформлено в аренду» не изменится).",
      confirmText: "Удалить заявку",
      danger: true,
    });
    if (!ok) return;
    // Самодостаточный жёсткий DELETE: одинаково во всех местах, где
    // показывается модалка. Старый проп onDelete был перегружен (в одних
    // вызовах — delete, в других — markSpam), поэтому больше его не зовём.
    await deleteApp.mutateAsync(application.id);
    onLater();
  };

  // Главная кнопка: «Принять» (новая) → конвертация; для уже принятой с
  // клиентом — «Оформить аренду» (возобновление прерванного флоу); если
  // принята и возобновить нечем — «Уже оформлено» (disabled).
  const accepted = application.status === "accepted";
  const canResume =
    accepted && application.clientId != null && !!onCreateRental;
  const onAccept = canResume ? onCreateRental : onConvertNow;
  const acceptLabel = canResume
    ? "Оформить аренду"
    : accepted
      ? "Уже оформлено"
      : "Принять";

  return (
    <div className="fixed inset-0 z-[100] flex items-stretch justify-center overflow-y-auto bg-ink/60 p-0 backdrop-blur-sm sm:items-start sm:p-8">
      <div className="min-h-[100dvh] w-full rounded-none bg-surface shadow-card-lg sm:my-6 sm:min-h-0 sm:max-w-[640px] sm:rounded-3xl lg:max-w-[1080px]">
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
          <ApplicationView
            app={application}
            readOnly={readOnly}
            onAccept={onAccept}
            acceptLabel={acceptLabel}
            acceptDisabled={accepted && !canResume}
            onReject={onReject}
            onSpam={onSpam}
            onDelete={handleDelete}
            onLater={onLater}
          />
        </div>

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
