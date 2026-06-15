import { useEffect, useMemo, useState } from "react";
import { Users, ChevronRight, Ban } from "lucide-react";
import { consumePending, onNavigate } from "@/app/navigationStore";
import { MobileNewClient } from "../forms/MobileNewClient";
import { MobileClientCard } from "../cards/MobileClientCard";
import { usePageFab } from "../fab";
import { RowCallButton, useCallClient } from "../call";
import { useAllClients } from "@/pages/clients/clientStore";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import type { Client } from "@/lib/mock/clients";
import { matchId, matchPhone, matchText, normalizeQuery } from "@/lib/search";
import { cn } from "@/lib/utils";
import {
  MobileChips,
  MobileEmpty,
  MobileSearch,
  type ChipOption,
} from "../ui";

type Filter = "all" | "active" | "debt" | "black";

function rub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}

export function MobileClients() {
  const clients = useAllClients();
  const rentals = useRentals();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const { callClient, callSheet } = useCallClient();
  // Внутри карточки клиента (drill-in) кнопку «+ Клиент» прячем.
  usePageFab("Клиент", () => setNewOpen(true), openId != null);

  // navigate({route:"clients", clientId}) — открыть конкретного клиента
  // (напр. тап по «висящему долгу» F4 на дашборде). Покрываем оба случая:
  // вкладка уже открыта (onNavigate) и только что смонтирована (consumePending).
  useEffect(() => {
    const p = consumePending("clients");
    if (p?.clientId != null) setOpenId(p.clientId);
    return onNavigate((req) => {
      if (req.route === "clients" && req.clientId != null) {
        setOpenId(req.clientId);
      }
    });
  }, []);

  const activeSet = useMemo(() => {
    const set = new Set<number>();
    for (const r of rentals) {
      if (r.status === "active" || r.status === "overdue" || r.status === "returning")
        set.add(r.clientId);
    }
    return set;
  }, [rentals]);

  const counts = useMemo(() => {
    let active = 0;
    let debt = 0;
    let black = 0;
    for (const c of clients) {
      if (activeSet.has(c.id) && !c.blacklisted) active++;
      if (c.debt > 0) debt++;
      if (c.blacklisted) black++;
    }
    return { active, debt, black };
  }, [clients, activeSet]);

  const filtered = useMemo(() => {
    const matchStatus = (c: Client): boolean => {
      if (filter === "active") return activeSet.has(c.id) && !c.blacklisted;
      if (filter === "debt") return c.debt > 0;
      if (filter === "black") return !!c.blacklisted;
      return true;
    };
    const matchSearch = (c: Client): boolean => {
      if (!search.trim()) return true;
      const q = normalizeQuery(search);
      return matchText(c.name, q) || matchPhone(c.phone, q) || matchId(c.id, q);
    };
    return clients
      .filter((c) => matchStatus(c) && matchSearch(c))
      .sort((a, b) => a.name.localeCompare(b.name, "ru"));
  }, [clients, filter, search, activeSet]);

  const chips: ChipOption<Filter>[] = [
    { id: "all", label: "Все", count: clients.length },
    { id: "active", label: "Катают", count: counts.active },
    { id: "debt", label: "Долг", count: counts.debt },
    { id: "black", label: "ЧС", count: counts.black },
  ];

  const openClient = clients.find((c) => c.id === openId) ?? null;

  return (
    // pb-20: чтобы FAB «+ Клиент» не перекрывал последнюю строку списка.
    <div className="flex flex-col gap-3 pb-20">
      <MobileSearch
        value={search}
        onChange={setSearch}
        placeholder="Имя, телефон, №…"
      />
      <MobileChips options={chips} value={filter} onChange={setFilter} />

      {filtered.length === 0 ? (
        <MobileEmpty
          icon={<Users size={26} />}
          title="Клиентов нет"
          hint={search ? "Ничего не нашлось" : "В этом фильтре пусто"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((c) => (
            <ClientRow
              key={c.id}
              client={c}
              active={activeSet.has(c.id)}
              onClick={() => setOpenId(c.id)}
              onCall={() => callClient(c.name, [c.phone, c.extraPhone])}
            />
          ))}
        </div>
      )}

      {/* Тап по клиенту → полноэкранная мобильная карточка (нативный экран,
          не переиспользование десктопа). */}
      {openClient && (
        <ErrorBoundary key={openClient.id}>
          <MobileClientCard client={openClient} onBack={() => setOpenId(null)} />
        </ErrorBoundary>
      )}

      {newOpen && (
        <MobileNewClient
          onClose={() => setNewOpen(false)}
          onCreated={(c) => setOpenId(c.id)}
        />
      )}

      {/* Нижний лист выбора номера (если у клиента два телефона). */}
      {callSheet}
    </div>
  );
}

function ClientRow({
  client,
  active,
  onClick,
  onCall,
}: {
  client: Client;
  active: boolean;
  onClick: () => void;
  onCall: () => void;
}) {
  const initials = client.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  const hasPhone = !!(client.phone || client.extraPhone);
  return (
    // Строка-обёртка — div, а не button: внутри живут ДВЕ кнопки (открыть
    // карточку + позвонить), вложенные button'ы недопустимы.
    <div className="flex items-center gap-2 rounded-2xl bg-surface p-3 shadow-card-sm">
      <button
        type="button"
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left active:opacity-60"
      >
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
            client.blacklisted
              ? "bg-red-soft text-red-ink"
              : "bg-blue-50 text-blue-600",
          )}
        >
          {initials || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-bold text-ink">
              {client.name}
            </span>
            {client.blacklisted && (
              <Ban size={13} className="shrink-0 text-red" />
            )}
            {active && !client.blacklisted && (
              <span className="h-2 w-2 shrink-0 rounded-full bg-green" />
            )}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-muted">
            {client.phone}
          </div>
        </div>
        {client.debt > 0 && (
          <div className="shrink-0 text-right text-[13px] font-bold tabular-nums text-red">
            {rub(client.debt)} ₽
          </div>
        )}
      </button>
      {/* Звонок — основное быстрое действие; если телефона нет, оставляем
          шеврон как намёк «тап откроет карточку». */}
      {hasPhone ? (
        <RowCallButton onCall={onCall} />
      ) : (
        <ChevronRight size={16} className="shrink-0 text-muted-2" />
      )}
    </div>
  );
}

