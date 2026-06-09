import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  Search,
  PanelRightOpen,
  LayoutGrid,
  Rows3,
} from "lucide-react";
import { Topbar } from "@/pages/dashboard/Topbar";
import { type Rental, type RentalStatus } from "@/lib/mock/rentals";
import {
  RentalsFilters,
  type FiltersState,
} from "./RentalsFilters";
import { RentalsList } from "./RentalsList";
import { RentalsKpi, type Kpi } from "./RentalsKpi";
import { RentalCard, ActTransferPreview, RentalHistoryColumn } from "./RentalCard";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/useIsMobile";
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
import { isElectron } from "@/platform";
import { PaymentAcceptDialog } from "./PaymentAcceptDialog";
import { RevenueListModal } from "@/pages/dashboard/RevenueListModal";
import type { ApiClient } from "@/lib/api/types";
import {
  matchId,
  matchPhone,
  matchScooterName,
  matchText,
  normalizeQuery,
} from "@/lib/search";
import { useMe } from "@/lib/api/auth";
import {
  loadRentalsViewMode,
  saveRentalsViewMode,
  type RentalsViewMode,
} from "./rentalsViewMode";

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
  // v0.8.34 (F4): полный долг по аренде (totalDebt = overdue+damage+manual+
  // parking) — тот же источник, что использует дашборд для KPI «Долг по
  // просрочкам». Раньше KPI стр. Аренды считал просрочку по
  // status==='overdue' (статус удалён из БД в v0.5) → плитки «Просрочек» и
  // «Долг по просрочкам» всегда показывали 0. Приводим к логике дашборда:
  // просрочка = active с прошедшим endPlanned и реальным долгом > 0.
  const totalDebtByRentalId = useMemo(() => {
    const m = new Map<number, number>();
    for (const d of debtAgg ?? []) m.set(d.rentalId, d.totalDebt);
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
  // v0.7.2: карточка теперь push-панель (сдвигает список), а не overlay.
  // panelOpen управляет видимостью панели независимо от selectedId:
  // оператор может скрыть панель (список растянется на всю ширину),
  // при этом выбранная строка остаётся подсвеченной. По умолчанию открыта.
  const [panelOpen, setPanelOpen] = useState(true);
  // v0.7.3: Payment-панель поднята на уровень страницы — рендерится как
  // третья колонка справа от карточки (push, не overlay). paymentRentalId
  // хранит id связки, по которой принимаем оплату (может отличаться от
  // selectedId — например, после продления фокус на новой связке).
  const [paymentRentalId, setPaymentRentalId] = useState<number | null>(null);
  // v0.9.4: дата оплаты (back-date) из окна «Принять платёж». Прокидываем в
  // карточку → её календарь якорит превью продления на max(plannedEnd, дата
  // оплаты), синхронно с «новым возвратом» в окне (раньше календарь рисовал
  // продление «от сегодня», окно — «от даты оплаты» → визуальный рассинхрон).
  const [paymentDateIso, setPaymentDateIso] = useState<string | null>(null);
  // v0.7.3: число дней продления (синхрон календарь карточки ↔ Payment-
  // колонка) + сигнал сброса календаря при закрытии Payment.
  const [paymentExtDays, setPaymentExtDays] = useState(0);
  const [calendarResetSignal, setCalendarResetSignal] = useState(0);
  // v0.7.9: история аренды — четвёртая push-колонка (как Payment). Хранит
  // id связки, по которой открыта полная история. Взаимоисключение с
  // Payment: открытие истории закрывает Payment и наоборот.
  const [historyRentalId, setHistoryRentalId] = useState<number | null>(null);
  // v0.8.8: стартовый фильтр истории (напр. «money» из «За всё время»).
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "extend" | "swap" | "equipment" | "money" | undefined
  >(undefined);
  const openPayment = (rentalId: number, extDays: number) => {
    setHistoryRentalId(null); // взаимоисключение с историей
    setPaymentExtDays(extDays);
    setPaymentRentalId(rentalId);
  };
  const closePayment = () => {
    setPaymentRentalId(null);
    setPaymentDateIso(null);
    setPaymentExtDays(0);
    // Бампаем сигнал — календарь карточки обнулит drag-extend.
    setCalendarResetSignal((n) => n + 1);
  };
  const openHistory = (
    rentalId: number,
    filter?: "all" | "extend" | "swap" | "equipment" | "money",
  ) => {
    closePayment(); // взаимоисключение с Payment
    setHistoryFilter(filter);
    setHistoryRentalId(rentalId);
  };
  const closeHistory = () => setHistoryRentalId(null);
  const [newOpen, setNewOpen] = useState(false);
  // v0.6.44: блок RentalsFilters (поповеры дат, набор табов) скрыт по
  // умолчанию — header'а нового дизайна достаточно. Открывается кнопкой
  // SlidersHorizontal справа от поиска.
  // v0.7.22: режим списка (таблица/плитки) — пер-пользовательское
  // предпочтение. До загрузки me берём дефолт, затем подтягиваем выбор
  // конкретного пользователя (у директора и админа он независим).
  const { data: me } = useMe();
  const [viewMode, setViewMode] = useState<RentalsViewMode>(() =>
    loadRentalsViewMode(undefined),
  );
  useEffect(() => {
    if (me?.id != null) setViewMode(loadRentalsViewMode(me.id));
  }, [me?.id]);
  // F20: ширину блока аренд фиксирует СПИСОК (таблица) — он источник истины.
  // RentalsList в режиме list измеряет фактическую ширину таблицы через
  // ResizeObserver и отдаёт её сюда. Контейнер применяет это значение как
  // фиксированную ширину в ОБОИХ режимах, поэтому при переключении
  // список↔плитки блок не «дёргается»: плитки занимают ровно ту ширину,
  // что занимал список. Значение динамическое (зависит от набора колонок),
  // ничего не хардкодим. До первого измерения — null (fallback на w-fit).
  const [listWidth, setListWidth] = useState<number | null>(null);
  const handleMeasureWidth = (w: number) => {
    setListWidth((prev) => (prev === w ? prev : w));
  };
  const changeViewMode = (m: RentalsViewMode) => {
    if (m === viewMode) return;
    saveRentalsViewMode(me?.id, m);
    // v0.8.20 (E6): морфинг список↔плитки через View Transitions API —
    // браузер сам «перетекает» каждую строку в карточку (по
    // view-transition-name='rental-<id>'). Fallback — мгновенно.
    const doc = document as Document & {
      startViewTransition?: (cb: () => void) => void;
    };
    if (doc.startViewTransition) {
      doc.startViewTransition(() => flushSync(() => setViewMode(m)));
    } else {
      setViewMode(m);
    }
  };
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
  // v0.9.3: полноэкранная сводка выручки (клик по KPI-плашке «Выручка»).
  const [revenueOpen, setRevenueOpen] = useState(false);

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
        setPanelOpen(true);
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
    // v0.8.34 (F4): просрочка считается как на дашборде — аренда «active»
    // (или легаси-статус 'overdue') с прошедшей плановой датой возврата
    // И реальным долгом > 0. status='overdue' удалён из БД в v0.5, поэтому
    // прежний фильтр r.status==='overdue' всегда давал 0. Долг берём из
    // того же агрегата (totalDebt), что и дашборд, а не из rental.sum.
    const [td, tm, ty] = today.split(".").map(Number);
    const todayMs = new Date(ty!, tm! - 1, td!).getTime();
    const isOverdue = (r: Rental): boolean => {
      const debt = totalDebtByRentalId.get(r.id);
      if (debt !== undefined && debt <= 0) return false;
      if (r.status === "overdue") return true;
      if (r.status !== "active") return false;
      const [d, m, y] = r.endPlanned.split(".").map(Number);
      if (!d || !m || !y) return false;
      return new Date(y, m - 1, d).getTime() < todayMs;
    };
    const overdueRentals = rentals.filter(isOverdue);
    const overdue = overdueRentals.length;
    const returningToday = rentals.filter(
      (r) =>
        r.status === "returning" ||
        (r.status === "active" && r.endPlanned === todayRu()),
    ).length;
    const overdueDebt = overdueRentals.reduce(
      (s, r) => s + (totalDebtByRentalId.get(r.id) ?? 0),
      0,
    );
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
        // v0.9.3: клик → полноэкранная сводка выручки по арендам.
        onClick: () => setRevenueOpen(true),
      },
    ];
  }, [rentals, revenue, today, totalDebtByRentalId]);

  // v0.7.2: push-панель — карточка выбранной аренды живёт в потоке справа
  // и сдвигает/сжимает список (не overlay, не затемнение). Панель можно
  // скрыть вручную (panelOpen=false) — список растянется на всю ширину,
  // выбранная строка останется подсвеченной. Клик по строке снова
  // открывает панель. Раньше (v0.7.0) была fixed overlay-drawer.
  const selected = rentals.find((r) => r.id === selectedId) ?? null;
  // v0.7.3: высота прилипающих колонок (карточка/payment) = высота вьюпорта
  // минус electron-titlebar (36px). В web — чистые 100vh. Так footer карточки
  // и payment всегда виден: скроллится только внутреннее тело колонки.
  const panelHeight = isElectron ? "calc(100vh - 36px)" : "100vh";
  // v0.9.3: на мониторах уже ~2000px три push-колонки (список 700 + карточка
  // 600 + приёмка 480 + отступы ≈ 1860) не помещаются — приёмка-колонка
  // (крайняя справа) уезжала за край и обрезалась `overflow-hidden`, оператор
  // не видел шаг «Когда поступила оплата?» и продлевал «от сегодня». На таких
  // экранах приёмку рендерим как fixed-оверлей справа (всегда влезает,
  // 480px / 95vw), на широких — как раньше push-колонкой.
  const narrowDesktop = useIsMobile(2000);
  // v0.7.3: payment-связка должна существовать в текущем списке. Если её нет
  // (например, ушла в архив) — колонка не рендерится.
  const paymentRental =
    paymentRentalId != null
      ? rentals.find((r) => r.id === paymentRentalId) ?? null
      : null;
  // v0.7.5: «последняя» оплачиваемая связка — держим контент Payment-колонки
  // смонтированным во время exit-анимации (width 480→0). При закрытии
  // paymentRental становится null мгновенно, но lastPaymentRental ещё
  // хранит связку ~320ms, пока ширина едет в 0 — уезд получается плавным.
  const [lastPaymentRental, setLastPaymentRental] = useState<Rental | null>(
    null,
  );
  useEffect(() => {
    if (paymentRental) {
      setLastPaymentRental(paymentRental);
      return;
    }
    // Закрытие — снимаем контент после завершения transition (320ms).
    const t = window.setTimeout(() => setLastPaymentRental(null), 320);
    return () => window.clearTimeout(t);
  }, [paymentRental]);
  // v0.7.9: история-связка должна существовать в текущем списке.
  const historyRental =
    historyRentalId != null
      ? rentals.find((r) => r.id === historyRentalId) ?? null
      : null;
  // Держим id истории смонтированным во время exit-анимации (width 420→0),
  // чтобы уезд был плавным (аналогично lastPaymentRental).
  const [lastHistoryId, setLastHistoryId] = useState<number | null>(null);
  useEffect(() => {
    if (historyRental) {
      setLastHistoryId(historyRental.id);
      return;
    }
    const t = window.setTimeout(() => setLastHistoryId(null), 320);
    return () => window.clearTimeout(t);
  }, [historyRental]);
  // Выбор строки: подсветить + всегда открыть панель (даже если была скрыта).
  // v0.7.3: при переходе на другую аренду закрываем Payment-колонку, чтобы
  // не висела открытая оплата от прежней связки.
  const handleSelect = (id: number) => {
    if (id !== selectedId) {
      closePayment();
      closeHistory();
    }
    setSelectedId(id);
    setPanelOpen(true);
  };
  return (
    <main
      className="flex min-w-0 flex-1 flex-col gap-4 overflow-hidden p-4 lg:p-6"
      // v0.7.3: страница фиксирована по высоте вьюпорта (минус electron-
      // titlebar). overflow-hidden запрещает скролл всей страницы — вместо
      // этого скроллятся внутренние области колонок (список / тело карточки /
      // тело payment), а их header'ы и footer'ы остаются на месте.
      style={{ height: panelHeight }}
    >
      <Topbar />

      {/* v0.6.50: KPI-плашки (5 шт) — Активные / Просрочки / Возврат
          сегодня / Долг по просрочкам / Выручка. Над основным блоком. */}
      <RentalsKpi items={kpi} />

      {/* ======== Split: список + push-панель карточки ========
          v0.7.27: justify-center — группа [список(+карточка)] центрируется
          по экрану. В режиме «Список» блок ограничен max-w → грузится по
          центру (без карточки) либо группой с карточкой; в «Плитках» блок
          заполняет ширину (max-w большой). При смене режима max-width
          анимируется → плавное расширение/сжатие. */}
      <div className="flex h-full min-h-0 flex-1 justify-center gap-0">
        {/* Левая часть — единый белый блок: header+поиск+чипы+список.
            v0.7.25: в режиме «Список» (таблица) блок сжимается до ~880px
            (ширина под фильтры в одну строку + таблицу), карточка
            придвигается вплотную, лишнее место уходит вправо за карточку.
            В «Плитках» — заполняет всю доступную ширину (flex-1). */}
        <div
          className={cn(
            "flex min-w-0 flex-col rounded-2xl bg-surface shadow-card-sm overflow-hidden min-h-0 transition-[width] duration-300 ease-in-out",
            // v0.8.33 (K2): адаптивная ширина по содержимому. Блок-карточка
            // ровно по ширине таблицы (списка) / сетки плиток — без пустого
            // хвоста справа. Добавили колонку → блок расширился, убрали →
            // сжался. Минимум 700px — чтобы при пустом списке/узкой таблице
            // шапка (поиск + переключатель + фильтры) не схлопывалась.
            // F20: w-fit оставлен ТОЛЬКО как fallback до первого измерения
            // ширины таблицы. Как только listWidth известна — она задаётся
            // инлайном (style.width) и фиксирует ширину в ОБОИХ режимах, так
            // что переключение список↔плитки больше не меняет ширину блока
            // (источник истины — список). min-w/max-w сохраняем как границы.
            listWidth == null && "w-fit",
            // Адаптив ноутбуков: на узких (<1536) пол списка ниже, чтобы
            // список + карточка помещались без горизонтального скролла.
            "min-w-[560px] 2xl:min-w-[700px] max-w-full",
          )}
          style={listWidth != null ? { width: `${listWidth}px` } : undefined}
        >
          <div className="flex flex-col gap-3 p-4 pb-3 border-b border-border">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[26px] font-extrabold leading-none text-ink">
                Аренды
              </h1>
              {/* v0.7.2: когда панель скрыта, но аренда выбрана — вкладка
                  «Показать карточку» возвращает панель. */}
              {selected && !panelOpen && (
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1.5 text-[12px] font-semibold text-blue-700 hover:bg-blue-100"
                  title="Показать карточку аренды"
                >
                  <PanelRightOpen size={14} /> Показать карточку
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-[160px] flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-2"
                />
                <input
                  type="text"
                  value={filters.search}
                  onChange={(e) =>
                    setFilters({ ...filters, search: e.target.value })
                  }
                  placeholder="Поиск аренды, клиента, скутера…"
                  className="h-9 w-full rounded-full bg-surface-soft pl-9 pr-3 text-[13px] text-ink outline-none placeholder:text-muted-2 focus:ring-2 focus:ring-blue-100"
                />
              </div>
              {/* v0.7.22: переключатель вида списка — две иконки (список /
                  плитки). Выбор запоминается пер-пользователь. */}
              <div className="flex shrink-0 items-center rounded-full bg-surface-soft p-0.5">
                <button
                  type="button"
                  onClick={() => changeViewMode("list")}
                  title="Список (таблица)"
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
              {/* v0.8.11: синяя «+» убрана отсюда. Создание аренды теперь —
                  плитка-заглушка в режиме «Плитки» и пункт меню/иные точки. */}
            </div>

            {/* v0.7.23: фильтры всегда видимы единым рядом (страница
                full-width — прятать незачем). */}
            <RentalsFilters value={filters} onChange={setFilters} />
          </div>

          {/* Список аренд — строки внутри того же блока, без рамок.
              v0.8.24: view-transition-name на контейнере → при смене режима
              область плавно «перетекает» cross-fade'ом (а не морфингом строк). */}
          <div className="flex-1 min-h-0" style={{ viewTransitionName: "rentals-area" }}>
            <RentalsList
              items={filtered}
              selectedId={selectedId}
              onSelect={handleSelect}
              viewMode={viewMode}
              onNew={() => setNewOpen(true)}
              onMeasureWidth={handleMeasureWidth}
            />
          </div>
        </div>

        {/* ======== КАРТОЧКА АРЕНДЫ = PUSH-ПАНЕЛЬ (v0.7.2) ========
            В потоке справа, сжимает список. «Скрыть» (onClose) убирает
            панель, selectedId не сбрасывается (строка остаётся выбранной).
            v0.7.3: фикс. высота вьюпорта + overflow-hidden + min-h-0 —
            footer карточки всегда виден, скроллится только её тело. */}
        {/* v0.7.5: width-transition вместо mount/unmount — панель плавно
            «подъезжает» (0→760px) и «уезжает» (760→0). Контейнер всегда в
            DOM, анимируется width+opacity. Контент держим смонтированным
            пока выбрана аренда (selected != null), даже когда панель скрыта
            (panelOpen=false) — тогда ширина едет в 0, контент уезжает за
            overflow-hidden, exit-анимация плавная. Внутренний враппер имеет
            фикс. ширину 760px чтобы при сжатии контента не корёжило. */}
        <div
          className={cn(
            // v0.8.18: вернули overflow-hidden — карточка снова со скруглением
            // и клиппингом. Стикеры теперь рендерятся порталом поверх (см.
            // RentalCard), поэтому им клиппинг не мешает.
            "h-full min-h-0 shrink-0 overflow-hidden transition-[width,opacity,margin] duration-300 ease-in-out",
            selected && panelOpen
              ? "ml-4 w-[520px] 2xl:w-[600px] opacity-100"
              : "ml-0 w-0 opacity-0",
          )}
        >
          {selected && (
            <div className="flex h-full min-h-0 w-[520px] 2xl:w-[600px] flex-col overflow-hidden rounded-2xl border-l border-border bg-surface shadow-card-sm">
              <ErrorBoundary key={selected.id}>
                <RentalCard
                  rental={selected}
                  initialTab={pendingTab ?? undefined}
                  drawerChrome
                  besideDrawerOpen={
                    paymentRentalId != null ||
                    historyRentalId != null ||
                    !panelOpen
                  }
                  onClose={() => setPanelOpen(false)}
                  onRequestPayment={openPayment}
                  paymentOpen={paymentRentalId === selected.id}
                  onOpenHistory={openHistory}
                  paymentExtDays={paymentExtDays}
                  paymentDateIso={paymentDateIso}
                  paymentResetSignal={calendarResetSignal}
                  onSwapped={(newId) => {
                    setSelectedId(newId);
                    setPanelOpen(true);
                    setSwapActPreviewId(newId);
                  }}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>

        {/* ======== PAYMENT = ТРЕТЬЯ PUSH-КОЛОНКА (v0.7.3) ========
            Открывается по «Принять оплату» / drag-to-extend на календаре
            карточки. В потоке справа (не overlay) — сдвигает карточку влево
            и сжимает список. Своя фикс. высота вьюпорта + внутренний скролл
            (footer «Отмена»/«Принять» — часть тела диалога, inline-режим). */}
        {/* v0.7.5: width-transition. Контейнер всегда в DOM; ширина едет
            0↔480px при открытии/закрытии. Контент = lastPaymentRental, он
            переживает exit-анимацию (см. useEffect выше). */}
        <div
          className={cn(
            "h-full min-h-0 shrink-0 overflow-hidden transition-[width,opacity,margin] duration-300 ease-in-out",
            paymentRental && !narrowDesktop
              ? "ml-4 w-[480px] opacity-100"
              : "ml-0 w-0 opacity-0",
          )}
        >
          {!narrowDesktop && lastPaymentRental && (
            <div className="flex h-full min-h-0 w-[480px] flex-col overflow-hidden">
              <ErrorBoundary key={`pay-${lastPaymentRental.id}`}>
                <PaymentAcceptDialog
                  rental={lastPaymentRental}
                  inline
                  initialExtDays={paymentExtDays || undefined}
                  onExtDaysChange={setPaymentExtDays}
                  onPaymentDateChange={setPaymentDateIso}
                  onClose={closePayment}
                  onPaid={() => {
                    /* invalidations происходят внутри диалога */
                  }}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>

        {/* v0.9.3: узкий монитор — приёмку рендерим fixed-оверлеем справа
            (push-колонка не помещается, шаг «Когда поступила оплата?» уезжал
            за край). PaymentAcceptDialog без `inline` сам рисует slide-in
            drawer (w-[min(95vw,480px)]) — всегда влезает и доступен. */}
        {narrowDesktop && paymentRental && (
          <ErrorBoundary key={`pay-ovl-${paymentRental.id}`}>
            <PaymentAcceptDialog
              rental={paymentRental}
              initialExtDays={paymentExtDays || undefined}
              onExtDaysChange={setPaymentExtDays}
              onPaymentDateChange={setPaymentDateIso}
              onClose={closePayment}
              onPaid={() => {
                /* invalidations происходят внутри диалога */
              }}
            />
          </ErrorBoundary>
        )}

        {/* ======== ИСТОРИЯ = PUSH-КОЛОНКА (v0.7.9) ========
            Открывается по «Все события →» в карточке. В потоке справа
            (не overlay) — сдвигает карточку влево. Взаимоисключение с
            Payment (открытие одной закрывает другую). Width-transition
            0↔420px, контент держим смонтированным во время exit-анимации. */}
        <div
          className={cn(
            "h-full min-h-0 shrink-0 overflow-hidden transition-[width,opacity,margin] duration-300 ease-in-out",
            historyRental
              ? "ml-4 w-[360px] 2xl:w-[420px] opacity-100"
              : "ml-0 w-0 opacity-0",
          )}
        >
          {lastHistoryId != null && (
            <div className="flex h-full min-h-0 w-[360px] 2xl:w-[420px] flex-col overflow-hidden">
              <ErrorBoundary key={`hist-${lastHistoryId}`}>
                <RentalHistoryColumn
                  rentalId={lastHistoryId}
                  onClose={closeHistory}
                  initialFilter={historyFilter}
                />
              </ErrorBoundary>
            </div>
          )}
        </div>
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
            // v0.9.4: договор теперь открывает сама NewRentalModal (единый
            // flow для всех точек входа). Здесь только фокусируемся на новой
            // аренде — иначе превью договора открылось бы дважды.
            setSelectedId(r.id);
            setNewOpen(false);
          }}
        />
      )}

      {autoDocRentalId != null && (
        <AutoContractPreview
          rentalId={autoDocRentalId}
          onClose={() => setAutoDocRentalId(null)}
        />
      )}

      {/* v0.9.3: клик по KPI «Выручка» → полноэкранная сводка по арендам.
          v0.9.4: клик по платежу открывает аренду в ПАНЕЛИ страницы
          (handleSelect), а не в глобальном drawer — иначе карточка
          дублировалась поверх уже открытой панели. */}
      {revenueOpen && (
        <RevenueListModal
          initialPeriod="month"
          scope="rentals"
          onRowClick={(id) => handleSelect(id)}
          onClose={() => setRevenueOpen(false)}
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
