import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { type Client } from "@/lib/mock/clients";
import { consumePending } from "@/app/navigationStore";
import {
  ClientsFilters,
  type FiltersState,
} from "./ClientsFilters";
import { ClientsList } from "./ClientsList";
import { ClientCard } from "./ClientCard";
import { AddClientModal } from "./AddClientModal";
import { useAllClients } from "./clientStore";
import { useRentals } from "@/pages/rentals/rentalsStore";

function matchClient(
  c: Client,
  f: FiltersState,
  activeSet: Set<number>,
): boolean {
  if (f.search.trim()) {
    const q = f.search.toLowerCase().trim();
    const qDigits = q.replace(/[^\d+]/g, "");
    const matchName = c.name.toLowerCase().includes(q);
    const matchPhone =
      qDigits.length > 0 &&
      c.phone.replace(/[^\d+]/g, "").includes(qDigits);
    if (!matchName && !matchPhone) return false;
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
  if (f.status === "black" && !c.blacklisted) return false;
  return true;
}

export function Clients() {
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: "all",
  });
  const clients = useAllClients();
  const rentals = useRentals();
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
  const [selectedId, setSelectedId] = useState<number>(17);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    const p = consumePending("clients");
    if (p?.clientId) setSelectedId(p.clientId);
  }, []);

  const filtered = useMemo(
    () =>
      clients
        .filter((c) => matchClient(c, filters, activeSet))
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [clients, filters, activeSet],
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
            Клиенты
          </h1>
          <span className="rounded-full bg-surface-soft px-3 py-1 text-[13px] font-semibold text-muted">
            {clients.length} клиентов
          </span>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-2"
        >
          <Plus size={16} />
          Добавить клиента
        </button>
      </header>

      <ClientsFilters value={filters} onChange={setFilters} />

      <div className="grid flex-1 gap-4 lg:grid-cols-[360px_1fr]">
        <ClientsList
          items={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {(() => {
          const selected = clients.find((c) => c.id === selectedId);
          if (!selected) {
            return (
              <div className="flex min-h-[400px] items-center justify-center rounded-2xl bg-surface p-10 text-center shadow-card-sm">
                <div className="text-[13px] text-muted">
                  Выберите клиента из списка
                </div>
              </div>
            );
          }
          return <ClientCard client={selected} />;
        })()}
      </div>

      {addOpen && <AddClientModal onClose={() => setAddOpen(false)} />}
    </main>
  );
}
