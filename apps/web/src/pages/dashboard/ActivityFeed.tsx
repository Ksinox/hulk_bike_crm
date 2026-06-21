import { Fragment, useMemo, useState } from "react";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
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
import { useDebtorsList } from "@/lib/api/debtors";
import { DateRangePicker } from "@/components/ui/date-picker";

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
  // Должники (открытые + закрытые) — чтобы события дел резолвили клиента «с кем».
  const { data: debtorsOpen } = useDebtorsList();
  const { data: debtorsClosed } = useDebtorsList({ closed: true });
  return useMemo(() => {
    const rentalById = new Map(
      [...active, ...archived].map((r) => [r.id, r] as const),
    );
    const clientById = new Map(clients.map((c) => [c.id, c] as const));
    const debtorById = new Map(
      [...(debtorsOpen?.items ?? []), ...(debtorsClosed?.items ?? [])].map(
        (d) => [d.id, d] as const,
      ),
    );
    const pad = (n: number) => `#${String(n).padStart(4, "0")}`;
    const forClient = (clientId: number): ActivityContextParts | undefined => {
      const c = clientById.get(clientId);
      return c ? { client: { id: c.id, name: c.name } } : undefined;
    };
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
      // Акт ущерба: номер аренды берём из summary «Аренда #NNNN: …».
      // (\S*, а НЕ \w*: \w в JS-регексе НЕ матчит кириллицу, из-за чего
      //  «Аренда» не парсилась и контекст «с кем/по какой аренде» был пуст.)
      if (item.entity === "damage_report") {
        const m = /аренд\S*\s*#?\s*0*(\d+)/i.exec(item.summary || "");
        if (m) return forRental(Number(m[1]));
      }
      // Дело-должник → клиент (имя «с кем»). entityId = id дела.
      if (item.entity === "debtor" && item.entityId != null) {
        const d = debtorById.get(item.entityId);
        if (d?.clientId != null) return forClient(d.clientId);
      }
      if (item.entity === "client" && item.entityId != null)
        return forClient(item.entityId);
      return undefined;
    };
  }, [active, archived, clients, debtorsOpen, debtorsClosed]);
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

/** Категории фильтра — ключи совпадают с бэком (activity.ts categoryCondition). */
const JOURNAL_CATEGORIES: { key: string; label: string }[] = [
  { key: "", label: "Все" },
  { key: "created", label: "Создание" },
  { key: "payment", label: "Платежи" },
  { key: "extend", label: "Продления" },
  { key: "swap", label: "Замена скутера" },
  { key: "equipment", label: "Экипировка" },
  { key: "damage", label: "Ущерб и долги" },
  { key: "complete", label: "Завершение" },
  { key: "rollback", label: "Откаты" },
];

/** Роли-исполнители для фильтра «кто сделал». Ключи = activity_log.user_role. */
const JOURNAL_ROLES: { key: string; label: string }[] = [
  { key: "", label: "Все" },
  { key: "director", label: "Директор" },
  { key: "admin", label: "Администратор" },
  { key: "creator", label: "Создатель" },
];

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;

/** Номера страниц с многоточиями для постраничной пагинации: 1 … 4 5 6 … 19.
 *  current/total — 1-based. */
function pageList(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  if (current > 4) out.push("…");
  for (
    let i = Math.max(2, current - 1);
    i <= Math.min(total - 1, current + 1);
    i++
  )
    out.push(i);
  if (current < total - 3) out.push("…");
  out.push(total);
  return out;
}

