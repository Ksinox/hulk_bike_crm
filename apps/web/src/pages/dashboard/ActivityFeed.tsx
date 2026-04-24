import { useState } from "react";
import {
  Activity,
  Bike,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Maximize2,
  Package,
  Tag,
  User,
  UserCog,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "./KpiCard";
import {
  useActivityLog,
  useActivityPage,
  type ApiActivityItem,
} from "@/lib/api/activity";

const ENTITY_ICON: Record<string, typeof Bike> = {
  client: User,
  scooter: Bike,
  rental: Bike,
  payment: CreditCard,
  user: UserCog,
  model: Tag,
  equipment: Package,
  maintenance: Wrench,
};

const ENTITY_COLOR: Record<string, string> = {
  client: "bg-blue-50 text-blue-700",
  scooter: "bg-emerald-50 text-emerald-700",
  rental: "bg-indigo-50 text-indigo-700",
  payment: "bg-green-soft text-green-ink",
  user: "bg-purple-soft text-purple-ink",
  model: "bg-amber-100 text-amber-700",
  equipment: "bg-pink-50 text-pink-700",
  maintenance: "bg-orange-soft text-orange-ink",
};

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
        <div className="flex flex-col divide-y divide-border">
          {items.map((it) => (
            <Row key={it.id} it={it} />
          ))}
        </div>
      )}

      {openFull && <FullJournalModal onClose={() => setOpenFull(false)} />}
    </Card>
  );
}

function Row({ it }: { it: ApiActivityItem }) {
  const Icon = ENTITY_ICON[it.entity] ?? Activity;
  const cls = ENTITY_COLOR[it.entity] ?? "bg-surface-soft text-muted-2";
  const dt = new Date(it.createdAt);

  return (
    <div className="flex items-start gap-2.5 py-2">
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
          cls,
        )}
      >
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] text-ink">{it.summary}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted">
          <UserBadge name={it.userName} role={it.userRole} />
          <span>·</span>
          <span className="tabular-nums">{formatDateTime(dt)}</span>
          <span className="text-muted-2">({formatAgo(dt)})</span>
        </div>
      </div>
    </div>
  );
}

function UserBadge({ name, role }: { name: string; role: string | null }) {
  const cls =
    role === "creator"
      ? "bg-purple-soft text-purple-ink"
      : role === "director"
        ? "bg-blue-50 text-blue-700"
        : role === "admin"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-surface-soft text-muted-2";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold",
        cls,
      )}
    >
      {name}
    </span>
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
      onClick={onClose}
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
            <div className="flex flex-col divide-y divide-border">
              {items.map((it) => (
                <Row key={it.id} it={it} />
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

function formatDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatAgo(d: Date): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (diffSec < 60) return "только что";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60)
    return `${diffMin} ${plural(diffMin, ["минуту", "минуты", "минут"])} назад`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ${plural(diffH, ["час", "часа", "часов"])} назад`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD} ${plural(diffD, ["день", "дня", "дней"])} назад`;
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
