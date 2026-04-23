import { useEffect, useMemo, useRef, useState } from "react";
import { Bike, Search, User, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApiClients } from "@/lib/api/clients";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiRentals } from "@/lib/api/rentals";
import { navigate } from "@/app/navigationStore";
import {
  matchId,
  matchPhone,
  matchScooterName,
  matchText,
  normalizeQuery,
  rankTextMatch,
} from "@/lib/search";

type Result =
  | { kind: "client"; id: number; title: string; subtitle: string; rank: number }
  | { kind: "scooter"; id: number; title: string; subtitle: string; rank: number }
  | { kind: "rental"; id: number; title: string; subtitle: string; rank: number };

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: clients = [] } = useApiClients();
  const { data: scooters = [] } = useApiScooters();
  const { data: rentals = [] } = useApiRentals();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = normalizeQuery(query);
    if (q.text.length < 2) return [];

    const out: Result[] = [];

    // Клиенты: имя / телефон / id
    for (const c of clients) {
      const nameRank = rankTextMatch(c.name, q);
      const byName = nameRank < 999;
      const byPhone = matchPhone(c.phone, q);
      const byId = matchId(c.id, q);
      if (byName || byPhone || byId) {
        out.push({
          kind: "client",
          id: c.id,
          title: c.name,
          subtitle: c.phone,
          rank: byName ? nameRank : byId ? 1 : 3,
        });
      }
    }

    // Скутеры: имя / номер / vin
    for (const s of scooters) {
      const byName = matchScooterName(s.name, q);
      const byVin = matchText(s.vin ?? undefined, q);
      if (byName || byVin) {
        const nameRank = rankTextMatch(s.name, q);
        out.push({
          kind: "scooter",
          id: s.id,
          title: s.name,
          subtitle: s.vin ? `VIN ${s.vin}` : modelLabel(s.model),
          rank: byName ? nameRank : 3,
        });
      }
    }

    // Аренды: id / имя клиента / имя скутера
    const clientById = new Map(clients.map((c) => [c.id, c]));
    const scooterById = new Map(scooters.map((s) => [s.id, s]));
    for (const r of rentals) {
      const cl = clientById.get(r.clientId);
      const sc = r.scooterId != null ? scooterById.get(r.scooterId) : null;
      const byId = matchId(r.id, q);
      const byClient = matchText(cl?.name, q);
      const byScooter = matchScooterName(sc?.name ?? undefined, q);
      if (byId || byClient || byScooter) {
        out.push({
          kind: "rental",
          id: r.id,
          title: `Аренда #${r.id}`,
          subtitle: `${cl?.name ?? "—"} · ${sc?.name ?? "без скутера"}`,
          rank: byId ? 0 : byClient ? 1 : 2,
        });
      }
    }

    return out.sort((a, b) => a.rank - b.rank).slice(0, 12);
  }, [query, clients, scooters, rentals]);

  const show = open && focused && query.trim().length >= 2;

  const pick = (r: Result) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    if (r.kind === "client") navigate({ route: "clients", clientId: r.id });
    if (r.kind === "scooter") navigate({ route: "fleet", scooterId: r.id });
    if (r.kind === "rental") navigate({ route: "rentals", rentalId: r.id });
  };

  return (
    <div ref={ref} className="relative min-w-[280px]">
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-full border px-3.5 py-2 transition-colors",
          focused
            ? "border-blue bg-white"
            : "border-transparent bg-surface-soft",
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
          placeholder="Поиск: клиент, скутер, № аренды…"
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

      {show && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-[420px] overflow-y-auto rounded-xl bg-surface py-1 shadow-card-lg ring-1 ring-border">
          {results.length === 0 ? (
            <div className="px-3.5 py-3 text-[13px] text-muted">
              Ничего не найдено по «{query}»
            </div>
          ) : (
            results.map((r) => <Row key={`${r.kind}-${r.id}`} r={r} onPick={pick} />)
          )}
        </div>
      )}
    </div>
  );
}

function Row({ r, onPick }: { r: Result; onPick: (r: Result) => void }) {
  const Icon = r.kind === "client" ? User : r.kind === "scooter" ? Bike : Search;
  const tag =
    r.kind === "client"
      ? "Клиент"
      : r.kind === "scooter"
        ? "Скутер"
        : "Аренда";
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onPick(r);
      }}
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-soft"
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
        <Icon size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-semibold text-ink">
          {r.title}
        </div>
        <div className="truncate text-[11px] text-muted">{r.subtitle}</div>
      </div>
      <span className="shrink-0 rounded-full bg-surface-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-2">
        {tag}
      </span>
    </button>
  );
}

function modelLabel(m: string): string {
  switch (m) {
    case "jog":
      return "Yamaha Jog";
    case "gear":
      return "Yamaha Gear";
    case "honda":
      return "Honda";
    case "tank":
      return "Tank";
    default:
      return m;
  }
}
