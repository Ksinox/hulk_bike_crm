import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { CLIENTS, type Client } from "@/lib/mock/clients";
import {
  ClientsFilters,
  type FiltersState,
} from "./ClientsFilters";
import { ClientsList } from "./ClientsList";

function matchClient(c: Client, f: FiltersState): boolean {
  if (f.search.trim()) {
    const q = f.search.toLowerCase().trim();
    const qDigits = q.replace(/[^\d+]/g, "");
    const matchName = c.name.toLowerCase().includes(q);
    const matchPhone =
      qDigits.length > 0 &&
      c.phone.replace(/[^\d+]/g, "").includes(qDigits);
    if (!matchName && !matchPhone) return false;
  }
  if (f.source !== "all" && c.source !== f.source) return false;
  if (f.status === "active" && (c.blacklisted || c.debt > 0)) return false;
  if (f.status === "debt" && c.debt === 0) return false;
  if (f.status === "black" && !c.blacklisted) return false;
  return true;
}

export function Clients() {
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: "all",
    source: "all",
  });
  const [selectedId, setSelectedId] = useState<number>(17);

  const filtered = useMemo(
    () =>
      CLIENTS.filter((c) => matchClient(c, filters)).sort((a, b) =>
        a.name.localeCompare(b.name, "ru"),
      ),
    [filters],
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
            {CLIENTS.length} клиентов
          </span>
        </div>
        <button
          type="button"
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

        <div className="flex min-h-[400px] items-center justify-center rounded-2xl bg-surface p-10 text-center shadow-card-sm">
          <div>
            <div className="text-[14px] font-semibold text-ink-2">
              Карточка клиента появится в следующем этапе
            </div>
            <div className="mt-1 text-[12px] text-muted">
              {selectedId
                ? `Выбран #${String(selectedId).padStart(4, "0")}`
                : "Выберите клиента из списка"}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