function FullJournalModal({
  compact,
  onClose,
}: {
  compact?: boolean;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [category, setCategory] = useState("");
  const [role, setRole] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const hasFilter = !!(from || to || category || role);

  const { data, isLoading, isFetching } = useActivityPage(
    PAGE_SIZE,
    page * PAGE_SIZE,
    {
      from: from || undefined,
      to: to || undefined,
      category: category || undefined,
      role: role || undefined,
    },
  );
  const total = data?.total ?? 0;
  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resolveContext = useActivityContext();

  const applyPreset = (days: number) => {
    const now = new Date();
    const start = new Date();
    start.setDate(now.getDate() - days);
    setFrom(toISODate(start));
    setTo(toISODate(now));
    setPage(0);
  };
  const resetFilters = () => {
    setFrom("");
    setTo("");
    setCategory("");
    setRole("");
    setPage(0);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[140] flex overflow-y-auto bg-ink/55 backdrop-blur-sm",
        fullscreen
          ? "p-0"
          : "items-stretch justify-center p-0 sm:items-start sm:p-6",
      )}
    >
      <div
        className={cn(
          "flex w-full flex-col overflow-hidden bg-surface shadow-card-lg",
          fullscreen
            ? "h-screen rounded-none"
            : "min-h-[100dvh] rounded-none sm:mt-10 sm:min-h-0 sm:max-w-[820px] sm:rounded-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border bg-surface-soft px-5 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-2">
              Журнал действий
            </div>
            <div className="text-[15px] font-bold text-ink">
              {hasFilter ? "Найдено" : "Всего записей"}:{" "}
              <span className="tabular-nums">{total}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setFullscreen((v) => !v)}
              className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink sm:flex"
              title={fullscreen ? "Свернуть в окно" : "Открыть на весь экран"}
            >
              {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-2 hover:bg-white hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* #журнал: фильтры — по типу действия (чипы) и по датам (период + пресеты).
            Фильтрация серверная (до пагинации), смена фильтра сбрасывает на 1-ю стр. */}
        <div className="flex flex-col gap-2.5 border-b border-border px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {JOURNAL_CATEGORIES.map((c) => (
              <button
                key={c.key || "all"}
                type="button"
                onClick={() => {
                  setCategory(c.key);
                  setPage(0);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                  category === c.key
                    ? "bg-ink text-white"
                    : "bg-surface-soft text-ink-2 hover:bg-border",
                )}
              >
                {c.label}
              </button>
            ))}
          </div>
          {/* #журнал: фильтр по исполнителю (роли). */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[12px] font-medium text-muted-2">
              Исполнитель:
            </span>
            {JOURNAL_ROLES.map((rl) => (
              <button
                key={rl.key || "all"}
                type="button"
                onClick={() => {
                  setRole(rl.key);
                  setPage(0);
                }}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                  role === rl.key
                    ? "bg-blue-600 text-white"
                    : "bg-surface-soft text-ink-2 hover:bg-border",
                )}
              >
                {rl.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <span className="font-medium text-muted-2">Период:</span>
            <DateRangePicker
              from={from || null}
              to={to || null}
              onChange={(next) => {
                setFrom(next.from ?? "");
                setTo(next.to ?? "");
                setPage(0);
              }}
              className="w-[220px]"
            />
            <span className="mx-1 h-4 w-px bg-border" />
            {[
              { label: "Сегодня", days: 0 },
              { label: "7 дней", days: 7 },
              { label: "30 дней", days: 30 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.days)}
                className="rounded-full bg-surface-soft px-2.5 py-1 font-semibold text-ink-2 transition-colors hover:bg-border"
              >
                {p.label}
              </button>
            ))}
            {hasFilter && (
              <button
                type="button"
                onClick={resetFilters}
                className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-blue-700 hover:bg-blue-50"
              >
                <X size={12} /> Сбросить
              </button>
            )}
          </div>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto px-5 py-3",
            !fullscreen && "max-h-[64vh]",
          )}
        >
          {isLoading && items.length === 0 ? (
            <div className="py-8 text-center text-muted text-[13px]">Загрузка…</div>
          ) : items.length === 0 ? (
            <div className="py-10 text-center text-muted text-[13px]">
              {hasFilter
                ? "Ничего не найдено по выбранному фильтру"
                : "Журнал пуст"}
            </div>
          ) : (
            <FeedList
              items={items}
              resolveContext={resolveContext}
              compact={compact}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-surface-soft px-5 py-3">
          <div className="text-[11px] text-muted-2">
            {total > 0 && (
              <span className="tabular-nums">
                {page * PAGE_SIZE + 1}–{Math.min(total, (page + 1) * PAGE_SIZE)}{" "}
                из {total}
              </span>
            )}
            {isFetching && items.length > 0 && (
              <span className="ml-2 text-muted">обновление…</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg",
                page === 0
                  ? "cursor-not-allowed text-muted-2"
                  : "text-ink hover:bg-border",
              )}
              title="Предыдущая страница"
            >
              <ChevronLeft size={15} />
            </button>
            {pageList(page + 1, totalPages).map((p, i) =>
              p === "…" ? (
                <span key={`e${i}`} className="px-1 text-[12px] text-muted-2">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p - 1)}
                  className={cn(
                    "flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[12px] font-semibold tabular-nums transition-colors",
                    p - 1 === page
                      ? "bg-ink text-white"
                      : "text-ink-2 hover:bg-border",
                  )}
                >
                  {p}
                </button>
              ),
            )}
            <button
              type="button"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-lg",
                page + 1 >= totalPages
                  ? "cursor-not-allowed text-muted-2"
                  : "text-ink hover:bg-border",
              )}
              title="Следующая страница"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

