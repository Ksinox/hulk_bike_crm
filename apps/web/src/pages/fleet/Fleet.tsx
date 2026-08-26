import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { consumePending, navigate, type BackTarget } from "@/app/navigationStore";
import {
  AlertTriangle,
  ArrowDownNarrowWide,
  ArrowUpNarrowWide,
  Check,
  Droplet,
  HandCoins,
  HelpCircle,
  Key,
  Layers,
  LayoutGrid,
  ListFilter,
  LogOut,
  PackageOpen,
  Plus,
  Rows3,
  Search,
  ShoppingBag,
  Tag,
  Wrench,
} from "lucide-react";
import { useMe } from "@/lib/api/auth";
import {
  makeViewMode,
  runViewModeTransition,
  type ViewMode,
} from "@/lib/viewMode";
import { useApiScooterModels } from "@/lib/api/scooter-models";
import { Topbar } from "@/pages/dashboard/Topbar";
import { cn } from "@/lib/utils";
import {
  oilFlag,
  SCOOTER_STATUS_LABEL,
  type FleetScooter,
  type ScooterDisplayStatus,
} from "@/lib/mock/fleet";
import { useFleetScooters } from "./fleetStore";
import { MODEL_LABEL, type ScooterModel } from "@/lib/mock/rentals";
import { useApiClients } from "@/lib/api/clients";
import {
  matchScooterName,
  matchText,
  normalizeQuery,
} from "@/lib/search";
import { useRentals } from "@/pages/rentals/rentalsStore";
import { ScooterName } from "@/components/ScooterName";
import { ScooterCard } from "./ScooterCard";
import { AddScooterModal } from "./AddScooterModal";

/** «Сегодня» по демо-таймлайну */
const TODAY = new Date();

type StatusTab =
  | "all"
  | "rental_pool"
  | "rented"
  | "repair"
  | "dtp"
  | "disassembly"
  | "for_sale"
  | "ready"
  /** Передан клиенту в выкуп — техника наша, пока сумма не закрыта. */
  | "buyout"
  /** Продан: права перешли покупателю, в парке не числится. */
  | "gone";

/**
 * Техника выбыла из парка окончательно — только продажа.
 *
 * Правка заказчика 25.08: выкуп сюда НЕ входит. Скутер в выкупе остаётся
 * нашим: клиент платит по графику, перестанет — технику заберём. Права
 * переходят к нему только когда сумма закрыта, тогда статус станет
 * «Продан» и единица выйдет из парка.
 */
function isGone(status: ScooterDisplayStatus): boolean {
  return status === "sold";
}

// v0.3.7: пагинация удалена в пользу одного скролла.

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

/**
 * Правки 2.0, п.10: к какому подразделению относится статус техники.
 * Изоляция: в режиме аренды не видно продажу и наоборот.
 */
export type FleetMode = "rental" | "sale" | "buyout" | "unassigned";

const MODE_OF: Record<ScooterDisplayStatus, FleetMode> = {
  rented: "rental",
  rental_pool: "rental",
  repair: "rental",
  dtp: "rental",
  disassembly: "rental",
  for_sale: "sale",
  sold: "sale",
  buyout: "buyout",
  ready: "unassigned",
};

const MODE_TITLE: Record<FleetMode, string> = {
  rental: "Парк аренды",
  sale: "На продажу",
  buyout: "В выкупе",
  unassigned: "Не распределены",
};

const MODE_HINT: Record<FleetMode, string> = {
  rental: "техника, которая сдаётся клиентам",
  sale: "витрина и проданные единицы",
  buyout: "у клиентов по договору выкупа — пока платят, техника наша",
  unassigned: "заведены, но подразделение ещё не выбрано",
};

