import { useMemo, useState } from "react";
import { Users, ChevronRight, ChevronLeft, Ban } from "lucide-react";
import { MobileNewClient } from "../forms/MobileNewClient";
import { usePageFab } from "../fab";
import { useAllClients } from "@/pages/clients/clientStore";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { ClientCard } from "@/pages/clients/ClientCard";
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
  usePageFab("Клиент", () => setNewOpen(true));

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
            />
          ))}
        </div>
      )}

      {/* Тап по клиенту → полноэкранная карточка (десктопная ClientCard:
          аренды, долговая история, лента событий, рассрочки, документы). */}
      {openClient && (
        <div className="fixed inset-0 z-[55] flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-bg">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)]">
            <button
              type="button"
              onClick={() => setOpenId(null)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted active:bg-surface-soft"
              aria-label="Назад"
            >
              <ChevronLeft size={24} />
            </button>
            <h1 className="truncate font-display text-[17px] font-bold text-ink">
              {openClient.name}
            </h1>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-3">
            <ErrorBoundary key={openClient.id}>
              <ClientCard client={openClient} />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {newOpen && (
        <MobileNewClient
          onClose={() => setNewOpen(false)}
          onCreated={(c) => setOpenId(c.id)}
        />
      )}
    </div>
  );
}

function ClientRow({
  client,
  active,
  onClick,
}: {
  client: Client;
  active: boolean;
  onClick: () => void;
}) {
  const initials = client.name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left shadow-card-sm active:scale-[0.99]"
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
          {client.blacklisted && <Ban size={13} className="shrink-0 text-red" />}
          {active && !client.blacklisted && (
            <span className="h-2 w-2 shrink-0 rounded-full bg-green" />
          )}
        </div>
        <div className="mt-0.5 truncate text-[12px] text-muted">{client.phone}</div>
      </div>
      {client.debt > 0 && (
        <div className="text-right text-[13px] font-bold tabular-nums text-red">
          {rub(client.debt)} ₽
        </div>
      )}
      <ChevronRight size={16} className="text-muted-2" />
    </button>
  );
}

