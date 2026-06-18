import { Fragment, useMemo, useState } from "react";
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
import {
  ActivityEventRow,
  type ActivityContextParts,
} from "@/components/ActivityEventRow";
import { useDashboardDrawer } from "./DashboardDrawer";
import { useRentals, useArchivedRentals } from "@/pages/rentals/rentalsStore";
import { useApiClients } from "@/lib/api/clients";

const FEED_LIMIT = 5;

/**
 * #20: резолвер контекста события — структурированный «Клиент · Скутер · #аренды»
 * (каждая часть кликабельна в feed-режиме). Берёт уже закэшированные аренды
 * (активные+архивные) и клиентов — доп. запросов не делает. Большинство событий
 * имеют entity='rental' + entityId=id аренды; у акта ущерба номер аренды парсим
 * из summary.
 */
function useActivityContext() {
  const active = useRentals();
  const archived = useArchivedRentals();
  const { data: clients = [] } = useApiClients();
  return useMemo(() => {
    const rentalById = new Map(
      [...active, ...archived].map((r) => [r.id, r] as const),
    );
    const clientById = new Map(clients.map((c) => [c.id, c] as const));
    const pad = (n: number) => `#${String(n).padStart(4, "0")}`;
    const forRental = (rentalId: number): ActivityContextParts | undefined => {
      const r = rentalById.get(rentalId);
      if (!r) return undefined;
      const c = clientById.get(r.clientId);
      const parts: ActivityContextParts = {
        rental: { id: rentalId, label: pad(rentalId) },
      };
      if (c) parts.client = { id: c.id, name: c.name };
      if (r.scooter) parts.scooter = { id: r.scooterId ?? 0, label: r.scooter };
      return parts;
    };
    return (item: ApiActivityItem): ActivityContextParts | undefined => {
      if (item.entity === "rental" && item.entityId != null)
        return forRental(item.entityId);
      if (item.entity === "damage_report") {
        const m = /аренд\w*\s+#?0*(\d+)/i.exec(item.summary || "");
        if (m) return forRental(Number(m[1]));
      }
      if (item.entity === "client" && item.entityId != null) {
        const c = clientById.get(item.entityId);
        if (c) return { client: { id: c.id, name: c.name } };
      }
      return undefined;
    };
  }, [active, archived, clients]);
}

/** #20: плоская строка контекста для compact-ленты (мобила/классика). */
function partsToString(p?: ActivityContextParts): string | undefined {
  if (!p) return undefined;
  const s = [p.client?.name, p.scooter?.label, p.rental?.label]
    .filter(Boolean)
    .join(" · ");
  return s || undefined;
}

/** #20: метка дня для разделителя ленты — «Сегодня» / «Вчера» / «12 июня». */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) return "Сегодня";
  if (diffDays === 1) return "Вчера";
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
}

function DayDivider({ label, date }: { label: string; date: string }) {
  const showDate = label === "Сегодня" || label === "Вчера";
  const dateStr = new Date(date).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
  });
  return (
    <div className="flex items-baseline gap-2 px-2.5 pb-1 pt-3 first:pt-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-blue-700">
        {label}
      </span>
      {showDate && (
        <span className="text-[11px] text-muted-2">{dateStr}</span>
      )}
    </div>
  );
}

/** #20: лента с разделителями по дням. compact=true — мобила/классика. */
function FeedList({
  items,
  resolveContext,
  compact,
  maxExtras,
}: {
  items: ApiActivityItem[];
  resolveContext: (item: ApiActivityItem) => ActivityContextParts | undefined;
  compact?: boolean;
  maxExtras?: number;
}) {
  let lastDay = "";
  return (
    <div className="flex flex-col">
      {items.map((it) => {
        const dl = dayLabel(it.createdAt);
        const showDivider = dl !== lastDay;
        lastDay = dl;
        return (
          <Fragment key={it.id}>
            {showDivider && <DayDivider label={dl} date={it.createdAt} />}
            <FeedRow
              it={it}
              parts={resolveContext(it)}
              compact={compact}
              maxExtras={maxExtras}
            />
          </Fragment>
        );
      })}
    </div>
  );
}

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
  const resolveContext = useActivityContext();

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
        <FeedList
          items={items}
          resolveContext={resolveContext}
          compact={compact}
          maxExtras={3}
        />
      )}

      {openFull && (
        <FullJournalModal
          compact={compact}
          onClose={() => setOpenFull(false)}
        />
      )}
    </Card>
  );
}

/**
 * #20: строка ленты. compact (мобила/классика) — плотный <ActivityEventRow compact>,
 * клик по всей строке открывает связанную сущность. Иначе (десктоп «Последние
 * действия») — просторный feed-режим (вариант B): кликабельные клиент/скутер/аренда
 * по отдельности + сумма/время справа.
 */
function FeedRow({
  it,
  parts,
  compact,
  maxExtras,
}: {
  it: ApiActivityItem;
  parts?: ActivityContextParts;
  compact?: boolean;
  maxExtras?: number;
}) {
  const drawer = useDashboardDrawer();
  if (compact) {
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
        context={partsToString(parts)}
      />
    );
  }
  return (
    <ActivityEventRow
      item={it}
      feed
      contextParts={parts}
      maxExtras={maxExtras}
      onOpenClient={drawer.openClient}
      onOpenScooter={drawer.openScooter}
      onOpenRental={drawer.openRental}
    />
  );
}

/* ================= Модалка «Весь журнал» с пагинацией ================= */

const PAGE_SIZE = 25;

function FullJournalModal({
  compact,
  onClose,
}: {
  compact?: boolean;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const { data, isLoading, isFetching } = useActivityPage(
    PAGE_SIZE,
    page * PAGE_SIZE,
  );
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resolveContext = useActivityContext();

  return (
    <div
      className="fixed inset-0 z-[140] flex items-stretch justify-center overflow-y-auto bg-ink/55 p-0 backdrop-blur-sm sm:items-start sm:p-6"
    >
      <div
        className="flex min-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-surface shadow-card-lg sm:mt-10 sm:min-h-0 sm:max-w-[760px] sm:rounded-2xl"
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
            <FeedList
              items={items}
              resolveContext={resolveContext}
              compact={compact}
            />
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

