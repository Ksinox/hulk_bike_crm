import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Key,
  Plus,
  Search,
  ShoppingBag,
  Tag,
  Wrench,
} from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { cn } from "@/lib/utils";
import {
  SCOOTER_STATUS_LABEL,
  type FleetScooter,
  type ScooterDisplayStatus,
} from "@/lib/mock/fleet";
import { useFleetScooters } from "./fleetStore";
import { MODEL_LABEL, type ScooterModel } from "@/lib/mock/rentals";
import { CLIENTS } from "@/lib/mock/clients";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { ScooterCard } from "./ScooterCard";
import { AddScooterModal } from "./AddScooterModal";

/** «Сегодня» по демо-таймлайну */
const TODAY = new Date(2026, 9, 13);

type StatusTab = "all" | "ready" | "rented" | "repair" | "for_sale";

const TABS: { id: StatusTab; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "ready", label: "Свободные" },
  { id: "rented", label: "В аренде" },
  { id: "repair", label: "Ремонт" },
  { id: "for_sale", label: "Продаются" },
];

const PAGE_SIZE = 10;

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!m) return null;
  return new Date(+m[3], +m[2] - 1, +m[1]);
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

type RentalInfo = {
  rentalId: number;
  clientId: number;
  clientName: string;
  endPlanned: string;
  isLate: boolean;
};

