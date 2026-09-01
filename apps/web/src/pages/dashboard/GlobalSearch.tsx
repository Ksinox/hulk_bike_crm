import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bike,
  Handshake,
  Inbox,
  Maximize2,
  Search,
  User,
  UserCog,
  Wallet,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiRentals, useApiRentalsArchived } from "@/lib/api/rentals";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { useApplications } from "@/lib/api/clientApplications";
import { useSaleDeals, useSaleManagers } from "@/lib/api/sales";
import { navigate } from "@/app/navigationStore";
import {
  KIND_LABEL,
  searchEverything,
  type SearchHit,
  type SearchKind,
} from "@/lib/globalSearch";

/**
 * Глобальный поиск по всей CRM (переписан 31.08 по фидбэку).
 *
 * Раньше он знал только имя клиента, имя/VIN скутера и номер аренды —
 * ввод «356» не находил ни номер рамы, ни двигатель, ни ID, ни сделку.
 * Теперь ищем по всем опознавательным полям клиентов, техники, аренд,
 * продаж, заявок и менеджеров; результаты отсортированы по вероятности
 * совпадения, а длинный список можно раскрыть на весь экран.
 */

const ICONS: Record<SearchKind, typeof User> = {
  client: User,
  scooter: Bike,
  rental: Handshake,
  sale: Wallet,
  application: Inbox,
  manager: UserCog,
};

const PAGE_SIZE = 20;

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [full, setFull] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: clients = [] } = useApiClients();
  const { data: scooters = [] } = useApiScooters();
  const { data: rentals = [] } = useApiRentals();
  const { data: archived = [] } = useApiRentalsArchived();
  const { data: models = [] } = useApiScooterModels();
  const { data: dealsData } = useSaleDeals();
  const { data: managersData } = useSaleManagers();
  const appsQ = useApplications({ status: "all", poll: false });

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setFull(false);
      }
      // Ctrl/Cmd + K — фокус в поиск, привычно всем.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const modelName = useMemo(() => {
    const byId = new Map(models.map((m) => [m.id, m.name] as const));
    return (id: number | null | undefined) =>
      id != null ? byId.get(id) : undefined;
  }, [models]);

  const all = useMemo(
    () =>
      searchEverything(query, {
        clients,
        scooters,
        rentals: [...rentals, ...archived],
        deals: dealsData?.items ?? [],
        applications: appsQ.data ?? [],
        managers: managersData?.items ?? [],
        modelName,
      }),
    [
      query,
      clients,
      scooters,
      rentals,
      archived,
      dealsData,
      appsQ.data,
      managersData,
      modelName,
    ],
  );

  const show = open && focused && query.trim().length >= 1;

  const pick = (r: SearchHit) => {
    setOpen(false);
    setFull(false);
    setQuery("");
    inputRef.current?.blur();
    if (r.kind === "client") navigate({ route: "clients", clientId: r.id });
    else if (r.kind === "scooter") navigate({ route: "fleet", scooterId: r.id });
    else if (r.kind === "rental") navigate({ route: "rentals", rentalId: r.id });
    else if (r.kind === "sale") navigate({ route: "sales" });
    else if (r.kind === "application") navigate({ route: "rentals" });
    else if (r.kind === "manager") navigate({ route: "sales" });
  };

  return (
    // min-w-0 + flex-1: поиск сжимается первым, вместо того чтобы
    // выталкивать кнопки на вторую строку (правка 01.09).
    <div ref={ref} className="relative min-w-[150px] max-w-[420px] flex-1">
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-full border px-3.5 py-2 transition-colors",
          focused ? "border-blue bg-white" : "border-transparent bg-surface-soft",
        )}
      >
        <Search size={16} className="text-muted-2" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setFocused(true);
            setOpen(true);
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && all.length > 0) {
              // Enter — открыть первое совпадение; Shift+Enter — весь список.
              if (e.shiftKey) setFull(true);
              else pick(all[0]!);
            }
          }}
          placeholder="Поиск: клиент, техника, VIN, № сделки…"
          className="w-full border-0 bg-transparent text-sm text-ink outline-none placeholder:text-muted-2"
        />
        {query && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="text-muted-2 hover:text-ink"
            tabIndex={-1}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {show && !full && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl bg-surface shadow-card-lg ring-1 ring-border">
          {all.length === 0 ? (
            <div className="px-3.5 py-3 text-[13px] text-muted">
              Ничего не нашли по «{query}»
            </div>
          ) : (
            <>
              <div className="max-h-[380px] overflow-y-auto py-1">
                {all.slice(0, 8).map((r) => (
                  <Row key={`${r.kind}-${r.id}`} r={r} onPick={pick} />
                ))}
              </div>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  setFull(true);
                }}
                className="flex w-full items-center justify-center gap-1.5 border-t border-border bg-surface-soft/60 py-2 text-[12px] font-semibold text-blue-700 transition-colors hover:bg-surface-soft"
              >
                <Maximize2 size={13} />
                {all.length > 8
                  ? `Показать все ${all.length} совпадений`
                  : "Открыть на весь экран"}
              </button>
            </>
          )}
        </div>
      )}

      {full && (
        <FullResults
          query={query}
          hits={all}
          onQuery={setQuery}
          onPick={pick}
          onClose={() => setFull(false)}
        />
      )}
    </div>
  );
}

