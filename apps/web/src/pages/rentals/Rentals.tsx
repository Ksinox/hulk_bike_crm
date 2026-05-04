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
import { useApiScooters } from "@/lib/api/scooters";
import { useApiPayments } from "@/lib/api/payments";
import { revenueFromPayments } from "@/lib/revenue";
import { currentBillingPeriod } from "@/lib/billingPeriod";
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
): boolean {
  // На вкладке «Все» показываем только живые аренды. Завершённые и
  // отменённые — это история, ей место в архиве. Завершённая аренда
  // авто-уезжает в архив (см. /complete в API), но если фронт вдруг
  // получит её до архивации — всё равно скрываем.
  // completed_damage НЕ считается finished — это «проблемная» активная
  // аренда у которой висит долг по акту. Она остаётся в активном списке
  // пока долг не погашен.
  const isFinished =
    r.status === "completed" || r.status === "cancelled";
  if (f === "all") return !isFinished;
  if (f === "active") return r.status === "active";
  if (f === "overdue") return r.status === "overdue";
  if (f === "return_today") {
    // Возврат именно сегодня — плановая дата завершения = сегодняшняя дата.
    // Учитываем активные и возвращаемые аренды.
    const isActiveOrReturning =
      r.status === "active" ||
      r.status === "returning" ||
      r.status === "overdue";
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
  if (f === "issue")
    return (
      r.status === "police" ||
      r.status === "court" ||
      r.status === "problem" ||
      // legacy: до v0.2.75 при создании акта аренда уходила в completed_damage,
      // теперь оставляем как есть для существующих записей (новые → 'problem').
      r.status === "completed_damage" ||
      unreachable.has(r.clientId)
    );
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
  const { data: payments } = useApiPayments();
  const { data: apiScooters = [] } = useApiScooters();
  // Пул скутеров, пригодных к сдаче в аренду — только 'rental_pool'
  const rentalPoolSize = apiScooters.filter(
    (s) => s.baseStatus === "rental_pool" && !s.archivedAt,
  ).length;
  const today = todayRu();
  const [filters, setFilters] = useState<FiltersState>({
    search: "",
    status: "all",
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  /**
   * После создания аренды — автоматически открываем превью документа
   * «Договор + акт». Сценарий: оператор создал → сразу нажал «Печать» →
   * подписал с клиентом. Сократили путь оформления.
   */
  const [autoDocRentalId, setAutoDocRentalId] = useState<number | null>(null);
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

  const filtered = useMemo(
    () =>
      rentals.filter(
        (r) =>
          matchStatus(r, filters.status, unreachable, today) &&
          matchSearch(r, filters.search, apiClients ?? []),
      ).sort((a, b) => {
        const sr = statusRank(a.status) - statusRank(b.status);
        if (sr !== 0) return sr;
        return b.id - a.id;
      }),
    [filters, rentals, unreachable, apiClients, today, rentalPoolSize],
  );

  const kpi = useMemo<Kpi[]>(() => {
    // Расчётный период — с 15-го одного месяца по 14-е следующего
    // включительно. Сервис в @/lib/billingPeriod — единая точка правды.
    const period = currentBillingPeriod();
    const periodStart = period.start;
    const periodEnd = period.end;
    const rangeLabel = period.label;

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
    // Выручка считается по фактическим платежам (paid=true, type!='deposit'),
    // а не по rental.sum — иначе при продлении (parent rental архивируется
    // и фильтр его исключает) сумма «теряется». Та же формула что в
    // useDashboardMetrics, через общую функцию revenueFromPayments.
    const periodRevenue = revenueFromPayments(
      payments ?? [],
      periodStart,
      periodEnd,
    );

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
  }, [rentals, payments]);

  return (
    <main className="flex min-w-0 flex-1 flex-col gap-4">
      <Topbar />

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
          return (
            <ErrorBoundary
              key={selected.id}
            >
              <RentalCard
                rental={selected}
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
            </ErrorBoundary>
          );
        })()}
      </div>

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
