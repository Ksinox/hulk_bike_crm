import { useMemo, useState } from "react";
import { Bike, ChevronRight } from "lucide-react";
import { useRentals, useArchivedRentals } from "@/pages/rentals/rentalsStore";
import { RentalCard } from "@/pages/rentals/RentalCard";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { usePageFab } from "../fab";
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
  /** Открыта форма создания аренды (переиспользуем десктоп-модалку). */
  const [newOpen, setNewOpen] = useState(false);
  usePageFab("Аренда", () => setNewOpen(true));

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
          {filtered.map((r) => (
            <RentalRow
              key={r.id}
              rental={r}
              client={clientById.get(r.clientId) ?? null}
              todayMs={todayMs}
              onClick={() => setOpenId(r.id)}
            />
          ))}
        </div>
      )}

      {/* Тап по строке → «проваливаемся» в ПОЛНОЭКРАННУЮ карточку аренды.
          Переиспользуем десктопную RentalCard (drawerChrome): все блоки
          (клиент с фото, KPI, скутер+экипировка, календарь, финансы,
          хронология, документы, заметки) и вся логика (оплата, продление,
          замена, история) — внутри неё. Без onRequestPayment/onOpenHistory
          карточка ведёт эти диалоги сама. */}
      {openRental && (
        <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-surface">
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

    </div>
  );
}

function RentalRow({
  rental,
  client,
  todayMs,
  onClick,
}: {
  rental: Rental;
  client: ApiClient | null;
  todayMs: number;
  onClick: () => void;
}) {
  const meta = statusMeta(rental, todayMs);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card-sm active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
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
      <div className="text-right">
        <div className="text-[14px] font-bold tabular-nums text-ink">
          {rub(rental.sum)} ₽
        </div>
        <div className="text-[11px] text-muted-2">#{String(rental.id).padStart(4, "0")}</div>
      </div>
      <ChevronRight size={16} className="text-muted-2" />
    </button>
  );
}

