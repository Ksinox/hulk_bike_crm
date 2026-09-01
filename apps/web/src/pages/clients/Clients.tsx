import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, Plus } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { cn } from "@/lib/utils";
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
import { ClientCard } from "./ClientCard";
import { AddClientModal } from "./AddClientModal";
import { ApplicationsBlock } from "./ApplicationsBlock";
import { ApplicationsTab } from "./ApplicationsTab";
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
  /** v0.6.15: B1 — клиенты с арендой завершающейся в [endDateFrom, endDateTo].
   *  Если фильтр endDateFrom/endDateTo не выставлен — undefined. */
  endRangeClientSet?: Set<number> | null,
): boolean {
  if (f.search.trim()) {
    const query = normalizeQuery(f.search);
    const ok =
      matchText(c.name, query) ||
      matchPhoneQ(c.phone, query) ||
      matchId(c.id, query);
    if (!ok) return false;
  }
  // Фильтр по дате добавления клиента. addedOn формата ISO YYYY-MM-DD,
  // лексикографическое сравнение работает корректно для этого формата.
  // Если у клиента нет addedOn (legacy mock-данные), но фильтр выставлен —
  // не пропускаем: пользователь спросил «добавленные в X», а у нас на
  // этого клиента такой инфы нет.
  if (f.dateFrom || f.dateTo) {
    if (!c.addedOn) return false;
    if (f.dateFrom && c.addedOn < f.dateFrom) return false;
    if (f.dateTo && c.addedOn > f.dateTo) return false;
  }
  // v0.6.15: B1 — фильтр по дате завершения аренды клиента.
  if (endRangeClientSet) {
    if (!endRangeClientSet.has(c.id)) return false;
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

export function Clients() {
  // v0.6.15: B1 — фильтр по дате завершения аренды клиента подключён
  // через endDateFrom/endDateTo. Множество clientId вычисляем ниже в
  // useMemo (endRangeClientSet) на основании списка аренд клиента.
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: "all",
    dateFrom: null,
    dateTo: null,
    endDateFrom: null,
    endDateTo: null,
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
  const [selectedId, setSelectedId] = useState<number>(17);
  /**
   * Открыл ли пользователь карточку САМ. На узком экране только тогда
   * список уступает ей место: предвыбранный клиент не должен встречать
   * оператора карточкой вместо списка.
   */
  const [narrowCardOpen, setNarrowCardOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [backTo, setBackTo] = useState<BackTarget | null>(null);

  useEffect(() => {
    const p = consumePending("clients");
    if (p?.clientId) setSelectedId(p.clientId);
    if (p?.from) setBackTo(p.from);
  }, []);

  // v0.6.15: B1 — множество clientId с арендой, чей endPlanned попадает
  // в выбранный диапазон. Если диапазон не задан — undefined (фильтр не
  // применяется). Парсим rental.endPlanned формата DD.MM.YYYY.
  const endRangeClientSet = useMemo<Set<number> | null>(() => {
    const ef = filters.endDateFrom ?? null;
    const et = filters.endDateTo ?? null;
    if (!ef && !et) return null;
    const set = new Set<number>();
    for (const r of rentals) {
      if (!r.endPlanned) continue;
      const [d, m, y] = r.endPlanned.split(".").map(Number);
      if (!d || !m || !y) continue;
      const endIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (ef && endIso < ef) continue;
      if (et && endIso > et) continue;
      set.add(r.clientId);
    }
    return set;
  }, [rentals, filters.endDateFrom, filters.endDateTo]);

  const filtered = useMemo(
    () =>
      clients
        .filter((c) =>
          matchClient(
            c,
            filters,
            activeSet,
            overdueSet,
            unreachable,
            endRangeClientSet,
          ),
        )
        .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    [
      clients,
      filters,
      activeSet,
      overdueSet,
      unreachable,
      endRangeClientSet,
    ],
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
          {/* Пункт 24: счётчик = сколько клиентов ПОД ФИЛЬТРОМ (раньше всегда
              показывал общее число и не менялся). При активном фильтре — «N из M». */}
          <span className="rounded-full bg-surface-soft px-3 py-1 text-[13px] font-semibold text-muted">
            {filtered.length}
            {filtered.length !== clients.length && (
              <span className="text-muted-2"> из {clients.length}</span>
            )}{" "}
            {/* «4 из 10 клиентов»: при фильтре склоняем по общему числу. */}
            {pluralClients(
              filtered.length !== clients.length
                ? clients.length
                : filtered.length,
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
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

      {/*
        Узкий экран (фидбэк 01.09): раньше карточка клиента падала ПОД
        список — открыл клиента и смотришь в хвост списка из десяти
        человек, карточку надо ещё найти прокруткой. Теперь ниже lg
        работает как на телефоне: выбрал клиента — список и его фильтры
        уступают место карточке, наверху кнопка «Назад к списку». Две
        колонки остаются там, где они реально помещаются.
      */}
      <div className={cn(narrowCardOpen && "hidden lg:block")}>
        <ApplicationsBlock />
      </div>

      <div className={cn(narrowCardOpen && "hidden lg:block")}>
        <ClientsFilters value={filters} onChange={setFilters} />
      </div>

      {filters.status === "applications" ? (
        <ApplicationsTab />
      ) : (
      <div className="grid flex-1 gap-4 lg:grid-cols-[360px_1fr]">
        <div className={cn("min-w-0", narrowCardOpen && "hidden lg:block")}>
          <ClientsList
            items={filtered}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setNarrowCardOpen(true);
            }}
          />
        </div>

        {(() => {
          const selected = clients.find((c) => c.id === selectedId);
          if (!selected) {
            return (
              <div className="hidden min-h-[400px] items-center justify-center rounded-2xl bg-surface p-10 text-center shadow-card-sm lg:flex">
                <div className="text-[13px] text-muted">
                  Выберите клиента из списка
                </div>
              </div>
            );
          }
          return (
            // На узком карточка живёт вместо списка — и только когда её
            // открыли; иначе она снова оказалась бы «в подвале» страницы.
            <div
              className={cn(
                "min-w-0 flex-col gap-2 lg:flex",
                narrowCardOpen ? "flex" : "hidden",
              )}
            >
              <button
                type="button"
                onClick={() => setNarrowCardOpen(false)}
                className="inline-flex h-10 w-fit items-center gap-1.5 rounded-full bg-surface px-4 text-[13px] font-semibold text-muted shadow-card-sm transition-colors hover:text-ink lg:hidden"
              >
                <ChevronLeft size={16} /> Назад к списку
              </button>
              <ClientCard key={selected.id} client={selected} />
            </div>
          );
        })()}
      </div>
      )}

      {addOpen && <AddClientModal onClose={() => setAddOpen(false)} />}
    </main>
  );
}

/** Пункт 24: склонение счётчика клиентов (1 клиент / 2 клиента / 5 клиентов). */
function pluralClients(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "клиент";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "клиента";
  return "клиентов";
}