/** Полноэкранный список результатов: фильтр по типу + страницы. */
function FullResults({
  query,
  hits,
  onQuery,
  onPick,
  onClose,
}: {
  query: string;
  hits: SearchHit[];
  onQuery: (v: string) => void;
  onPick: (r: SearchHit) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<SearchKind | "all">("all");
  const [page, setPage] = useState(0);

  const counts = useMemo(() => {
    const m = new Map<SearchKind, number>();
    for (const h of hits) m.set(h.kind, (m.get(h.kind) ?? 0) + 1);
    return m;
  }, [hits]);

  const filtered = useMemo(
    () => (kind === "all" ? hits : hits.filter((h) => h.kind === kind)),
    [hits, kind],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const slice = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-[95] flex flex-col bg-bg animate-dive-in">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Search size={18} className="text-blue-600" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            onQuery(e.target.value);
            setPage(0);
          }}
          placeholder="Поиск по всей CRM"
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-surface px-4 text-[14px] outline-none focus:border-blue-600"
        />
        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-soft hover:text-ink"
        >
          <X size={16} /> Закрыть
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border bg-surface px-4 py-2">
        <Chip
          active={kind === "all"}
          label={`Все · ${hits.length}`}
          onClick={() => {
            setKind("all");
            setPage(0);
          }}
        />
        {(Object.keys(KIND_LABEL) as SearchKind[])
          .filter((k) => (counts.get(k) ?? 0) > 0)
          .map((k) => (
            <Chip
              key={k}
              active={kind === k}
              label={`${KIND_LABEL[k]} · ${counts.get(k)}`}
              onClick={() => {
                setKind(k);
                setPage(0);
              }}
            />
          ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-[14px] text-muted">
            {query.trim() ? `Ничего не нашли по «${query}»` : "Введите запрос"}
          </div>
        ) : (
          <div className="mx-auto flex max-w-[900px] flex-col gap-1.5">
            {slice.map((r) => (
              <Row key={`${r.kind}-${r.id}`} r={r} onPick={onPick} big />
            ))}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="flex shrink-0 items-center justify-center gap-2 border-t border-border bg-surface px-4 py-2.5">
          <button
            type="button"
            disabled={safePage === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted disabled:opacity-40 hover:text-ink"
          >
            Назад
          </button>
          <span className="text-[12.5px] tabular-nums text-muted-2">
            {safePage + 1} / {pages}
          </span>
          <button
            type="button"
            disabled={safePage >= pages - 1}
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-muted disabled:opacity-40 hover:text-ink"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
        active ? "bg-ink text-white" : "bg-surface-soft text-muted hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function Row({
  r,
  onPick,
  big,
}: {
  r: SearchHit;
  onPick: (r: SearchHit) => void;
  big?: boolean;
}) {
  const Icon = ICONS[r.kind];
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(r);
      }}
      className={cn(
        "flex w-full items-center gap-2.5 text-left transition-colors",
        big
          ? "rounded-xl bg-surface px-3 py-2.5 shadow-card-sm hover:bg-surface-soft"
          : "px-3 py-2 hover:bg-surface-soft",
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">
          {r.title}
        </div>
        <div className="truncate text-[11px] text-muted">
          {r.subtitle}
          {r.matched && r.matched !== r.title && (
            <span className="ml-1.5 text-muted-2">· {r.matched}</span>
          )}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
        {KIND_LABEL[r.kind]}
      </span>
    </button>
  );
}
