import { useMemo, useState } from "react";
import { Bike, Phone, ChevronRight, Wallet, Plus } from "lucide-react";
import { useRentals, useArchivedRentals } from "@/pages/rentals/rentalsStore";
import { PaymentAcceptDialog } from "@/pages/rentals/PaymentAcceptDialog";
import { NewRentalModal } from "@/pages/rentals/NewRentalModal";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { MobileFab } from "../ui";
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
  DetailRow,
  MobileChips,
  MobileEmpty,
  MobileSearch,
  MobileSheet,
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
  /** Аренда, по которой открыт приём оплаты (переиспользуем десктоп-диалог). */
  const [payId, setPayId] = useState<number | null>(null);
  /** Открыта форма создания аренды (переиспользуем десктоп-модалку). */
  const [newOpen, setNewOpen] = useState(false);

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
  const openClient = openRental ? clientById.get(openRental.clientId) ?? null : null;
  const payRental = payId != null ? source.find((r) => r.id === payId) ?? null : null;

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

      <MobileSheet
        open={openRental != null}
        onClose={() => setOpenId(null)}
        title={openClient?.name ?? "Аренда"}
      >
        {openRental && (
          <RentalDetail
            rental={openRental}
            client={openClient}
            todayMs={todayMs}
            onPay={() => setPayId(openRental.id)}
          />
        )}
      </MobileSheet>

      {/* Приём оплаты — переиспользуем десктоп-диалог (inline) в
          полноэкранной мобильной обёртке: логика денег та же самая. */}
      {payRental && (
        // Диалог оплаты сам рисует свою шапку с крестиком (inline-режим),
        // поэтому отдельный заголовок-обёртку не добавляем — иначе два
        // крестика подряд. Только полноэкранный контейнер + safe-area.
        <div className="fixed inset-0 z-[60] flex flex-col bg-bg p-2 pt-[max(8px,env(safe-area-inset-top))] pb-[max(8px,env(safe-area-inset-bottom))]">
          <ErrorBoundary key={payRental.id}>
            <PaymentAcceptDialog
              rental={payRental}
              inline
              onClose={() => setPayId(null)}
              onPaid={() => {
                setPayId(null);
                setOpenId(null);
              }}
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

      <MobileFab
        onClick={() => setNewOpen(true)}
        icon={<Plus size={20} strokeWidth={2.5} />}
        label="Аренда"
      />
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

function RentalDetail({
  rental,
  client,
  todayMs,
  onPay,
}: {
  rental: Rental;
  client: ApiClient | null;
  todayMs: number;
  onPay: () => void;
}) {
  const meta = statusMeta(rental, todayMs);
  // «Живая» аренда — есть смысл принимать оплату/продлевать.
  const isLive =
    rental.status === "active" ||
    rental.status === "overdue" ||
    rental.status === "returning";
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", meta.cls)}>
          {meta.label}
        </span>
        <span className="text-[12px] text-muted-2">
          Аренда #{String(rental.id).padStart(4, "0")}
        </span>
      </div>

      {client?.phone && (
        <a
          href={`tel:${client.phone}`}
          className="mb-3 flex items-center justify-center gap-2 rounded-2xl bg-blue-600 py-3 text-[14px] font-bold text-white active:scale-[0.99]"
        >
          <Phone size={17} /> Позвонить {client.phone}
        </a>
      )}

      <div className="rounded-2xl bg-surface px-3.5 shadow-card-sm">
        <DetailRow label="Скутер" value={`${rental.scooter}`} />
        <div className="border-t border-border" />
        <DetailRow label="Выдан" value={`${rental.start}${rental.startTime ? `, ${rental.startTime}` : ""}`} />
        <div className="border-t border-border" />
        <DetailRow label="Возврат план" value={rental.endPlanned} />
        <div className="border-t border-border" />
        <DetailRow label="Срок" value={`${rental.days} дн.`} />
        <div className="border-t border-border" />
        <DetailRow label="Тариф" value={`${rub(rental.rate)} ₽/${rental.rateUnit === "week" ? "нед" : "сут"}`} />
        <div className="border-t border-border" />
        <DetailRow label="Сумма" value={`${rub(rental.sum)} ₽`} valueClass="text-blue-700" />
        <div className="border-t border-border" />
        <DetailRow
          label="Залог"
          value={rental.depositItem ? rental.depositItem : `${rub(rental.deposit)} ₽`}
        />
        {rental.note && (
          <>
            <div className="border-t border-border" />
            <DetailRow label="Заметка" value={rental.note} />
          </>
        )}
      </div>

      {isLive ? (
        <>
          <button
            type="button"
            onClick={onPay}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-[15px] font-bold text-white active:scale-[0.99]"
          >
            <Wallet size={18} /> Принять оплату
          </button>
          <p className="mt-2 text-center text-[12px] text-muted-2">
            Возврат и замена скутера — на компьютере
          </p>
        </>
      ) : (
        <p className="mt-3 text-center text-[12px] text-muted-2">
          Аренда завершена
        </p>
      )}
    </div>
  );
}
