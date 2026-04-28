import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApplications } from "@/lib/api/clientApplications";
import { navigate } from "@/app/navigationStore";

/**
 * Виджет «Новые заявки» на дашборде.
 *
 * Светится (animate-pulse + жёлтое кольцо) когда есть непросмотренные заявки —
 * чтобы менеджер их не пропустил при беглом взгляде. По клику переходит на
 * вкладку «Клиенты», где висит сворачиваемый блок со списком.
 */
export function NewApplicationsWidget({ className }: { className?: string }) {
  const { data: items = [] } = useApplications();
  const newCount = items.filter((a) => a.status === "new").length;
  const total = items.length;
  const hasNew = newCount > 0;

  const goToList = () => navigate({ route: "clients" });

  if (total === 0) {
    return (
      <button
        type="button"
        onClick={goToList}
        className={cn(
          "rounded-2xl bg-surface p-4 text-left shadow-card-sm transition-colors hover:bg-surface-soft",
          className,
        )}
      >
        <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
          <Bell size={14} /> Новые заявки
        </div>
        <div className="mt-2 text-[24px] font-bold text-ink">0</div>
        <div className="mt-1 text-[12px] text-muted-2">
          Поделитесь ссылкой с клиентом, чтобы он заполнил анкету сам.
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={goToList}
      className={cn(
        "rounded-2xl bg-surface p-4 text-left shadow-card-sm transition-all hover:bg-surface-soft",
        hasNew && "ring-2 ring-amber-400 animate-pulse",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted">
        <Bell size={14} className={hasNew ? "text-amber-500" : undefined} />
        Новые заявки
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-[28px] font-bold text-ink">{total}</span>
        {hasNew && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
            {newCount} новых
          </span>
        )}
      </div>
      <div className="mt-1 text-[12px] text-muted-2">
        {hasNew ? "Нажмите, чтобы открыть →" : "Все просмотрены"}
      </div>
    </button>
  );
}
