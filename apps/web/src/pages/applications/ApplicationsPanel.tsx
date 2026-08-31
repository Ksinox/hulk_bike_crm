import { useState } from "react";
import { Inbox, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApplications } from "@/lib/api/clientApplications";
import { Applications } from "./Applications";

/**
 * Кнопка «Заявки» с панелью — живёт внутри своего раздела (правка 31.08).
 *
 * Заказчик: пока заявка была одна (на аренду), ей был нужен отдельный
 * пункт меню. Теперь их два вида, и каждая должна лежать там, где с ней
 * работают: арендные — в «Арендах», на покупку — в «Продажах». Из кнопки
 * же отправляется ссылка на анкету нужного типа.
 */
export function ApplicationsButton({
  purpose,
  className,
}: {
  purpose: "rent" | "sale";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const q = useApplications({ status: "active", poll: true });
  const fresh = (q.data ?? []).filter(
    (a) => (a.purpose ?? "rent") === purpose && a.status === "new",
  ).length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "relative inline-flex items-center gap-1.5 rounded-full bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink shadow-card-sm transition-colors hover:bg-surface-soft",
          className,
        )}
      >
        <Inbox size={15} className="text-blue-600" />
        Заявки
        {fresh > 0 && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red px-1 text-[10.5px] font-bold text-white">
            {fresh}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-bg animate-slide-in-right">
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
            <Inbox size={18} className="text-blue-600" />
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-bold text-ink">
                {purpose === "sale" ? "Заявки на покупку" : "Заявки на аренду"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-2 hover:bg-surface-soft hover:text-ink"
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6">
            <Applications purpose={purpose} embedded />
          </div>
        </div>
      )}
    </>
  );
}
