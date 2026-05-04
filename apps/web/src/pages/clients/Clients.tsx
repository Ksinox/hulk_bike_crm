import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { type Client } from "@/lib/mock/clients";
import {
  consumePending,
  navigate,
  type BackTarget,
} from "@/app/navigationStore";
import {
  ClientsFilters,
  type FiltersState,
} from "./ClientsFilters";
import { ClientsList } from "./ClientsList";
import { AddClientModal } from "./AddClientModal";
import {
  DashboardDrawerProvider,
  useDashboardDrawer,
} from "@/pages/dashboard/DashboardDrawer";
import { ShareApplicationButton } from "./ShareApplicationButton";
import { ApplicationsBlock } from "./ApplicationsBlock";
import { useAllClients, useUnreachableSet } from "./clientStore";
import { useRentals } from "@/pages/rentals/rentalsStore";
import {
  matchId,
  matchPhone as matchPhoneQ,
  matchText,
  normalizeQuery,
} from "@/lib/search";

function matchClient(
  c: Client,
  f: FiltersState,
  activeSet: Set<number>,
  overdueSet: Set<number>,
  unreachable: Set<number>,
): boolean {
  if (f.search.trim()) {
    const query = normalizeQuery(f.search);
    const ok =
      matchText(c.name, query) ||
      matchPhoneQ(c.phone, query) ||
      matchId(c.id, query);
    if (!ok) return false;
  }
  const hasActive = activeSet.has(c.id);
  if (f.status === "active") {
    // показываем только тех, кто прямо сейчас катает и не в ЧС
    if (!hasActive || c.blacklisted) return false;
  }
  if (f.status === "inactive") {
    // без аренды, без долгов, не в ЧС
    if (hasActive || c.debt > 0 || c.blacklisted) return false;
  }
  if (f.status === "debt" && c.debt === 0) return false;
  if (f.status === "issue") {
    const isIssue =
      unreachable.has(c.id) ||
      overdueSet.has(c.id) ||
      c.debt > 0 ||
      c.blacklisted;
    if (!isIssue) return false;
  }
  if (f.status === "black" && !c.blacklisted) return false;
  return true;
}

// v0.3.3: страница клиентов теперь работает через drawer-паттерн.
// Список занимает всю ширину; клик по строке открывает drawer справа
// с полной ClientCard. DashboardDrawerProvider тот же что и на дашборде —
// shared контекст, поэтому stacking (открыть клиента → провалиться в
// аренду) работает консистентно.
export function Clients() {
  return (
    <DashboardDrawerProvider>
      <ClientsInner />
    </DashboardDrawerProvider>
  );
}

function ClientsInner() {
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: "all",
  });
  const clients = useAllClients();
  const rentals = useRentals();
  const unreachable = useUnreachableSet();
  const activeSet = useMemo(() => {
    const set = new Set<number>();
    for (const r of rentals) {
      if (
        r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning"
      ) {
        set.add(r.clientId);
      }
    }
    return set;
  }, [rentals]);
  const overdueSet = useMemo(() => {
    const set = new Set<number>();
    for (const r of rentals) {
      if (
        r.status === "overdue" ||
        r.status === "police" ||
        r.status === "court" ||
        r.status === "completed_damage" ||
        (r.damageAmount ?? 0) > 0
      ) {
        set.add(r.clientId);
      }
    }
    return set;
  }, [rentals]);
  const drawer = useDashboardDrawer();
  const [addOpen, setAddOpen] = useState(false);
  const [backTo, setBackTo] = useState<BackTarget | null>(null);

  // Pending-навигация (например, переход «к клиенту X» из аренды) теперь
  // открывает клиента в drawer'е вместо переключения «выбран в списке».
  useEffect(() => {
    const p = consumePending("clients");
    if (p?.clientId) drawer.openClient(p.clientId);
    if (p?.from) setBackTo(p.from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () =>
      clients
        .filter((c) =>
          matchClient(c, filters, activeSet, overdueSet, unreachable),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [clients, filters, activeSet, overdueSet, unreachable],
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      {backTo?.route === "rentals" && (
        <button
          type="button"
          onClick={() => {
            navigate({ route: "rentals", rentalId: backTo.rentalId });
            setBackTo(null);
          }}
          className="inline-flex w-fit items-center gap-1.5 rounded-full bg-surface-soft px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-border hover:text-ink"
        >
          <ArrowLeft size={13} /> к аренде
          {backTo.rentalId
            ? ` #${String(backTo.rentalId).padStart(4, "0")}`
            : ""}
        </button>
      )}

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
            Клиенты
          </h1>
          <span className="rounded-full bg-surface-soft px-3 py-1 text-[13px] font-semibold text-muted">
            {clients.length} клиентов
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ShareApplicationButton />
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-2"
          >
            <Plus size={16} />
            Добавить клиента
          </button>
        </div>
      </header>

      <ApplicationsBlock />

      <ClientsFilters value={filters} onChange={setFilters} />

      {/* Список во всю ширину. Клик по строке открывает drawer справа
          с полной ClientCard — оператор не теряет контекст списка. */}
      <ClientsList
        items={filtered}
        selectedId={null}
        onSelect={(id) => drawer.openClient(id)}
      />

      {addOpen && <AddClientModal onClose={() => setAddOpen(false)} />}
    </main>
  );
}