export function Fleet({
  embedded = false,
  mode = "rental",
}: { embedded?: boolean; mode?: FleetMode } = {}) {
  const rentals = useRentals();
  const FLEET = useFleetScooters();
  const { data: apiClients } = useApiClients();
  const { data: apiModels = [] } = useApiScooterModels();
  const [tab, setTab] = useState<StatusTab>("all");
  /**
   * Набор id моделей из каталога для фильтра (мульти-выбор).
   * Пустой = фильтр выключен (все модели).
   */
  const [modelIdsFilter, setModelIdsFilter] = useState<Set<number>>(new Set());
  /**
   * Сортировка списка скутеров.
   *  - by: "number" — по номеру в серии (Jog #14 → #02 → #01)
   *  - by: "mileage" — по пробегу (км)
   * Кликом на заголовок «Пробег» переключаем by и направление.
   * Переключателем рядом с фильтром моделей — только направление.
   */
  const [sortBy, setSortBy] = useState<"number" | "mileage">("number");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [backTo, setBackTo] = useState<BackTarget | null>(null);

  // v0.8.22: режим «Список/Плитки» (пер-пользователь, морфинг как в Арендах).
  const { data: me } = useMe();
  const fleetView = useMemo(() => makeViewMode("fleet", "list"), []);
  const [viewMode, setViewMode] = useState<ViewMode>(() => fleetView.load(undefined));
  useEffect(() => {
    if (me?.id != null) setViewMode(fleetView.load(me.id));
  }, [me?.id, fleetView]);
  const changeViewMode = (m: ViewMode) => {
    if (m === viewMode) return;
    fleetView.save(me?.id, m);
    runViewModeTransition(() => flushSync(() => setViewMode(m)));
  };

  // Если пришли с navigate({ route: "fleet", scooterId, from: ... })
  //   → открываем карточку + запоминаем куда вернуться
  useEffect(() => {
    const p = consumePending("fleet");
    if (p?.scooterId != null) setSelectedId(p.scooterId);
    if (p?.from) setBackTo(p.from);
  }, []);

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
      const client = apiClients?.find((c) => c.id === r.clientId);
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
  }, [rentals, apiClients]);

  /** Итоговый displayStatus по каждому скутеру */
  const rows = useMemo(() => {
    return FLEET.map((s) => {
      const rental = rentalByScooter.get(s.name);
      // Если у скутера есть активная/просроченная/возвратная аренда —
      // показываем «В аренде» независимо от базового статуса (только
      // если базовый — rental_pool, т.е. скутер официально в пуле аренды).
      const status: ScooterDisplayStatus =
        rental && s.baseStatus === "rental_pool" ? "rented" : s.baseStatus;
      return { scooter: s, status, rental };
    });
  }, [FLEET, rentalByScooter]);

  // Изоляция режимов (п.10): работаем только с техникой этого подразделения.
  const modeRows = useMemo(
    () => rows.filter((r) => MODE_OF[r.status] === mode),
    [rows, mode],
  );

  const counters = useMemo(() => {
    const c = {
      ready: 0,
      rental_pool: 0,
      rented: 0,
      repair: 0,
      dtp: 0,
      disassembly: 0,
      for_sale: 0,
      /** Передан в выкуп: техника наша, но у клиента (в аренду не идёт). */
      buyout: 0,
      /** Продан: права перешли покупателю, техники у нас больше нет. */
      gone: 0,
      total: 0,
    };
    for (const r of modeRows) {
      if (isGone(r.status)) {
        c.gone++;
        // Проданные не входят в счётчик ПАРКА (аренда), но в режиме
        // продажи это и есть предмет работы — там их считаем (п.10).
        if (mode !== "sale") continue;
      }
      c.total++;
      if (r.status === "ready") c.ready++;
      else if (r.status === "rental_pool") c.rental_pool++;
      else if (r.status === "rented") c.rented++;
      else if (r.status === "repair") c.repair++;
      else if (r.status === "dtp") c.dtp++;
      else if (r.status === "disassembly") c.disassembly++;
      else if (r.status === "for_sale") c.for_sale++;
      else if (r.status === "buyout") c.buyout++;
    }
    return c;
  }, [modeRows, mode]);

  // Для каждого выбранного modelId вычисляем legacy enum (jog/gear/honda/tank)
  // — нужно для фильтрации старых скутеров, у которых modelId ещё не проставлен.
  const selectedLegacyModels = useMemo(() => {
    const set = new Set<string>();
    for (const id of modelIdsFilter) {
      const m = apiModels.find((x) => x.id === id);
      if (!m) continue;
      const lower = m.name.toLowerCase();
      if (lower.includes("jog")) set.add("jog");
      else if (lower.includes("gear")) set.add("gear");
      else if (lower.includes("honda")) set.add("honda");
      else if (lower.includes("tank")) set.add("tank");
    }
    return set;
  }, [modelIdsFilter, apiModels]);

  const filtered = useMemo(() => {
    const q = normalizeQuery(query);
    return modeRows
      .filter((r) => {
        // Проданная техника не показывается в парке аренды — её физически
        // нет. Но в режиме «Продажа» (п.10) она и есть предмет работы,
        // поэтому там видна наравне с витриной.
        if (tab === "gone") {
          if (!isGone(r.status)) return false;
        } else {
          if (isGone(r.status) && mode !== "sale") return false;
          if (tab !== "all" && r.status !== tab) return false;
        }
        // Фильтр по моделям: пропускаем если совпал FK (modelId) ИЛИ
        // legacy-enum (model). У старых скутеров modelId=null — они
        // должны находиться по enum.
        if (modelIdsFilter.size > 0) {
          const byId =
            r.scooter.modelId != null && modelIdsFilter.has(r.scooter.modelId);
          const byEnum = selectedLegacyModels.has(r.scooter.model);
          if (!byId && !byEnum) return false;
        }
        if (q.text) {
          // Пункт 18: ищем и по номеру двигателя, раме, ID (4 цифры рамы)
          // и месту в аренде — «по любым цифрам в данных скутера».
          const ok =
            matchScooterName(r.scooter.name, q) ||
            matchText(r.scooter.vin ?? undefined, q) ||
            matchText(r.scooter.engineNo ?? undefined, q) ||
            matchText(r.scooter.frameNumber ?? undefined, q) ||
            matchText(r.scooter.uid ?? undefined, q) ||
            (r.scooter.rentalSlot != null &&
              String(r.scooter.rentalSlot) === q.text);
          if (!ok) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "mileage") {
          const diff =
            sortDir === "desc"
              ? b.scooter.mileage - a.scooter.mileage
              : a.scooter.mileage - b.scooter.mileage;
          if (diff !== 0) return diff;
          return a.scooter.name.localeCompare(b.scooter.name, "ru");
        }
        // by: number
        const numA = parseScooterNumber(a.scooter.name);
        const numB = parseScooterNumber(b.scooter.name);
        const diff = sortDir === "desc" ? numB - numA : numA - numB;
        if (diff !== 0) return diff;
        return a.scooter.name.localeCompare(b.scooter.name, "ru");
      });
  }, [
    rows,
    tab,
    modelIdsFilter,
    selectedLegacyModels,
    query,
    sortBy,
    sortDir,
    modeRows,
    mode,
  ]);

  // ============ ДЕТАЛЬНАЯ КАРТОЧКА ============
  if (selectedId != null) {
    const sel = rows.find((r) => r.scooter.id === selectedId);
    if (sel) {
      return (
        <ScooterCard
          scooter={sel.scooter}
          status={sel.status}
          onBack={() => {
            if (backTo?.route === "rentals") {
              navigate({ route: "rentals", rentalId: backTo.rentalId });
              setBackTo(null);
            }
            setSelectedId(null);
          }}
          backLabel={
            backTo?.route === "rentals" && backTo.rentalId
              ? `к аренде #${String(backTo.rentalId).padStart(4, "0")}`
              : undefined
          }
        />
      );
    }
  }

  const Root: React.ElementType = embedded ? "div" : "main";

  return (
    <Root className="flex min-w-0 flex-1 flex-col gap-4">
      {!embedded && <Topbar />}
      {!embedded && (
        <header className="flex items-center justify-between gap-3">
          <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
            Парк скутеров
          </h1>
        </header>
      )}

      {/* =========== Обзор парка =========== */}
      <ParkOverview
        counters={counters}
        tab={tab}
        onTab={setTab}
        mode={mode}
      />

      {/* =========== Поиск + фильтр моделей + добавить =========== */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
            }}
            placeholder="Имя, VIN, № двигателя, рама, ID…"
            className="h-9 w-full rounded-full bg-surface pl-9 pr-12 text-[13px] text-ink shadow-card-sm outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
          />
          <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <SortToggle value={sortDir} onChange={setSortDir} />
            <ModelFilterDropdown
              value={modelIdsFilter}
              onChange={(next) => {
                setModelIdsFilter(next);
              }}
            />
          </div>
        </div>

        {/* v0.8.22: переключатель Список/Плитки (как в Арендах). */}
        <div className="flex shrink-0 items-center rounded-full bg-surface-soft p-0.5">
          <button
            type="button"
            onClick={() => changeViewMode("list")}
            title="Список"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              viewMode === "list"
                ? "bg-white text-blue-700 shadow-card-sm"
                : "text-muted hover:text-ink",
            )}
          >
            <Rows3 size={15} />
          </button>
          <button
            type="button"
            onClick={() => changeViewMode("tiles")}
            title="Плитки"
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
              viewMode === "tiles"
                ? "bg-white text-blue-700 shadow-card-sm"
                : "text-muted hover:text-ink",
            )}
          >
            <LayoutGrid size={15} />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} /> Добавить скутер
        </button>
      </div>

      {/* v0.8.24: контейнер с view-transition-name — cross-fade при смене режима. */}
      <div style={{ viewTransitionName: "fleet-area" }}>
      {/* =========== ПЛИТКИ =========== */}
      {viewMode === "tiles" ? (
        <div className="rounded-2xl bg-surface p-3 shadow-card-sm">
          {filtered.length === 0 ? (
            <div className="px-5 py-16 text-center text-[13px] text-muted">
              Ничего не нашлось под выбранные фильтры
            </div>
          ) : (
            <div className="flex flex-wrap content-start justify-start gap-3">
              {filtered.map((row) => (
                <FleetTile
                  key={row.scooter.id}
                  row={row}
                  onOpen={() => setSelectedId(row.scooter.id)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
      /* =========== TABLE =========== */
      <div className="overflow-hidden rounded-2xl bg-surface shadow-card-sm">
        <div className="grid grid-cols-[2fr_1fr_1.5fr_1.3fr_1fr_auto] gap-4 border-b border-border px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-2">
          <span>Имя и модель</span>
          <span>Статус</span>
          <span>Текущий клиент</span>
          <span>Дата возврата</span>
          <button
            type="button"
            onClick={() => {
              if (sortBy === "mileage") {
                setSortDir((d) => (d === "desc" ? "asc" : "desc"));
              } else {
                setSortBy("mileage");
                setSortDir("desc");
              }
            }}
            className={cn(
              "flex items-center justify-end gap-1 text-right transition-colors hover:text-ink",
              sortBy === "mileage" && "text-blue-700",
            )}
            title="Сортировать по пробегу"
          >
            Пробег
            {sortBy === "mileage" && (
              <span className="text-[10px]">{sortDir === "desc" ? "↓" : "↑"}</span>
            )}
          </button>
          <span />
        </div>

        {filtered.length === 0 && (
          <div className="px-5 py-16 text-center text-[13px] text-muted">
            Ничего не нашлось под выбранные фильтры
          </div>
        )}

        {/* v0.3.7: один непрерывный список со скроллом — без страниц.
            Парк ~50–100 скутеров, разбивка на страницы только мешает. */}
        {filtered.map((row) => (
          <FleetRow
            key={row.scooter.id}
            row={row}
            onOpen={() => setSelectedId(row.scooter.id)}
          />
        ))}

        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border bg-surface-soft/50 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-2">
            <span>Всего {filtered.length} скутеров</span>
          </div>
        )}
      </div>
      )}
      </div>

      {addOpen && <AddScooterModal onClose={() => setAddOpen(false)} />}
    </Root>
  );
}

/** Компактный бейдж «масло скоро/просрочено» для списка и плиток парка. */
function OilBadge({ state }: { state: "overdue" | "warn" }) {
  return (
    <span
      title={
        state === "overdue"
          ? "Замена масла просрочена"
          : "Замена масла скоро"
      }
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider",
        state === "overdue"
          ? "bg-red-soft text-red-ink"
          : "bg-orange-100 text-orange-700",
      )}
    >
      <Droplet size={9} /> масло
    </span>
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
  // Бейдж масла показываем только для катающих скутеров (парк/в аренде).
  const oilState =
    status === "rental_pool" || status === "rented" ? oilFlag(scooter) : null;
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
          <ScooterName
            name={scooter.name}
            number={scooter.rentalSlot}
            exNumber={scooter.exRentalSlot}
            className="text-[14px] font-bold text-ink"
          />
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

      {/* mileage + флаг масла */}
      <div className="text-right">
        <div className="text-[13px] font-semibold tabular-nums text-ink">
          {fmt(scooter.mileage)} км
        </div>
        {oilState && (
          <div className="mt-0.5 flex justify-end">
            <OilBadge state={oilState} />
          </div>
        )}
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

/** v0.8.22: плитка скутера (режим «Плитки»). */
function FleetTile({
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
  const oilState =
    status === "rental_pool" || status === "rented" ? oilFlag(scooter) : null;
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onOpen();
      }}
      className="flex w-[200px] cursor-pointer flex-col gap-2 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface-soft/60"
    >
      <div className="flex items-center gap-2">
        <ScooterAvatar model={scooter.model} />
        <div className="min-w-0 flex-1">
          <ScooterName
            name={scooter.name}
            number={scooter.rentalSlot}
            exNumber={scooter.exRentalSlot}
            className="text-[14px] font-bold text-ink"
          />
          <div className="truncate text-[10px] uppercase tracking-wider text-muted-2">
            {MODEL_LABEL[scooter.model]}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusPill status={status} />
        {oilState && <OilBadge state={oilState} />}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="min-w-0 truncate text-muted-2">
          {rental
            ? rental.clientName
            : status === "ready"
              ? "Свободен"
              : "—"}
        </span>
        <span className="shrink-0 tabular-nums font-semibold text-ink-2">
          {fmt(scooter.mileage)} км
        </span>
      </div>
      {rental && (
        <div
          className={cn(
            "text-[11px] font-semibold tabular-nums",
            rental.isLate ? "text-red-ink" : "text-muted",
          )}
        >
          возврат {rental.endPlanned.slice(0, 5)}
          {rental.isLate && " · просрочка"}
        </div>
      )}
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
  // Цвета должны соответствовать KPI-тайлам сверху страницы:
  //   Готов к аренде (rental_pool) — green
  //   Активная аренда (rented)     — blue
  //   Не распределён (ready)       — slate (тёмно-серый)
  //   На ремонте (repair)          — red
  //   Продаются (for_sale, buyout) — violet
  //   В разборке (disassembly)     — ink
  //   Продан (sold)                — muted
  const cls =
    status === "rental_pool"
      ? "bg-green-soft text-green-ink"
      : status === "rented"
        ? "bg-blue-50 text-blue-700"
        : status === "ready"
          ? "bg-ink/10 text-ink"
          : status === "repair"
            ? "bg-red-soft text-red-ink"
            : status === "dtp"
              ? "bg-red text-white"
              : status === "buyout" || status === "for_sale"
                ? "bg-purple-soft text-purple-ink"
                : status === "disassembly"
                  ? "bg-ink text-white"
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

/**
 * Обзор парка. Заказчик 24.08: «очень-очень сжатые карточки, взгляд
 * теряется» — поэтому вместо девяти равных плиток здесь иерархия:
 * слева главная карта (сколько техники и как она загружена), справа —
 * компактные строки по группам смысла. Всё кликабельно — это фильтры.
 */
function ParkOverview({
  counters,
  tab,
  onTab,
  mode,
}: {
  /** Правки 2.0, п.10: режим подразделения — от него зависит содержимое. */
  mode: FleetMode;
  counters: {
    ready: number;
    rental_pool: number;
    rented: number;
    repair: number;
    dtp: number;
    disassembly: number;
    for_sale: number;
    buyout: number;
    gone: number;
    total: number;
  };
  tab: StatusTab;
  onTab: (t: StatusTab) => void;
}) {
  // Загрузка = занято / (занято + свободно). Ремонт, ДТП и «не распределены»
  // к выдаче недоступны, поэтому в знаменатель не идут — иначе процент
  // занижается и не отражает реальную доступность парка.
  const rentable = counters.rented + counters.rental_pool;
  const loadPct = rentable > 0 ? Math.round((counters.rented / rentable) * 100) : 0;
  const attention = counters.ready + counters.repair + counters.dtp;

  return (
    <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Главная карта: сколько техники и как она работает ── */}
      <div
        className={cn(
          "relative flex flex-col overflow-hidden rounded-[20px] border bg-surface p-5 shadow-card-sm transition-colors",
          tab === "all" ? "border-blue-600/40 ring-2 ring-blue-600/15" : "border-border",
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => onTab("all")}
            className="text-left"
            title="Показать всю технику в обороте"
          >
            <div className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
              {MODE_TITLE[mode]}
            </div>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="font-display text-[46px] font-extrabold leading-none text-ink tabular-nums">
                {counters.total}
              </span>
              <span className="text-[13px] text-muted">
                {counters.total === 1 ? "единица" : "единиц"} · {MODE_HINT[mode]}
              </span>
            </div>
          </button>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
            <Layers size={20} />
          </div>
        </div>

        {/* Полоса загрузки: синее — занято клиентами, зелёное — свободно.
            Правки 2.0, п.10: только в режиме аренды — в продаже и выкупе
            «загрузка» смысла не имеет. */}
        <div className={cn("mt-5", mode !== "rental" && "hidden")}>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="font-bold text-ink">Загрузка {loadPct}%</span>
            <span className="text-muted-2">
              {rentable > 0
                ? `${counters.rented} из ${rentable} доступных заняты`
                : "нет техники, доступной к выдаче"}
            </span>
          </div>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-surface-soft">
            <span
              className="bg-blue-600 transition-all"
              style={{ width: `${rentable > 0 ? (counters.rented / rentable) * 100 : 0}%` }}
            />
            <span
              className="bg-green-ink/45 transition-all"
              style={{ width: `${rentable > 0 ? (counters.rental_pool / rentable) * 100 : 0}%` }}
            />
          </div>
        </div>

        {/* Две операционные метрики — то, чем живёт день */}
        <div
          className={cn(
            "mt-4 grid flex-1 grid-cols-2 gap-2.5",
            mode !== "rental" && "hidden",
          )}
        >
          <ParkMetric
            label="В аренде"
            hint="у клиентов сейчас"
            extra={
              counters.total > 0
                ? `${Math.round((counters.rented / counters.total) * 100)} % парка`
                : undefined
            }
            value={counters.rented}
            icon={Key}
            tone="blue"
            active={tab === "rented"}
            onClick={() => onTab("rented")}
          />
          <ParkMetric
            label="Свободны"
            hint="можно выдавать"
            extra={
              counters.rental_pool > 0
                ? "готовы к выдаче прямо сейчас"
                : "выдавать нечего"
            }
            value={counters.rental_pool}
            icon={ShoppingBag}
            tone="green"
            active={tab === "rental_pool"}
            onClick={() => onTab("rental_pool")}
          />
        </div>
      </div>

      {/* ── Правая колонка: по группам смысла ── */}
      <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-card-sm">
        <ParkGroup
          title="Требуют решения"
          badge={attention}
          rows={[
            {
              key: "ready" as const,
              label: "Не распределены",
              hint: "решить, куда поставить",
              value: counters.ready,
              icon: HelpCircle,
              tone: "amber" as const,
            },
            {
              key: "repair" as const,
              label: "На ремонте",
              hint: "у мастера",
              value: counters.repair,
              icon: Wrench,
              tone: "red" as const,
            },
            {
              key: "dtp" as const,
              label: "ДТП",
              hint: "после аварии",
              value: counters.dtp,
              icon: AlertTriangle,
              tone: "red" as const,
            },
          ]}
          tab={tab}
          onTab={onTab}
        />

        <div className="h-px bg-border" />

        <ParkGroup
          title="Вне аренды"
          rows={[
            {
              key: "disassembly" as const,
              label: "На разборку",
              hint: "идут на запчасти",
              value: counters.disassembly,
              icon: PackageOpen,
              tone: "slate" as const,
            },
            {
              key: "for_sale" as const,
              label: "Продаются",
              hint: "выставлены на витрину",
              value: counters.for_sale,
              icon: Tag,
              tone: "violet" as const,
            },
            {
              key: "buyout" as const,
              label: "В выкупе",
              hint: "у клиента, техника пока наша",
              value: counters.buyout,
              icon: HandCoins,
              tone: "violet" as const,
            },
            {
              key: "gone" as const,
              label: "Проданы",
              hint: "права перешли покупателю",
              value: counters.gone,
              icon: LogOut,
              tone: "slate" as const,
            },
          ]}
          tab={tab}
          onTab={onTab}
        />
      </div>
    </section>
  );
}

/** Крупная метрика внутри главной карты парка. */
function ParkMetric({
  label,
  hint,
  extra,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  /** Третья строка — чтобы растянутая плитка не пустовала внутри. */
  extra?: string;
  value: number;
  icon: typeof Key;
  tone: "blue" | "green";
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-full items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-colors",
        active
          ? tone === "blue"
            ? "border-blue-600/50 bg-blue-50"
            : "border-green-ink/40 bg-green-soft"
          : "border-border bg-surface-soft/50 hover:border-blue-600/30",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-green-soft text-green-ink",
        )}
      >
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "font-display text-[24px] font-extrabold leading-none tabular-nums",
              tone === "blue" ? "text-blue-700" : "text-green-ink",
            )}
          >
            {value}
          </span>
          <span className="truncate text-[13px] font-bold text-ink">{label}</span>
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-muted-2">{hint}</span>
        {extra && (
          <span className="mt-1.5 block truncate text-[11px] font-semibold text-muted">
            {extra}
          </span>
        )}
      </span>
    </button>
  );
}

