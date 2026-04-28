import { useState } from "react";
import { Bell, ChevronDown, ChevronUp, Eye, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import {
  useApplications,
  useDeleteApplication,
  type ApiApplication,
} from "@/lib/api/clientApplications";
import { AddClientModal } from "./AddClientModal";
import { NewApplicationModal } from "./NewApplicationModal";
import { applicationToFormInit } from "./applicationConvert";

/**
 * Сворачиваемый блок «Новые заявки» в /clients.
 *
 * Поток:
 *  - Клик по строке → открывается NewApplicationModal с данными и фото.
 *    Менеджер может посмотреть фото, оценить качество и решить, нужен
 *    ли такой клиент.
 *  - В модалке: «Оформить сейчас» → AddClientModal (convert API),
 *    «Позже» → закрыть модалку, заявка остаётся как viewed,
 *    «Это спам» → удалить заявку и её файлы из MinIO.
 *  - Кнопка «Удалить» в строке (для очевидных фейков без открытия) — есть.
 */

export function ApplicationsBlock() {
  const { data: items = [] } = useApplications();
  const newCount = items.filter((a) => a.status === "new").length;
  const total = items.length;
  const [open, setOpen] = useState(true);
  const [viewing, setViewing] = useState<ApiApplication | null>(null);
  const [converting, setConverting] = useState<ApiApplication | null>(null);
  const deleteApp = useDeleteApplication();

  if (total === 0) return null;

  const openForReview = (a: ApiApplication) => {
    // Просмотр заявки НЕ меняет её статус — она остаётся 'new' пока
    // менеджер не оформит её или не удалит как спам.
    setViewing(a);
  };

  const handleConvert = () => {
    if (!viewing) return;
    setConverting(viewing);
    setViewing(null);
  };

  const handleDelete = (id: number) => {
    if (!window.confirm(`Удалить заявку #${id}? Файлы будут удалены безвозвратно.`)) return;
    deleteApp.mutate(id, {
      onSuccess: () => {
        toast.success("Заявка удалена");
        if (viewing?.id === id) setViewing(null);
      },
      onError: () => toast.error("Не удалось удалить"),
    });
  };

  return (
    <>
      <div
        className={cn(
          "rounded-2xl border bg-surface shadow-card-sm",
          newCount > 0 ? "border-amber-300" : "border-border",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((s) => !s)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <div className="flex items-center gap-2">
            <Bell
              size={16}
              className={newCount > 0 ? "text-amber-500" : "text-muted"}
            />
            <span className="text-[14px] font-semibold text-ink">
              Новые заявки
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                newCount > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-surface-soft text-muted",
              )}
            >
              {total} {newCount > 0 && `· ${newCount} новых`}
            </span>
          </div>
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {open && (
          <div className="border-t border-border">
            {items.map((a) => (
              <ApplicationRow
                key={a.id}
                app={a}
                onReview={() => openForReview(a)}
                onDelete={() => handleDelete(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      {viewing && (
        <NewApplicationModal
          application={viewing}
          onConvertNow={handleConvert}
          onLater={() => setViewing(null)}
          onDelete={() => handleDelete(viewing.id)}
        />
      )}

      {converting && (
        <AddClientModal
          onClose={() => setConverting(null)}
          applicationId={converting.id}
          initialData={applicationToFormInit(converting)}
          onCreated={() => {
            setConverting(null);
            toast.success("Клиент создан из заявки");
          }}
        />
      )}
    </>
  );
}

function ApplicationRow({
  app,
  onReview,
  onDelete,
}: {
  app: ApiApplication;
  onReview: () => void;
  onDelete: () => void;
}) {
  const isNew = app.status === "new";
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-surface-soft",
        isNew && "bg-amber-50/50",
      )}
    >
      {/* По клику в свободную зону строки — открывается просмотр.
          Кнопки в правой части перехватывают клик и не триггерят review. */}
      <button
        type="button"
        onClick={onReview}
        className="flex min-w-0 flex-1 flex-col items-start text-left"
        title="Открыть заявку"
      >
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-ink">{app.name || "—"}</span>
          {isNew && (
            <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
              новая
            </span>
          )}
        </div>
        <div className="text-[12px] text-muted">
          {app.phone || "—"}
          {app.submittedAt && (
            <span> · {formatRelativeTime(app.submittedAt)}</span>
          )}
        </div>
      </button>
      <button
        type="button"
        onClick={onReview}
        className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-surface-soft"
        title="Просмотреть заявку"
      >
        <Eye size={12} /> Открыть
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="rounded-full border border-border p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
        title="Удалить (фейк/спам)"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return "только что";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / (60 * 60_000))} ч назад`;
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
