/**
 * HistoryStrip — компактная правая колонка с последними событиями аренды
 * (~16 строк со скроллом). По клику «Открыть всё» — выезжает SideDrawer
 * с полной ActivityTimelineSection (фильтры, поиск, diff payload).
 */
import { ArrowRight, Clock, History } from "lucide-react";
import type { ApiActivityItem } from "@/lib/api/activity";

export function HistoryStrip({
  items,
  loading,
  onExpand,
}: {
  items: ApiActivityItem[];
  loading?: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="rounded-2xl bg-surface border border-border shadow-card-sm flex flex-col overflow-hidden">
      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-border">
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-muted-2 inline-flex items-center gap-1.5">
            <History size={11} /> История
          </div>
          <div className="text-[11px] text-muted">последние события</div>
        </div>
        <button
          type="button"
          onClick={onExpand}
          className="inline-flex items-center gap-1 rounded-full bg-surface-soft hover:bg-ink hover:text-white px-2.5 py-1 text-[11px] font-bold text-ink-2 shrink-0"
        >
          Открыть всё <ArrowRight size={11} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto max-h-[420px]">
        {loading ? (
          <div className="px-4 py-6 text-[12px] text-muted">Загружаем…</div>
        ) : items.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-muted">
            Событий ещё нет. Они появятся автоматически по мере работы с
            арендой.
          </div>
        ) : (
          <div className="px-3 py-2 flex flex-col gap-1.5">
            {items.slice(0, 16).map((it) => (
              <HistoryStripRow key={it.id} item={it} />
            ))}
            {items.length > 16 && (
              <button
                type="button"
                onClick={onExpand}
                className="mt-1 py-2 text-[11px] font-bold text-blue-700 hover:underline"
              >
                Показать все {items.length} событий →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HistoryStripRow({ item }: { item: ApiActivityItem }) {
  const dot = actionDot(item.action);
  return (
    <div className="flex items-start gap-2.5 px-1.5 py-1.5 rounded-[10px] hover:bg-surface-soft">
      <span
        className={`h-2 w-2 mt-1.5 rounded-full shrink-0 ${dot}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="text-[11.5px] font-semibold text-ink leading-tight">
          {item.summary}
        </div>
        <div className="text-[10px] text-muted-2 tabular-nums inline-flex items-center gap-1 mt-0.5">
          <Clock size={9} />
          {new Date(item.createdAt).toLocaleString("ru-RU", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {item.userName && item.userName !== "система" && (
            <>
              <span className="opacity-40">·</span>
              <span>{item.userName}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function actionDot(action: string): string {
  if (
    action.includes("created") ||
    action.includes("activate") ||
    action === "extended"
  ) {
    return "bg-blue-500";
  }
  if (action.includes("forgiv") || action.includes("paid")) {
    return "bg-green-500";
  }
  if (
    action.includes("debt") ||
    action.includes("damage") ||
    action.includes("overdue")
  ) {
    return "bg-red-500";
  }
  if (action.includes("archived") || action.includes("deleted")) {
    return "bg-muted-2";
  }
  return "bg-amber-500";
}
