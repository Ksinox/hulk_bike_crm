import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { type Rental, type RentalStatus } from "@/lib/mock/rentals";
import { RentalsFilters, type FiltersState } from "./RentalsFilters";
import { RentalsList } from "./RentalsList";
import { RentalsKpi, type Kpi } from "./RentalsKpi";
import { RentalCard, ActTransferPreview } from "./RentalCard";
import { DocumentPreviewModal } from "./DocumentPreviewModal";
import { consumePending, onNavigate } from "@/app/navigationStore";
import {
  getRentalChainIds,
  useRentals,
  useArchivedRentals,
} from "./rentalsStore";
import { useUnreachableSet } from "@/pages/clients/clientStore";
import { NewRentalModal } from "./NewRentalModal";
import { useApiClients } from "@/lib/api/clients";
import { useDebtAggregate } from "@/lib/api/debt";
import { useApiScooters } from "@/lib/api/scooters";
import { useBillingPeriodRevenue } from "@/lib/useRevenue";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import type { ApiClient } from "@/lib/api/types";
import {
  matchId,
  matchPhone,
  matchScooterName,
  matchText,
  normalizeQuery,
} from "@/lib/search";

/** Сегодня в формате DD.MM.YYYY (локальное время) */
function todayRu(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function matchStatus(
  r: Rental,
  f: FiltersState["status"],
  unreachable: Set<number>,
  today: string,
  /** v0.4.53: реальный долг по аренде (overdue+damage+manual без pending).
   *  Используется в фильтре «Просрочка» — если 0, не показываем аренду
   *  даже если endPlanned в прошлом. */
  realDebt?: number,
): boolean {
  // v0.4.47: фильтр «Активные» теперь означает ВСЕ живые аренды —
  // включая просроченные (просрочка это второй статус-маркер, не
  // основной). Раньше "active" показывал только status='active', что
  // путало: оператор фильтровал «активные», не видел тех у кого ещё
  // и просрочка, и думал что аренд меньше чем по факту. Также убран
  // отдельный фильтр «Все» — он теперь дубль «Активных».
  const isFinished =
    r.status === "completed" || r.status === "cancelled";
  // 'all' оставлен для обратной совместимости (если кто-то по URL
  // приехал) — работает идентично 'active'.
  if (f === "all" || f === "active") {
    // Все живые: active + overdue + returning + new_request + meeting +
    // problem + completed_damage + police + court. Не показываем только
    // completed/cancelled (они в архиве).
    return !isFinished;
  }
  if (f === "overdue") {
    // v0.3.8: фильтр «Просрочка» включает и status='overdue', и
    // status='active' с прошедшим endPlanned.
    // v0.4.53: ДОПОЛНИТЕЛЬНО проверяем реальный долг — если 0
    // (всё погашено или прощено), фильтр НЕ показывает аренду.
    if (realDebt !== undefined && realDebt <= 0) return false;
    if (r.status === "overdue") return true;
    if (r.status === "active") {
      const [d, m, y] = r.endPlanned.split(".").map(Number);
      const [td, tm, ty] = today.split(".").map(Number);
      const end = new Date(y!, m! - 1, d!).getTime();
      const todayMs = new Date(ty!, tm! - 1, td!).getTime();
      return end < todayMs;
    }
    return false;
  }
  if (f === "return_today") {
    // Возврат именно сегодня — плановая дата завершения = сегодняшняя
    // дата. v0.4.36: status='returning' включаем без проверки даты —
    // если оператор перевёл аренду в «возвращается», это явный сигнал
    // что клиент сегодня сдаёт, дата плана уже не критична.
    if (r.status === "returning") return true;
    const isActiveOrReturning =
      r.status === "active" || r.status === "overdue";
    return isActiveOrReturning && r.endPlanned === today;
  }
  if (f === "new_request") {
    // v0.3.7: «Новые» = аренды, ВЫДАННЫЕ сегодня (начало = сегодня)
    // и сейчас в обращении. Заявки/встречи переехали в Клиентов
    // (отдельный таб в ит.4).
    const isLive =
      r.status === "active" ||
      r.status === "overdue" ||
      r.status === "returning";
    return isLive && r.start === today;
  }
  if (f === "completed")
    return r.status === "completed" || r.status === "cancelled";
  if (f === "issue") {
    // v0.4.36: unreachable клиента засчитываем только для ЖИВЫХ аренд.
    // Раньше закрытая 3 месяца назад аренда «не отвечающего» клиента
    // висела в «Проблемные» и засоряла фильтр.
    const isFinishedStatus =
      r.status === "completed" || r.status === "cancelled";
    if (
      r.status === "police" ||
      r.status === "court" ||
      r.status === "problem" ||
      // legacy: до v0.2.75 при создании акта аренда уходила в completed_damage,
      // теперь оставляем как есть для существующих записей (новые → 'problem').
      r.status === "completed_damage"
    ) {
      return true;
    }
    return !isFinishedStatus && unreachable.has(r.clientId);
  }
  if (f === "archived") return true; // данные приходят из useArchivedRentals
  return true;
}

function matchSearch(r: Rental, q: string, clients: ApiClient[]): boolean {
  if (!q.trim()) return true;
  const query = normalizeQuery(q);
  const client = clients.find((c) => c.id === r.clientId);

  if (matchText(client?.name, query)) return true;
  if (matchPhone(client?.phone, query)) return true;
  if (matchScooterName(r.scooter, query)) return true;
  if (matchId(r.id, query)) return true;
  return false;
}

const STATUS_ORDER: RentalStatus[] = [
  "overdue",
  "returning",
  "meeting",
  "new_request",
  "active",
  "problem",
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
  const activeRentals = useRentals();
  const archivedList = useArchivedRentals();
  const unreachable = useUnreachableSet();
  const { data: apiClients } = useApiClients();
  const { data: apiScooters = [] } = useApiScooters();
  // v0.4.53: реальный долг по аренде для фильтра «Просрочка»
  const { data: debtAgg } = useDebtAggregate();
  const debtByRentalId = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of debtAgg ?? []) {
      m.set(
        d.rentalId,
        d.overdueBalance + d.damageBalance + d.manualBalance,
      );
    }
    return m;
  }, [debtAgg]);
  // v0.4.10: единый источник правды для выручки — общий хук, тот же
  // что использует и дашборд. Скоуп='rentals' оставлен на будущее
  // когда появятся другие модули с платежами (продажи/ремонты).
  const revenue = useBillingPeriodRevenue("rentals");
  // Пул скутеров, пригодных к сдаче в аренду — только 'rental_pool'
  const rentalPoolSize = apiScooters.filter(
    (s) => s.baseStatus === "rental_pool" && !s.archivedAt,
  ).length;
  const today = todayRu();
  // v0.6.15: B1 — фильтр «по дате завершения» (endPlannedAt) добавлен
  // через endDateFrom/endDateTo в FiltersState. dateFrom/dateTo
  // фильтруют по rental.start (дата выдачи), endDateFrom/endDateTo —
  // по rental.endPlanned (дата планового возврата).
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: "active",
    dateFrom: null,
    dateTo: null,
    endDateFrom: null,
    endDateTo: null,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  /**
   * После создания аренды — автоматически открываем превью документа
   * «Договор + акт». Сценарий: оператор создал → сразу нажал «Печать» →
   * подписал с клиентом. Сократили путь оформления.
   */
  const [autoDocRentalId, setAutoDocRentalId] = useState<number | null>(null);
  // v0.3.8: какой таб открыть в карточке (опционально — приходит через
  // navigate({ openTab: 'debt' }) с дашборда).
  const [pendingTab, setPendingTab] = useState<
    "terms" | "history" | "debt" | "tasks" | "docs" | null
  >(null);
  /**
   * После замены скутера — открываем превью акта замены поверх карточки.
   * State хранится здесь, а не в RentalCard, потому что после успешного
   * свапа старая аренда архивируется и пропадает из useApiRentals →
   * <ErrorBoundary key={selected.id}> ремаунтит RentalCard, и локальный
   * state потерялся бы (превью никогда не открылось бы). На этом уровне
   * state переживает любые ремаунты карточки.
   */
  const [swapActPreviewId, setSwapActPreviewId] = useState<number | null>(null);

  // Если выбрана вкладка «Архив» — берём архивный список, иначе обычный.
  const rentals =
    filters.status === "archived" ? archivedList : activeRentals;

  useEffect(() => {
    if (selectedId != null) return;
    // Если пришли через navigate({route:"rentals", rentalId}) — выберем
    // именно эту аренду. Иначе первую активную.
    const p = consumePending("rentals");
    if (p?.rentalId != null) {
      setSelectedId(p.rentalId);
      if (p.openTab) setPendingTab(p.openTab);
      return;
    }
    const first = rentals.find((r) => r.status === "active");
    setSelectedId(first?.id ?? rentals[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Слушаем навигацию: если уже на странице аренд, и кто-то вызвал
  // navigate({route:"rentals", rentalId: X}) (например после продления
  // в RentalCard), — переключаем фокус на X.
  useEffect(() => {
    return onNavigate((req) => {
      if (req.route === "rentals" && req.rentalId != null) {
        setSelectedId(req.rentalId);
        // openContract=true приходит при продлении — сразу открываем
        // превью документа с новыми датами для печати.
        if (req.openContract) {
          setAutoDocRentalId(req.rentalId);
        }
        if (req.openTab) {
          setPendingTab(req.openTab);
        }
      }
    });
  }, []);

  // Если выбранная связка пропала из активных (например, удалили её
  // через RentalEditModal или она ушла в архив) — пробуем переключить
  // фокус на любую другую active-связку из той же цепочки. Так карточка
  // не «закрывается» из-за удаления одной из замен/продлений: пользователь
  // продолжает видеть аренду на свежей живой связке. Если в цепочке
  // вообще не осталось active — selectedId остаётся прежним и колонка
  // показывает «Выберите аренду» (это уже корректное поведение для
  // целиком закрытой/архивной аренды).
  useEffect(() => {
    if (selectedId == null) return;
    if (activeRentals.find((r) => r.id === selectedId)) return;
    const all = [...activeRentals, ...archivedList];
    if (!all.find((r) => r.id === selectedId)) return;
    const chainIds = getRentalChainIds(selectedId, all);
    const activeInChain = activeRentals.filter((r) => chainIds.includes(r.id));
    if (activeInChain.length > 0) {
      // Берём самую свежую (наибольший id) — обычно это «голова» цепочки.
      const head = activeInChain.reduce((acc, r) =>
        r.id > acc.id ? r : acc,
      );
      setSelectedId(head.id);
    }
  }, [selectedId, activeRentals, archivedList]);

  const filtered = useMemo(() => {
    // v0.4.57: фильтр диапазона дат выдачи аренды через DateRangeFilter.
    // Старый PeriodFilter (по биллинговым периодам 15→14) выпилен —
    // оператор хотел произвольные диапазоны через календарь. Теперь
    // dateFrom/dateTo (ISO YYYY-MM-DD) — границы включительно по дате
    // выдачи (rental.start).
    const inPeriod = (r: Rental): boolean => {
      if (!filters.dateFrom && !filters.dateTo) return true;
      const [d, m, y] = r.start.split(".").map(Number);
      // r.start формата DD.MM.YYYY → собираем ISO для лексикографического
      // сравнения с dateFrom/dateTo (ISO).
      const startIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (filters.dateFrom && startIso < filters.dateFrom) return false;
      if (filters.dateTo && startIso > filters.dateTo) return false;
      return true;
    };
    // v0.6.15: B1 — фильтр по дате завершения (endPlanned).
    const inEndPeriod = (r: Rental): boolean => {
      const ef = filters.endDateFrom ?? null;
      const et = filters.endDateTo ?? null;
      if (!ef && !et) return true;
      const [d, m, y] = r.endPlanned.split(".").map(Number);
      if (!d || !m || !y) return false;
      const endIso = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      if (ef && endIso < ef) return false;
      if (et && endIso > et) return false;
      return true;
    };
    return rentals
      .filter(
        (r) =>
          matchStatus(
            r,
            filters.status,
            unreachable,
            today,
            debtByRentalId.get(r.id),
          ) &&
          matchSearch(r, filters.search, apiClients ?? []) &&
          inPeriod(r) &&
          inEndPeriod(r),
      )
      .sort((a, b) => {
        const sr = statusRank(a.status) - statusRank(b.status);
        if (sr !== 0) return sr;
        return b.id - a.id;
      });
  }, [filters, rentals, unreachable, apiClients, today, rentalPoolSize]);

  const kpi = useMemo<Kpi[]>(() => {
    // v0.4.10: период и сумма выручки приходят из useBillingPeriodRevenue —
    // того же хука что использует дашборд. Раньше каждая страница считала
    // период и фильтр сама → при малейшем расхождении кода — разные суммы.
    const rangeLabel = revenue.period.label;

    // Активная аренда без скутера — это «призрак» (артефакт старых данных
    // или неправильно созданная заявка). Не считаем её — иначе бейдж
    // расходится с дашбордом и физическим положением парка.
    // Аренды в returning тоже считаем активными — скутер всё ещё у клиента
    // или принимается, сделка не закрыта. Overdue тоже сюда.
    const active = rentals.filter(
      (r) =>
        (r.status === "active" ||
          r.status === "overdue" ||
          r.status === "returning") &&
        r.scooter,
    ).length;
    const overdue = rentals.filter((r) => r.status === "overdue").length;
    const returningToday = rentals.filter(
      (r) =>
        r.status === "returning" ||
        (r.status === "active" && r.endPlanned === todayRu()),
    ).length;
    const overdueDebt = rentals
      .filter((r) => r.status === "overdue")
      .reduce((s, r) => s + (r.sum ?? 0), 0);
    const periodRevenue = revenue.total;

    return [
      {
        label: "Активных",
        value: String(active),
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
        // Точная сумма без округления — заказчик специально просил, в
        // бухгалтерии «33 тыс» вместо «33 400» создаёт путаницу.
        value: `${periodRevenue.toLocaleString("ru-RU")} ₽`,
        hint: rangeLabel,
        tone: "purple",
      },
    ];
  }, [rentals, revenue]);

  const selectedRental = rentals.find((r) => r.id === selectedId) ?? null;

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

      {!selectedRental && (
        <>
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-baseline gap-3">
              <h1 className="font-display text-[34px] font-extrabold leading-none text-ink">
                Аренды
              </h1>
              <span className="rounded-full bg-surface-soft px-3 py-1 text-[13px] font-semibold text-muted">
                {
                  rentals.filter(
                    (r) =>
                      (r.status === "active" ||
                        r.status === "overdue" ||
                        r.status === "returning") &&
                      r.scooter,
                  ).length
                }{" "}
                активных
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
        </>
      )}

      {/* v0.6.38: layout зависит от того, выбрана ли аренда.
            • Выбрана → карточка раскрывается на ВСЮ ширину, список скрыт.
            • Не выбрана → список во всю ширину; карточка не рендерится.
          Это даёт focus mode карточке: вся ширина под layout 2-col. */}
      {(() => {
        const selected = selectedRental;
        return (
          <div className="flex flex-1 flex-col gap-4">
            {!selected && (
              <RentalsList
                items={filtered}
                selectedId={selectedId}
                onSelect={setSelectedId}
              />
            )}
            {selected && (
              <ErrorBoundary key={selected.id}>
                <div className="animate-in fade-in slide-in-from-right-4 duration-300 min-w-0">
                  <RentalCard
                    rental={selected}
                    initialTab={pendingTab ?? undefined}
                    onClose={() => setSelectedId(null)}
                    onSwapped={(newId) => {
                      // Свап успешен: одновременно (1) переключаем фокус
                      // на новую связку — старая ушла в архив и пропадёт
                      // из списка, (2) поднимаем превью акта замены поверх
                      // карточки. RentalCard ремаунтится с key=newId, но
                      // превью живёт в state Rentals и переживает ремаунт.
                      setSelectedId(newId);
                      setSwapActPreviewId(newId);
                    }}
                  />
                </div>
              </ErrorBoundary>
            )}
          </div>
        );
      })()}

      {swapActPreviewId != null && (
        <ActTransferPreview
          rentalId={swapActPreviewId}
          onClose={() => setSwapActPreviewId(null)}
        />
      )}

      {newOpen && (
        <NewRentalModal
          onClose={() => setNewOpen(false)}
          onCreated={(r) => {
            setSelectedId(r.id);
            setAutoDocRentalId(r.id);
          }}
        />
      )}

      {autoDocRentalId != null && (
        <AutoContractPreview
          rentalId={autoDocRentalId}
          onClose={() => setAutoDocRentalId(null)}
        />
      )}
    </main>
  );
}

/**
 * Автоматическое превью договора+акта после создания аренды.
 * Грузит свежий документ с API и сразу даёт кнопку «Печать».
 * Используется в Rentals при onCreated — оператор не должен искать
 * документ в табе «Документы», всё под рукой.
 */
function AutoContractPreview({
  rentalId,
  onClose,
}: {
  rentalId: number;
  onClose: () => void;
}) {
  const API_BASE =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  const htmlUrl = `${API_BASE}/api/rentals/${rentalId}/document/contract_full`;
  const docxUrl = `${API_BASE}/api/rentals/${rentalId}/document/contract_full?format=docx`;
  const id = String(rentalId).padStart(4, "0");
  return (
    <DocumentPreviewModal
      title={`Договор + Акт по аренде #${id}`}
      htmlUrl={htmlUrl}
      docxUrl={docxUrl}
      docxFilename={`Договор_и_акт_${id}.doc`}
      onClose={onClose}
    />
  );
}