/** Группа статусов справа: заголовок + компактные строки. */
function ParkGroup({
  title,
  badge,
  rows,
  tab,
  onTab,
}: {
  title: string;
  /** Сумма по группе — показываем, только если есть что показывать. */
  badge?: number;
  rows: {
    key: StatusTab;
    label: string;
    hint: string;
    value: number;
    icon: typeof Key;
    tone: "amber" | "red" | "violet" | "slate";
  }[];
  tab: StatusTab;
  onTab: (t: StatusTab) => void;
}) {
  // Правка заказчика 24.08: показываем ВСЕ статусы, включая нулевые —
  // так панель всегда заполнена, и видно «ДТП 0», а не пустоту.
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-2">
          {title}
        </span>
        {badge != null &&
          (badge > 0 ? (
            <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900 tabular-nums">
              {badge}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-soft px-1.5 py-0.5 text-[10px] font-bold text-green-ink">
              <Check size={10} strokeWidth={3} /> чисто
            </span>
          ))}
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        {rows.map((r) => (
          <ParkRow
            key={r.key}
            label={r.label}
            hint={r.hint}
            value={r.value}
            icon={r.icon}
            tone={r.tone}
            active={tab === r.key}
            onClick={() => onTab(r.key)}
          />
        ))}
      </div>
    </div>
  );
}

