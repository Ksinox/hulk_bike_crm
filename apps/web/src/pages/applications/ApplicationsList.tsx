import { Bike, ChevronRight, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  REJECTION_REASON_LABEL,
  type ApiApplication,
  type ApplicationStatus,
  type RejectionReasonCode,
} from "@/lib/api/clientApplications";

const STATUS_BADGE: Record<
  ApplicationStatus,
  { label: string; className: string }
> = {
  draft: { label: "Черновик", className: "bg-surface-soft text-muted" },
  new: { label: "Новая", className: "bg-amber-50 text-amber-800" },
  viewed: { label: "Просмотрена", className: "bg-blue-50 text-blue-700" },
  accepted: { label: "Принята", className: "bg-green-soft text-green-ink" },
  rejected: { label: "Отклонена", className: "bg-red-soft text-red-ink" },
  spam: { label: "Спам", className: "bg-orange-soft text-orange-ink" },
  cancelled: { label: "Отменена", className: "bg-surface-soft text-muted" },
};

const SOURCE_LABEL: Record<NonNullable<ApiApplication["source"]>, string> = {
  avito: "Авито",
  repeat: "Уже катался",
  ref: "Рекомендация",
  maps: "Карты",
  other: "Другое",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}.${mm}.${yyyy} · ${hh}:${min}`;
}

export function ApplicationsList({
  items,
  loading,
  onOpen,
  onRestore,
}: {
  items: ApiApplication[];
  loading: boolean;
  onOpen: (id: number) => void;
  onRestore: (id: number) => void | Promise<void>;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-8 text-center text-[13px] text-muted-2">
        Загрузка…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-12 text-center">
        <Bike size={36} className="mx-auto text-muted-2" />
        <div className="mt-3 text-[14px] font-semibold text-ink">
          Заявок не найдено
        </div>
        <div className="mt-1 text-[12px] text-muted-2">
          Здесь появятся анкеты, которые клиенты заполнят по публичной ссылке.
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface">
      <div className="grid grid-cols-[1fr_140px_140px_140px_56px] items-center gap-3 border-b border-border bg-surface-soft px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-2">
        <div>Клиент</div>
        <div>Источник</div>
        <div>Подана</div>
        <div>Статус</div>
        <div />
      </div>

      <div className="divide-y divide-border">
        {items.map((a) => {
          const badge = STATUS_BADGE[a.status];
          const sourceLabel =
            a.source === "other" && a.sourceCustom
              ? a.sourceCustom
              : a.source
                ? SOURCE_LABEL[a.source]
                : "—";
          const isRejected = a.status === "rejected" || a.status === "spam";
          return (
            <div
              key={a.id}
              className="group grid grid-cols-[1fr_140px_140px_140px_56px] items-center gap-3 px-4 py-3 transition-colors hover:bg-blue-50/40"
            >
              <button
                type="button"
                onClick={() => onOpen(a.id)}
                className="flex flex-col items-start text-left"
              >
                <div className="text-[14px] font-bold text-ink group-hover:text-blue-700">
                  {a.name || "Без имени"}
                </div>
                <div className="text-[12px] text-muted-2">
                  {a.phone || "телефон не указан"}
                </div>
                {isRejected && a.rejectionReasonCode && (
                  <div className="mt-1 text-[11px] text-muted">
                    Причина:{" "}
                    {REJECTION_REASON_LABEL[
                      a.rejectionReasonCode as RejectionReasonCode
                    ] ?? a.rejectionReasonCode}
                    {a.rejectionReason ? ` — ${a.rejectionReason}` : ""}
                  </div>
                )}
              </button>
              <div className="text-[12px] text-muted-2">{sourceLabel}</div>
              <div className="text-[12px] text-muted-2">
                {formatDate(a.submittedAt ?? a.createdAt)}
              </div>
              <div>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    badge.className,
                  )}
                >
                  {badge.label}
                </span>
              </div>
              <div className="flex items-center justify-end gap-1">
                {isRejected && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRestore(a.id);
                    }}
                    title="Вернуть в «Новые»"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted hover:bg-blue-50 hover:text-blue-700"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpen(a.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted hover:bg-blue-50 hover:text-blue-700"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
