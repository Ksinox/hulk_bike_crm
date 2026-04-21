import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { type Rental, type RentalStatus } from "@/lib/mock/rentals";
import { CLIENTS } from "@/lib/mock/clients";
import { RentalsFilters, type FiltersState } from "./RentalsFilters";
import { RentalsList } from "./RentalsList";
import { RentalsKpi, type Kpi } from "./RentalsKpi";
import { RentalCard } from "./RentalCard";
import { useRentals } from "./rentalsStore";
import { useUnreachableSet } from "@/pages/clients/clientStore";
import { NewRentalModal } from "./NewRentalModal";

const TODAY_RU = "13.10.2026"; // демо-таймлайн

function matchStatus(
  r: Rental,
  f: FiltersState["status"],
  unreachable: Set<number>,
): boolean {
  if (f === "all") return true;
  if (f === "active") return r.status === "active";
  if (f === "overdue") return r.status === "overdue";
  if (f === "return_today") {
    // Возврат именно сегодня — плановая дата завершения = сегодняшняя дата.
    // Учитываем активные и возвращаемые аренды.
    const isActiveOrReturning =
      r.status === "active" ||
      r.status === "returning" ||
      r.status === "overdue";
    return isActiveOrReturning && r.endPlanned === TODAY_RU;
  }
  if (f === "new_request")
    return r.status === "new_request" || r.status === "meeting";
  if (f === "completed")
    return r.status === "completed" || r.status === "cancelled";
  if (f === "issue")
    return (
      r.status === "police" ||
      r.status === "court" ||
      r.status === "completed_damage" ||
      r.status === "overdue" ||
      (r.damageAmount ?? 0) > 0 ||
      unreachable.has(r.clientId)
    );
  return true;
}

function matchSearch(r: Rental, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.toLowerCase().trim();
  const client = CLIENTS.find((c) => c.id === r.clientId);
  if (client && client.name.toLowerCase().includes(needle)) return true;
  if (client && client.phone.replace(/\D/g, "").includes(needle.replace(/\D/g, ""))) {
    if (needle.replace(/\D/g, "").length > 0) return true;
  }
  if (r.scooter.toLowerCase().includes(needle)) return true;
  if (String(r.id).includes(needle)) return true;
  return false;
}

const STATUS_ORDER: RentalStatus[] = [
  "overdue",
  "returning",
  "meeting",
  "new_request",
  "active",
  "completed_damage",
  "police",
  "court",
  "completed",
  "cancelled",
];

function statusRank(s: RentalStatus): number {
  const i = STATUS_ORDER.indexOf(s);
  return i === -1 ? 999 : i;
}

export function Rentals() {
  const rentals = useRentals();
  const unreachable = useUnreachableSet();
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: "all",
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (selectedId != null) return;
    const first = rentals.find((r) => r.status === "active");
    setSelectedId(first?.id ?? rentals[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(
    () =>
      rentals.filter(
        (r) =>
          matchStatus(r, filters.status, unreachable) &&
          matchSearch(r, filters.search),
      ).sort((a, b) => {
        const sr = statusRank(a.status) - statusRank(b.status);
        if (sr !== 0) return sr;
        return b.id - a.id;
      }),
    [filters, rentals, unreachable],
  );

  const kpi = useMemo<Kpi[]>(() => {
    // Отчётный период — с 14-го прошлого месяца по 14-е текущего.
    // Сегодня по демо-таймлайну: 13.10.2026 → период 14.09.2026 — 14.10.2026.
    const today = new Date(2026, 9, 13);
    const y = today.getFullYear();
    const m = today.getMonth();
    const d = today.getDate();
    const periodEnd = d >= 14
      ? new Date(y, m + 1, 14)
      : new Date(y, m, 14);
    const periodStart = new Date(periodEnd);
    periodStart.setMonth(periodStart.getMonth() - 1);
    const monthNames = ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"];
    const rangeLabel = `${String(periodStart.getDate()).padStart(2,"0")} ${monthNames[periodStart.getMonth()]} — ${String(periodEnd.getDate()).padStart(2,"0")} ${monthNames[periodEnd.getMonth()]}`;
    const inPeriod = (dateStr: string) => {
      const m2 = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
      if (!m2) return false;
      const dt = new Date(+m2[3], +m2[2] - 1, +m2[1]);
      return dt >= periodStart && dt < periodEnd;
    };

    const active = rentals.filter((r) => r.status === "active").length;
    const overdue = rentals.filter((r) => r.status === "overdue").length;
    const returningToday = rentals.filter(
      (r) =>
        r.status === "returning" ||
        (r.status === "active" && r.endPlanned === "13.10.2026"),
    ).length;
    const overdueDebt = rentals
      .filter((r) => r.status === "overdue")
      .reduce((s, r) => s + (r.sum ?? 0), 0);
    const periodRevenue = rentals
      .filter(
        (r) =>
          r.status === "active" ||
          r.status === "completed" ||
          r.status === "returning" ||
          r.status === "overdue",
      )
      .filter((r) => inPeriod(r.start))
      .reduce((s, r) => s + (r.sum ?? 0), 0);

    return [
      {
        label: "Активных",
        value: `${active} / 54`,
        hint: "идут сейчас",
        tone: "green",
      },
      {
        label: "Просрочек",
        value: String(overdue),
        hint: overdue > 0 ? "требуют звонка" : "нет",
        tone: overdue > 0 ? "red" : "neutral",
      },
      {
        label: "Возврат/продление сегодня",
        value: String(returningToday),
        hint: returningToday > 0 ? "встретить клиента" : "нет",
        tone: returningToday > 0 ? "orange" : "neutral",
      },
      {
        label: "Долг по просрочкам",
        value: `${overdueDebt.toLocaleString("ru-RU")} ₽`,
        hint: "непогашено",
        tone: overdueDebt > 0 ? "red" : "neutral",
      },
      {
        label: "Выручка",
        value: `${Math.round(periodRevenue / 1000)} тыс ₽`,
        hint: rangeLabel,
        tone: "purple",
      },
    ];
  }, [rentals]);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
            Аренды
          </h1>
          <span className="rounded-full bg-surface-soft px-3 py-1 text-[13px] font-semibold text-muted">
            {rentals.filter((r) => r.status === "active").length} активных из{" "}
            {rentals.length}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-ink-2"
        >
          <Plus size={16} />
          Новая аренда
        </button>
      </header>

      <RentalsKpi items={kpi} />

      <RentalsFilters value={filters} onChange={setFilters} />

      <div className="grid flex-1 gap-4 lg:grid-cols-[420px_1fr]">
        <RentalsList
          items={filtered}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />

        {(() => {
          const selected = rentals.find((r) => r.id === selectedId);
          if (!selected) {
            return (
              <div className="flex min-h-[400px] items-center justify-center rounded-2xl bg-surface p-10 text-center shadow-card-sm">
                <div className="text-[13px] text-muted">
                  Выберите аренду из списка
                </div>
              </div>
            );
          }
          return <RentalCard rental={selected} />;
        })()}
      </div>

      {newOpen && (
        <NewRentalModal
          onClose={() => setNewOpen(false)}
          onCreated={(r) => setSelectedId(r.id)}
        />
      )}
    </main>
  );
}
