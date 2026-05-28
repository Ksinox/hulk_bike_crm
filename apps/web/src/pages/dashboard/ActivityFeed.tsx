import { useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import {
  useActivityLog,
  useActivityPage,
  type ApiActivityItem,
} from "@/lib/api/activity";
import { ActivityEventRow } from "@/components/ActivityEventRow";
import { useDashboardDrawer } from "./DashboardDrawer";

const FEED_LIMIT = 5;

export function ActivityFeed({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  // Всегда тянем ровно столько, сколько показываем на дашборде (5).
  // Полный журнал — через модалку с пагинацией.
  const { data: items = [], isLoading } = useActivityLog(FEED_LIMIT);
  const [openFull, setOpenFull] = useState(false);

  return (
    <Card className={className}>
      <div className="mb-2.5 flex items-center justify-between">
        <h3
          className={
            compact ? "m-0 text-base font-bold" : "m-0 text-base font-bold tracking-[-0.005em]"
          }
        >
          Последние действия
        </h3>
        <div className="flex items-center gap-2">
          {items.length > 0 && (
            <span className="hidden rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-2 sm:inline">
              обновляется каждые 30 с
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpenFull(true)}
            className="inline-flex items-center gap-1.5 rounded-[10px] bg-surface-soft px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
          >
            <Maximize2 size={12} /> Весь журнал
          </button>
        </div>
      </div>

      {isLoading && items.length === 0 ? (
        <div className="py-8 text-center text-muted text-[13px]">Загрузка…</div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2.5 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-soft text-muted-2">
            <Activity size={22} />
          </div>
          <div className="text-[13px] text-muted max-w-[260px]">
            Пока никаких действий не зафиксировано. Они появятся здесь, как только кто-то начнёт работать в системе.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {items.map((it) => (
            <FeedRow key={it.id} it={it} />
          ))}
        </div>
      )}

      {openFull && <FullJournalModal onClose={() => setOpenFull(false)} />}
    </Card>
  );
}

/**
 * v0.7.15: строка ленты на дашборде — общий <ActivityEventRow compact>
 * (единый визуальный язык «было → стало» с иконками). Клик открывает
 * связанную сущность в drawer-стеке.
 */
function FeedRow({ it }: { it: ApiActivityItem }) {
  const drawer = useDashboardDrawer();
  const clickable =
    it.entityId != null &&
    (it.entity === "rental" ||
      it.entity === "scooter" ||
      it.entity === "client");
  const handleClick = () => {
    if (it.entityId == null) return;
    if (it.entity === "rental") drawer.openRental(it.entityId);
    else if (it.entity === "scooter") drawer.openScooter(it.entityId);
    else if (it.entity === "client") drawer.openClient(it.entityId);
  };
  return (
    <ActivityEventRow
      item={it}
      compact
      clickable={clickable}
      onOpen={handleClick}
    />
  );
}

/* ================= Модалка «Весь журнал» с пагинацией ================= */

const PAGE_SIZE = 25;

function FullJournalModal({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const { data, isLoading, isFetching } = useActivityPage(
    PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div
      className="fixed inset-0 z-[140] flex items-start justify-center overflow-y-auto bg-ink/55 p-6 backdrop-blur-sm"
    >
      <div
        className="mt-10 flex w-full max-w-[760px] flex-col overflow-hidden rounded-2xl bg-surface shadow-card-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Журнал действий
            </div>
            <div className="text-[15px] font-bold text-ink">
              Всего записей: <span className="tabular-nums">{total}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-3">
          {isLoading && items.length === 0 ? (
            <div className="py-8 text-center text-muted text-[13px]">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="py-8 text-center text-muted text-[13px]">
              Журнал пуст
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {items.map((it) => (
                <FeedRow key={it.id} it={it} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <div className="text-[11px] text-muted-2">
            Стр. {page + 1} из {totalPages}
            {isFetching && items.length > 0 && (
              <span className="ml-2 text-muted">обновление…</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold",
                page === 0
                  ? "cursor-not-allowed bg-surface text-muted-2"
                  : "bg-surface text-ink hover:bg-border",
              )}
            >
              <ChevronLeft size={13} /> Назад
            </button>
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-semibold",
                page + 1 >= totalPages
                  ? "cursor-not-allowed bg-surface text-muted-2"
                  : "bg-ink text-white hover:bg-blue-600",
              )}
            >
              Вперёд <ChevronRight size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

