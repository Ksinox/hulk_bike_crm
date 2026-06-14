import { useMemo, useState } from "react";
import { Bike, ChevronRight, Maximize2 } from "lucide-react";
import { useRentals, useArchivedRentals } from "@/pages/rentals/rentalsStore";
import { RentalCard } from "@/pages/rentals/RentalCard";
import { useBillingPeriodRevenue } from "@/lib/useRevenue";
import { MobileRevenueScreen } from "./MobileRevenueScreen";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { usePageFab } from "../fab";
import { RowCallButton, useCallClient } from "../call";
import { useRentalStickers } from "@/lib/api/stickers";
import { MiniStickers } from "@/components/StickerStack";
import type { Rental } from "@/lib/mock/rentals";
import { useApiClients } from "@/lib/api/clients";
import type { ApiClient } from "@/lib/api/types";
import {
  matchId,
  matchPhone,
  matchScooterName,
  matchText,
  normalizeQuery,
} from "@/lib/search";
import { cn } from "@/lib/utils";
import {
  MobileChips,
  MobileEmpty,
  MobileSearch,
  type ChipOption,
} from "../ui";

type Filter = "active" | "overdue" | "return_today" | "completed";

/** Сегодня в формате DD.MM.YYYY (локальное время). */
function todayRu(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function ddmmyyyyToMs(s: string): number {
  const [d, m, y] = s.split(".").map(Number);
  if (!d || !m || !y) return NaN;
  return new Date(y, m - 1, d).getTime();
}

function isOverdue(r: Rental, todayMs: number): boolean {
  if (r.status === "overdue") return true;
  if (r.status !== "active") return false;
  const end = ddmmyyyyToMs(r.endPlanned);
  return !Number.isNaN(end) && end < todayMs;
}

/** Метка и тон статуса для пилюли. */
function statusMeta(
  r: Rental,
  todayMs: number,
): { label: string; cls: string } {
  if (isOverdue(r, todayMs))
    return { label: "Просрочка", cls: "bg-red-soft text-red-ink" };
  switch (r.status) {
    case "active":
      return { label: "Активна", cls: "bg-green-soft text-green-ink" };
    case "returning":
      return { label: "Возврат", cls: "bg-orange-soft text-orange-ink" };
    case "new_request":
      return { label: "Новая", cls: "bg-blue-50 text-blue-600" };
    case "meeting":
      return { label: "Встреча", cls: "bg-blue-50 text-blue-600" };
    case "problem":
    case "completed_damage":
      return { label: "Проблема", cls: "bg-red-soft text-red-ink" };
    case "police":
      return { label: "Полиция", cls: "bg-red-soft text-red-ink" };
    case "court":
      return { label: "Суд", cls: "bg-purple-soft text-purple-ink" };
    case "completed":
      return { label: "Завершена", cls: "bg-surface-soft text-muted" };
    case "cancelled":
      return { label: "Отменена", cls: "bg-surface-soft text-muted-2" };
    default:
      return { label: r.status, cls: "bg-surface-soft text-muted" };
  }
}

function rub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

export function MobileRentals() {
  const active = useRentals();
  const archived = useArchivedRentals();
  const { data: clients } = useApiClients();
  const clientById = useMemo(
    () => new Map((clients ?? []).map((c) => [c.id, c] as const)),
    [clients],
  );

  const [filter, setFilter] = useState<Filter>("active");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [revenueOpen, setRevenueOpen] = useState(false);
  const rev = useBillingPeriodRevenue("rentals");
  /** Открыта форма создания аренды (переиспользуем десктоп-модалку). */
  const [newOpen, setNewOpen] = useState(false);
  const { callClient, callSheet } = useCallClient();
  // Внутри карточки аренды (drill-in) кнопку «+ Аренда» прячем — она там лишняя.
  usePageFab("Аренда", () => setNewOpen(true), openId != null);

  const today = todayRu();
  const todayMs = ddmmyyyyToMs(today);

  const source = filter === "completed" ? archived : active;

  const counts = useMemo(() => {
    let act = 0;
    let over = 0;
    let ret = 0;
    for (const r of active) {
      const finished = r.status === "completed" || r.status === "cancelled";
      if (!finished) act++;
      if (isOverdue(r, todayMs)) over++;
      if (r.status === "returning" || (r.status === "active" && r.endPlanned === today))
        ret++;
    }
    return { act, over, ret };
  }, [active, today, todayMs]);

  const filtered = useMemo(() => {
    const matchStatus = (r: Rental): boolean => {
      const finished = r.status === "completed" || r.status === "cancelled";
      if (filter === "active") return !finished;
      if (filter === "overdue") return isOverdue(r, todayMs);
      if (filter === "return_today")
        return (
          r.status === "returning" ||
          (r.status === "active" && r.endPlanned === today)
        );
      if (filter === "completed") return true; // archived source
      return true;
    };
    const matchSearch = (r: Rental): boolean => {
      if (!search.trim()) return true;
      const q = normalizeQuery(search);
      const c = clientById.get(r.clientId);
      return (
        matchText(c?.name, q) ||
        matchPhone(c?.phone, q) ||
        matchScooterName(r.scooter, q) ||
        matchId(r.id, q)
      );
    };
    return source
      .filter((r) => matchStatus(r) && matchSearch(r))
      .sort((a, b) => b.id - a.id);
  }, [source, filter, search, clientById, today, todayMs]);

  const chips: ChipOption<Filter>[] = [
    { id: "active", label: "Активные", count: counts.act },
    { id: "overdue", label: "Просрочка", count: counts.over },
    { id: "return_today", label: "Сегодня", count: counts.ret },
    { id: "completed", label: "Архив" },
  ];

  const openRental = source.find((r) => r.id === openId) ?? null;

  return (
    // pb-20: нижний отступ, чтобы плавающая кнопка (FAB) не перекрывала
    // последнюю строку списка.
    <div className="flex flex-col gap-3 pb-20">
      {/* Выручка по арендам — тап открывает банковскую сводку. */}
      <button
        type="button"
        onClick={() => setRevenueOpen(true)}
        className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 p-4 text-left text-white shadow-card active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
            Выручка · аренды · {rev.period.label}
          </span>
          <Maximize2 size={15} className="text-white/70" />
        </div>
        <div className="mt-1 font-display text-[30px] font-extrabold leading-none tabular-nums">
          {rev.total.toLocaleString("ru-RU")} ₽
        </div>
        <div className="mt-1 text-[12px] text-white/70">
          нажмите для разбивки
        </div>
      </button>

      <MobileSearch
        value={search}
        onChange={setSearch}
        placeholder="Клиент, скутер, телефон, №…"
      />
      <MobileChips options={chips} value={filter} onChange={setFilter} />

      {filtered.length === 0 ? (
        <MobileEmpty
          icon={<Bike size={26} />}
          title="Аренд нет"
          hint={search ? "Ничего не нашлось по запросу" : "В этом фильтре пусто"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((r) => {
            const c = clientById.get(r.clientId) ?? null;
            return (
              <RentalRow
                key={r.id}
                rental={r}
                client={c}
                todayMs={todayMs}
                onClick={() => setOpenId(r.id)}
                onCall={() =>
                  callClient(c?.name ?? "Клиент", [c?.phone, c?.extraPhone])
                }
              />
            );
          })}
        </div>
      )}

      {/* Тап по строке → «проваливаемся» в ПОЛНОЭКРАННУЮ карточку аренды.
          Переиспользуем десктопную RentalCard (drawerChrome): все блоки
          (клиент с фото, KPI, скутер+экипировка, календарь, финансы,
          хронология, документы, заметки) и вся логика (оплата, продление,
          замена, история) — внутри неё. Без onRequestPayment/onOpenHistory
          карточка ведёт эти диалоги сама. */}
      {openRental && (
        <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface animate-slide-in-right">
          <ErrorBoundary key={openRental.id}>
            <RentalCard
              rental={openRental}
              drawerChrome
              onClose={() => setOpenId(null)}
              onSwapped={(newId) => setOpenId(newId)}
            />
          </ErrorBoundary>
        </div>
      )}

      {/* Новая аренда — десктоп-модалка (уже адаптивна: w-full max-w-780). */}
      {newOpen && (
        <NewRentalModal
          onClose={() => setNewOpen(false)}
          onCreated={(r) => {
            setNewOpen(false);
            setOpenId(r.id);
          }}
        />
      )}

      {revenueOpen && (
        <MobileRevenueScreen
          scope="rentals"
          onClose={() => setRevenueOpen(false)}
        />
      )}

      {/* Нижний лист выбора номера (если у клиента два телефона). */}
      {callSheet}
    </div>
  );
}

function RentalRow({
  rental,
  client,
  todayMs,
  onClick,
  onCall,
}: {
  rental: Rental;
  client: ApiClient | null;
  todayMs: number;
  onClick: () => void;
  onCall: () => void;
}) {
  const meta = statusMeta(rental, todayMs);
  const hasPhone = !!(client?.phone || client?.extraPhone);
  const stickers = useRentalStickers(rental.id);
  return (
    // Обёртка-div: внутри две кнопки (открыть карточку + позвонить).
    <div className="flex items-center gap-2 rounded-2xl bg-surface p-3 shadow-card-sm">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60"
      >
        <div className="min-w-0 flex-1">
          {/* Мини-стикеры цветами заметок аренды — над именем, у края строки. */}
          {stickers.length > 0 && (
            <MiniStickers stickers={stickers} className="mb-0.5" />
          )}
          <div className="flex items-center gap-2">
            <span className="truncate text-[14px] font-bold text-ink">
              {client?.name ?? "Без клиента"}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                meta.cls,
              )}
            >
              {meta.label}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted">
            {rental.scooter} · до {rental.endPlanned}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[14px] font-bold tabular-nums text-ink">
            {rub(rental.sum)} ₽
          </div>
          <div className="text-[11px] text-muted-2">
            #{String(rental.id).padStart(4, "0")}
          </div>
        </div>
      </button>
      {/* Звонок клиенту аренды; без телефона — шеврон «тап откроет карточку». */}
      {hasPhone ? (
        <RowCallButton onCall={onCall} />
      ) : (
        <ChevronRight size={16} className="shrink-0 text-muted-2" />
      )}
    </div>
  );
}

