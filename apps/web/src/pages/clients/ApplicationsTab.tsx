/**
 * v0.4.0 — отдельный таб «Заявки» в /clients.
 *
 * Заказчик: «дополнительный таб со всеми заявками которые нам приходили,
 * и мы можем каждую оформить либо поставить пометку спам — это значит
 * их удаляет из базы данных полностью».
 *
 * До этой итерации заявки жили в свёрнутом блоке наверху страницы
 * (ApplicationsBlock). Блок остаётся, но теперь дополнительно есть
 * отдельный таб с расширенным списком и явной кнопкой «Спам» рядом с
 * «Оформить» — оператор не путается с иконкой корзины.
 */
import { useState } from "react";
import { Check, Trash2, Eye, MailQuestion } from "lucide-react";
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

export function ApplicationsTab() {
  const { data: items = [], isLoading } = useApplications();
  const deleteApp = useDeleteApplication();
  const [viewing, setViewing] = useState<ApiApplication | null>(null);
  const [converting, setConverting] = useState<ApiApplication | null>(null);

  const newCount = items.filter((a) => a.status === "new").length;

  const markSpam = (a: ApiApplication) => {
    if (!window.confirm(`Пометить заявку «${a.name || "—"}» как спам и удалить?`)) {
      return;
    }
    deleteApp.mutate(a.id, {
      onSuccess: () => toast.success("Заявка удалена", "Помечена как спам"),
      onError: () => toast.error("Не удалось удалить"),
    });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center text-[13px] text-muted">
        Загружаем заявки…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-2 rounded-2xl bg-surface p-10 text-center text-[13px] text-muted shadow-card-sm">
        <MailQuestion size={32} className="text-muted-2" />
        <div className="font-semibold text-ink">Заявок пока нет</div>
        <div>Когда клиент заполнит форму на сайте — появится здесь.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-2xl bg-surface px-4 py-3 shadow-card-sm">
        <div className="text-[13px] text-ink">
          <b>{items.length}</b> {items.length === 1 ? "заявка" : "заявок"}
          {newCount > 0 && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">
              {newCount} новых
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-2">
          «Оформить» — создать клиента из заявки. «Спам» — удалить из БД.
        </div>
      </div>

      <div className="rounded-2xl bg-surface shadow-card-sm">
        {items.map((a, idx) => (
          <div
            key={a.id}
            className={cn(
              "flex flex-wrap items-center gap-3 px-4 py-3",
              idx > 0 && "border-t border-border",
              a.status === "new" && "bg-amber-50/40",
            )}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-ink">
                  {a.name || "Без имени"}
                </span>
                {a.status === "new" && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                    новая
                  </span>
                )}
                {a.status === "viewed" && (
                  <span className="rounded-full bg-surface-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-muted">
                    просмотрена
                  </span>
                )}
              </div>
              <div className="text-[12px] text-muted-2">
                {a.phone || "телефон не указан"}
                {a.submittedAt && (
                  <span> · {new Date(a.submittedAt).toLocaleString("ru-RU")}</span>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewing(a)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-surface-soft"
            >
              <Eye size={12} /> Просмотр
            </button>
            <button
              type="button"
              onClick={() => setConverting(a)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-blue-700"
            >
              <Check size={12} /> Оформить
            </button>
            <button
              type="button"
              onClick={() => markSpam(a)}
              className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50"
              title="Пометить как спам и удалить из БД"
            >
              <Trash2 size={12} /> Спам
            </button>
          </div>
        ))}
      </div>

      {viewing && (
        <NewApplicationModal
          application={viewing}
          onConvertNow={() => {
            setConverting(viewing);
            setViewing(null);
          }}
          onLater={() => setViewing(null)}
          onDelete={() => {
            markSpam(viewing);
            setViewing(null);
          }}
        />
      )}
      {converting && (
        <AddClientModal
          onClose={() => setConverting(null)}
          applicationId={converting.id}
          initialData={applicationToFormInit(converting)}
          onCreated={() => {
            setConverting(null);
            toast.success("Клиент создан", "Заявка переведена в клиента");
          }}
        />
      )}
    </div>
  );
}