/** Компактная строка статуса — иконка, число, подпись. */
function ParkRow({
  label,
  hint,
  value,
  icon: Icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  value: number;
  icon: typeof Key;
  tone: "amber" | "red" | "violet" | "slate";
  active: boolean;
  onClick: () => void;
}) {
  const zero = value === 0;
  const iconCls = zero
    ? "bg-surface-soft text-muted-2"
    : tone === "amber"
      ? "bg-amber-100 text-amber-900"
      : tone === "red"
        ? "bg-red-soft text-red-ink"
        : tone === "violet"
          ? "bg-purple-soft text-purple-ink"
          : "bg-surface-soft text-ink-2";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 text-left transition-colors",
        active ? "bg-blue-50 ring-1 ring-inset ring-blue-600/30" : "hover:bg-surface-soft/70",
      )}
    >
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          iconCls,
        )}
      >
        <Icon size={14} />
      </span>
      <span
        className={cn(
          "w-7 shrink-0 text-right font-display text-[17px] font-extrabold leading-none tabular-nums",
          zero ? "text-muted-2" : "text-ink",
        )}
      >
        {value}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate text-[12.5px] font-semibold",
            zero ? "text-muted" : "text-ink",
          )}
        >
          {label}
        </span>
        <span className="block truncate text-[11px] text-muted-2">{hint}</span>
      </span>
    </button>
  );
}