export function Fleet() {
  const rentals = useRentals();
  const FLEET = useFleetScooters();
  const [tab, setTab] = useState<StatusTab>("all");
  const [modelFilter, setModelFilter] = useState<ScooterModel | "all">("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  /** Словарь scooter → активная аренда (active / overdue / returning) */
  const rentalByScooter = useMemo(() => {
    const map = new Map<string, RentalInfo>();
    for (const r of rentals) {
      if (
        r.status !== "active" &&
        r.status !== "overdue" &&
        r.status !== "returning"
      ) {
        continue;
      }
      const client = CLIENTS.find((c) => c.id === r.clientId);
      const end = parseDate(r.endPlanned);
      map.set(r.scooter, {
        rentalId: r.id,
        clientId: r.clientId,
        clientName: client?.name ?? "—",
        endPlanned: r.endPlanned,
        isLate: end ? end.getTime() < TODAY.getTime() : false,
      });
    }
    return map;
  }, [rentals]);

  /** Итоговый displayStatus по каждому скутеру */
  const rows = useMemo(() => {
    return FLEET.map((s) => {
      const rental = rentalByScooter.get(s.name);
      const status: ScooterDisplayStatus =
        rental && s.baseStatus === "ready" ? "rented" : s.baseStatus;
      return { scooter: s, status, rental };
    });
  }, [FLEET, rentalByScooter]);

  const counters = useMemo(() => {
    const c = { ready: 0, rented: 0, repair: 0, for_sale: 0, total: rows.length };
    for (const r of rows) {
      if (r.status === "ready") c.ready++;
      else if (r.status === "rented") c.rented++;
      else if (r.status === "repair") c.repair++;
      else if (r.status === "for_sale") c.for_sale++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (tab !== "all" && r.status !== tab) return false;
        if (modelFilter !== "all" && r.scooter.model !== modelFilter)
          return false;
        if (q) {
          const name = r.scooter.name.toLowerCase();
          const vin = r.scooter.vin?.toLowerCase() ?? "";
          if (!name.includes(q) && !vin.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const rank = (s: ScooterDisplayStatus) =>
          s === "ready"
            ? 0
            : s === "rented"
              ? 1
              : s === "repair"
                ? 2
                : s === "for_sale"
                  ? 3
                  : s === "buyout"
                    ? 4
                    : 5;
        const r = rank(a.status) - rank(b.status);
        if (r !== 0) return r;
        return a.scooter.name.localeCompare(b.scooter.name, "ru");
      });
  }, [rows, tab, modelFilter, query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  // ============ ДЕТАЛЬНАЯ КАРТОЧКА ============
  if (selectedId != null) {
    const sel = rows.find((r) => r.scooter.id === selectedId);
    if (sel) {
      return (
        <ScooterCard
          scooter={sel.scooter}
          status={sel.status}
          onBack={() => setSelectedId(null)}
        />
      );
    }
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      <header className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
            Парк скутеров
          </h1>
          <span className="rounded-full bg-surface-soft px-3 py-1 text-[13px] font-semibold text-muted">
            {counters.total} в парке
          </span>
        </div>
      </header>

      {/* =========== KPI =========== */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Свободны"
          value={counters.ready}
          hint="готовы к аренде"
          icon={ShoppingBag}
          accent="green"
          active={tab === "ready"}
          onClick={() => {
            setTab("ready");
            setPage(1);
          }}
        />
        <KpiTile
          label="В аренде"
          value={counters.rented}
          hint="действующие договоры"
          icon={Key}
          accent="blue"
          active={tab === "rented"}
          onClick={() => {
            setTab("rented");
            setPage(1);
          }}
        />
        <KpiTile
          label="На ремонте"
          value={counters.repair}
          hint="у мастера"
          icon={Wrench}
          accent="red"
          active={tab === "repair"}
          onClick={() => {
            setTab("repair");
            setPage(1);
          }}
        />
        <KpiTile
          label="Продаются"
          value={counters.for_sale}
          hint="выставлены на витрину"
          icon={Tag}
          accent="violet"
          active={tab === "for_sale"}
          onClick={() => {
            setTab("for_sale");
            setPage(1);
          }}
        />
      </div>

      {/* =========== FILTERS =========== */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full bg-surface p-0.5 shadow-card-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
                tab === t.id
                  ? "bg-blue-50 text-blue-700"
                  : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="inline-flex rounded-full bg-surface-soft p-0.5">
          {(["all", "jog", "gear", "tank"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setModelFilter(m);
                setPage(1);
              }}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                modelFilter === m
                  ? "bg-white text-ink shadow-card-sm"
                  : "text-muted hover:text-ink",
              )}
            >
              {m === "all" ? "Все модели" : MODEL_LABEL[m]}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Имя (Jog #42) или VIN"
            className="h-9 w-full rounded-full bg-surface pl-9 pr-3 text-[13px] text-ink shadow-card-sm outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} /> Добавить скутер
        </button>
      </div>

      {/* =========== TABLE =========== */}
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
        <div className="grid grid-cols-[2fr_1fr_1.5fr_1.3fr_1fr_auto] gap-4 border-b border-border px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-2">
          <span>Имя и модель</span>
          <span>Статус</span>
          <span>Текущий клиент</span>
          <span>Дата возврата</span>
          <span className="text-right">Пробег</span>
          <span />
        </div>

        {pageRows.length === 0 && (
          <div className="px-5 py-16 text-center text-[13px] text-muted">
            Ничего не нашлось под выбранные фильтры
          </div>
        )}

        {pageRows.map((row) => (
          <FleetRow
            key={row.scooter.id}
            row={row}
            onOpen={() => setSelectedId(row.scooter.id)}
          />
        ))}

        {/* pagination */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
          <span>
            Показано {pageRows.length} из {filtered.length} скутеров
          </span>
          <Pagination
            current={currentPage}
            total={totalPages}
            onChange={setPage}
          />
        </div>
      </div>

      {addOpen && <AddScooterModal onClose={() => setAddOpen(false)} />}
    </main>
  );
}

function FleetRow({
  row,
  onOpen,
}: {
  row: {
    scooter: FleetScooter;
    status: ScooterDisplayStatus;
    rental?: RentalInfo;
  };
  onOpen: () => void;
}) {
  const { scooter, status, rental } = row;
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="grid cursor-pointer grid-cols-[2fr_1fr_1.5fr_1.3fr_1fr_auto] items-center gap-4 border-b border-border/60 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-surface-soft/40"
    >
      {/* name + model */}
      <div className="flex min-w-0 items-center gap-3">
        <ScooterAvatar model={scooter.model} />
        <div className="min-w-0">
          <div className="truncate text-[14px] font-bold text-ink">
            {scooter.name}
          </div>
          <div className="truncate text-[11px] uppercase tracking-wider text-muted-2">
            {MODEL_LABEL[scooter.model]}
          </div>
        </div>
      </div>

      {/* status */}
      <div>
        <StatusPill status={status} />
      </div>

      {/* client */}
      <div className="min-w-0">
        {rental ? (
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
              {initials(rental.clientName)}
            </div>
            <span className="truncate text-[13px] font-semibold text-ink">
              {rental.clientName}
            </span>
          </div>
        ) : status === "ready" ? (
          <span className="text-[13px] italic text-muted-2">Свободен</span>
        ) : (
          <span className="text-[13px] text-muted-2">—</span>
        )}
      </div>

      {/* return date */}
      <div className="tabular-nums">
        {rental ? (
          <span
            className={cn(
              "text-[13px] font-semibold",
              rental.isLate ? "text-red-ink" : "text-ink",
            )}
          >
            {rental.endPlanned.slice(0, 5)}
            {rental.isLate && (
              <span className="ml-1 text-[11px] font-bold uppercase">
                (просрочка)
              </span>
            )}
          </span>
        ) : (
          <span className="text-[13px] text-muted-2">—</span>
        )}
      </div>

      {/* mileage */}
      <div className="text-right text-[13px] font-semibold tabular-nums text-ink">
        {fmt(scooter.mileage)} км
      </div>

      {/* action */}
      <div>
        <button
          type="button"
          title="Карточка скутера (скоро)"
          className="rounded-full px-3 py-1 text-[13px] font-semibold text-blue-600 hover:bg-blue-50"
        >
          Открыть
        </button>
      </div>
    </div>
  );
}

function ScooterAvatar({ model }: { model: ScooterModel }) {
  const bg =
    model === "jog"
      ? "bg-blue-50 text-blue-700"
      : model === "gear"
        ? "bg-surface-soft text-ink-2"
        : model === "tank"
          ? "bg-ink text-white"
          : "bg-purple-soft text-purple-ink";
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
        bg,
      )}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="6" cy="17" r="3" stroke="currentColor" strokeWidth="2" />
        <circle cx="18" cy="17" r="3" stroke="currentColor" strokeWidth="2" />
        <path
          d="M6 17h6l4-7h4M9 10h6"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function StatusPill({ status }: { status: ScooterDisplayStatus }) {
  const cls =
    status === "ready"
      ? "bg-green-soft text-green-ink"
      : status === "rented"
        ? "bg-blue-50 text-blue-700"
        : status === "repair"
          ? "bg-red-soft text-red-ink"
          : status === "buyout"
            ? "bg-purple-soft text-purple-ink"
            : status === "for_sale"
              ? "bg-orange-soft text-orange-ink"
              : "bg-surface-soft text-muted";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider",
        cls,
      )}
    >
      {SCOOTER_STATUS_LABEL[status]}
    </span>
  );
}

function KpiTile({
  label,
  value,
  hint,
  icon: Icon,
  accent,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Key;
  accent: "green" | "blue" | "red" | "violet";
  active: boolean;
  onClick: () => void;
}) {
  const iconCls =
    accent === "green"
      ? "bg-green-soft text-green-ink"
      : accent === "blue"
        ? "bg-blue-50 text-blue-700"
        : accent === "red"
          ? "bg-red-soft text-red-ink"
          : "bg-purple-soft text-purple-ink";
  const valueCls =
    accent === "green"
      ? "text-green-ink"
      : accent === "blue"
        ? "text-blue-700"
        : accent === "red"
          ? "text-red-ink"
          : "text-purple-ink";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-[18px] border bg-surface px-5 py-4 text-left shadow-card-sm transition-all hover:-translate-y-0.5 hover:shadow-card",
        active
          ? "border-blue-600/40 ring-2 ring-blue-600/15"
          : "border-border",
      )}
    >
      <div className="flex items-start justify-between">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-full", iconCls)}>
          <Icon size={18} />
        </div>
      </div>
      <div
        className={cn(
          "mt-4 font-display text-[36px] font-extrabold leading-none tabular-nums",
          valueCls,
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[13px] font-semibold text-ink">{label}</div>
      <div className="text-[11px] text-muted-2">{hint}</div>
      {active && (
        <span className="absolute inset-x-5 bottom-0 h-0.5 rounded-t-full bg-blue-600" />
      )}
    </button>
  );
}

function Pagination({
  current,
  total,
  onChange,
}: {
  current: number;
  total: number;
  onChange: (p: number) => void;
}) {
  if (total <= 1) return null;
  const pages: (number | "…")[] = [];
  const maxBtns = 5;
  if (total <= maxBtns) {
    for (let i = 1; i <= total; i++) pages.push(i);
  } else {
    pages.push(1);
    if (current > 3) pages.push("…");
    const start = Math.max(2, current - 1);
    const end = Math.min(total - 1, current + 1);
    for (let i = start; i <= end; i++) pages.push(i);
    if (current < total - 2) pages.push("…");
    pages.push(total);
  }
  return (
    <div className="flex items-center gap-1">
      <PagerBtn
        disabled={current === 1}
        onClick={() => onChange(current - 1)}
        aria-label="Назад"
      >
        <ChevronLeft size={14} />
      </PagerBtn>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-1 text-muted-2">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold tabular-nums transition-colors",
              p === current
                ? "bg-blue-600 text-white"
                : "border border-border bg-surface text-ink-2 hover:border-blue-600 hover:text-blue-600",
            )}
          >
            {p}
          </button>
        ),
      )}
      <PagerBtn
        disabled={current === total}
        onClick={() => onChange(current + 1)}
        aria-label="Вперёд"
      >
        <ChevronRight size={14} />
      </PagerBtn>
    </div>
  );
}

function PagerBtn({
  children,
  disabled,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border border-border bg-surface text-ink-2 transition-colors",
        disabled
          ? "cursor-not-allowed opacity-40"
          : "hover:border-blue-600 hover:text-blue-600",
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