/**
 * Иконка фильтра моделей в поиске + всплывающий чек-лист моделей из каталога.
 * Выбор — мульти (Set<id>); клик вне или Esc закрывает.
 */
function ModelFilterDropdown({
  value,
  onChange,
}: {
  value: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const { data: models = [] } = useApiScooterModels();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (id: number) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const activeCount = value.size;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={activeCount > 0 ? `Фильтр моделей: ${activeCount} выбрано` : "Фильтр моделей"}
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full transition-colors",
          activeCount > 0
            ? "bg-blue-600 text-white"
            : "bg-surface-soft text-muted-2 hover:bg-blue-50 hover:text-blue-700",
        )}
      >
        <ListFilter size={14} />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red px-1 text-[9px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 w-[240px] overflow-hidden rounded-xl bg-surface shadow-card-lg ring-1 ring-border">
          <div className="border-b border-border bg-surface-soft px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-2">
            Фильтр по моделям
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {models.length === 0 ? (
              <div className="px-3 py-3 text-[12px] text-muted">
                Каталог пуст
              </div>
            ) : (
              models.map((m) => {
                const on = value.has(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggle(m.id)}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-surface-soft"
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        on
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-border bg-white",
                      )}
                    >
                      {on && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="flex-1 truncate">{m.name}</span>
                  </button>
                );
              })
            )}
          </div>
          {activeCount > 0 && (
            <div className="flex justify-end border-t border-border bg-surface-soft px-3 py-2">
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-[11px] font-semibold text-muted-2 hover:text-red-ink"
              >
                Сбросить
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Извлекает порядковый номер из имени скутера: «Jog #14» → 14, «Gear #02» → 2.
 * Если номера нет — возвращает 0 (для стабильной сортировки).
 */
function parseScooterNumber(name: string): number {
  const m = name.match(/#(\d+)/);
  return m ? Number(m[1]) : 0;
}

/**
 * Простой переключатель направления сортировки по номеру.
 * Один клик меняет ↓ на ↑ и наоборот. Иконка показывает текущее направление.
 */
function SortToggle({
  value,
  onChange,
}: {
  value: "desc" | "asc";
  onChange: (v: "desc" | "asc") => void;
}) {
  const Icon = value === "desc" ? ArrowDownNarrowWide : ArrowUpNarrowWide;
  const label =
    value === "desc"
      ? "По номеру: от большего к меньшему. Клик — переключить."
      : "По номеру: от меньшего к большему. Клик — переключить.";
  return (
    <button
      type="button"
      onClick={() => onChange(value === "desc" ? "asc" : "desc")}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-soft text-muted-2 transition-colors hover:bg-blue-50 hover:text-blue-700"
    >
      <Icon size={14} />
    </button>
  );
}
