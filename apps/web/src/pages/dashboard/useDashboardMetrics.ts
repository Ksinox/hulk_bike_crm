/**
 * Агрегирует данные для дашборда из реальных API-запросов.
 * Всё считается на клиенте из `useApiRentals`/`useApiScooters`/`useApiPayments`/`useApiClients` —
 * никаких моков. Пустые состояния (0 скутеров, 0 аренд) — норма.
 */
import { useMemo } from "react";
import { useApiClients } from "@/lib/api/clients";
import { useApiRentals } from "@/lib/api/rentals";
import { useApiScooters } from "@/lib/api/scooters";
import { useApiPayments, type ApiPayment } from "@/lib/api/payments";
import { useAllDamageReports } from "@/lib/api/damage-reports";
import type { ApiRental, ApiScooter } from "@/lib/api/types";
import { currentBillingPeriod } from "@/lib/billingPeriod";
import { useBillingPeriodRevenue } from "@/lib/useRevenue";

export type DashboardMetrics = {
  isLoading: boolean;

  // «есть ли вообще данные»
  hasAnyData: boolean;
  hasScooters: boolean;
  hasRentals: boolean;

  // KPI
  /** Прогноз поступлений на сегодня — суммарная rental.sum по
   *  возвращающим сегодня. Идея: клиенты обычно продлевают примерно
   *  на ту же сумму. Если кто-то уже вернул/продлил — он уходит из
   *  returnsToday и его сумма пропадает. Точная сумма после продления
   *  попадает в выручку через payments. */
  todayIncoming: number;
  /** Число аренд возвращающих сегодня (потенциальные продления). */
  todayIncomingCount: number;
  todayIncomingDelta: number | null; // относительный прирост vs вчера, %

  overdueCount: number;
  overdueSum: number;
  overdueDeltaFromYesterday: number; // +1 / 0

  activeRentalsCount: number;
  fleetTotal: number;
  loadPercent: number; // 0..100

  tasksToday: number; // пока 0 — задач ещё нет в API

  // Парк по статусам
  park: {
    total: number;
    inRental: number;
    ready: number;
    inRepair: number;
    forSale: number;
    sold: number;
  };

  // Возвраты сегодня
  returnsToday: ReturnItem[];

  // Просрочки
  overdue: OverdueItem[];

  /**
   * Множества rentalId — для других виджетов где rentalId это первичный
   * ключ (например OverdueTable).
   */
  overdueRentalIds: Set<number>;
  damageDebtRentalIds: Set<number>;
  returnsTodayRentalIds: Set<number>;

  /**
   * Множества scooterId — для подсветки плиток в ParkPanel. Считаются
   * НАПРЯМУЮ по rentals, без промежуточной свёртки rentalId↔scooterId
   * через Map (которая теряла кейсы когда у скутера >1 активной записи
   * в БД из легаси-данных). v0.2.96.
   */
  overdueScooterIds: Set<number>;
  damageDebtScooterIds: Set<number>;
  returnsTodayScooterIds: Set<number>;
  /**
   * v0.2.99: «опаздывает по времени сегодня» — endPlannedAt's date == today
   * И время уже прошло. Это ещё НЕ просрочка (она с завтрашнего дня), но
   * предупреждение для оператора что клиент превышает запланированное время.
   * На дашборде такая плитка жёлтая.
   */
  pastDueTodayScooterIds: Set<number>;

  /**
   * Карты scooterId → rentalId для кликов в ParkPanel: умная навигация
   * открывает именно ту аренду, из-за которой плитка подсвечена. v0.2.97.
   *  - overdueRentalByScooter: первая найденная просрочка
   *  - returnsTodayRentalByScooter: первая найденная возвращаемая сегодня
   *  - damageDebtRentalByScooter: первая аренда с долгом по ущербу
   *  - anyActiveRentalByScooter: любая открытая аренда (active/overdue/
   *    returning) — fallback если ни один флаг не сработал.
   */
  overdueRentalByScooter: Map<number, number>;
  returnsTodayRentalByScooter: Map<number, number>;
  damageDebtRentalByScooter: Map<number, number>;
  anyActiveRentalByScooter: Map<number, number>;

  /**
   * Дубли активных аренд: scooterId → массив rentalId, у которых одно-
   * временно открытое состояние (active/overdue/returning). Если в массиве
   * >1 элемента — есть data-inconsistency, показываем баннер. v0.2.97.
   */
  duplicateActiveByScooter: { scooterId: number; rentalIds: number[] }[];

  // Выручка — для графика (пока только агрегаты за месяц)
  revenueMonth: number; // реально получено (подтверждённые платежи)
  revenueMonthCount: number;
  /**
   * Ожидаемая выручка — суммы аренд этого месяца, по которым платёж ещё
   * не зафиксирован. Это «то, что должно прийти, но админ забыл нажать
   * Подтвердить оплату». Помогает не смотреть на 0 при живых арендах.
   */
  revenueExpected: number;
  revenueExpectedCount: number;
  // Платежи по дням текущего месяца (для спарклайн-графика)
  revenueByDay: { date: string; sum: number }[];
};

export type ReturnItem = {
  rentalId: number;
  scooterName: string;
  clientName: string;
  clientPhone: string;
  endPlannedAt: string;
  sum: number;
};

export type OverdueItem = {
  rentalId: number;
  scooterName: string;
  clientName: string;
  clientPhone: string;
  endPlannedAt: string;
  daysOverdue: number;
  debt: number;
};

export function useDashboardMetrics(): DashboardMetrics {
  const clientsQ = useApiClients();
  const rentalsQ = useApiRentals();
  const scootersQ = useApiScooters();
  const paymentsQ = useApiPayments();
  const damageReportsQ = useAllDamageReports();
  // v0.4.10: общая выручка за период — единый источник правды (используется
  // и здесь, и на вкладке «Аренды»). Скоуп='all' включает все источники
  // (в будущем продажи/ремонты/рассрочки тоже подтянутся сюда).
  const periodRevenue = useBillingPeriodRevenue("all");

  const isLoading =
    clientsQ.isLoading ||
    rentalsQ.isLoading ||
    scootersQ.isLoading ||
    paymentsQ.isLoading;

  return useMemo<DashboardMetrics>(() => {
    const clients = clientsQ.data ?? [];
    const rentals: ApiRental[] = rentalsQ.data ?? [];
    const scooters: ApiScooter[] = scootersQ.data ?? [];
    const payments: ApiPayment[] = paymentsQ.data ?? [];
    const damageAll = damageReportsQ.data ?? [];

    const clientById = new Map(clients.map((c) => [c.id, c]));
    const scooterById = new Map(scooters.map((s) => [s.id, s]));

    const now = new Date();
    const todayKey = ymd(now);
    const yesterdayKey = ymd(addDays(now, -1));
    // v0.3.7: расчётный период бизнеса — 15→14 (см. lib/billingPeriod).
    // Все «месячные» KPI на дашборде считаются за период, а не за
    // календарный месяц. monthStart/monthEnd оставляем именами для
    // совместимости с прежним кодом ниже, но семантика — billing period.
    const period = currentBillingPeriod(now);
    const monthStart = period.start;
    const monthEnd = period.end;

    // ===== KPI: поступит сегодня (v0.4.15, доработано в v0.4.28)
    // Считаем как сумму rental.sum по арендам, у которых endPlannedAt =
    // сегодня и они ещё фактически не закрыты.
    // Идея: клиенты обычно продлевают на ту же сумму, что в текущем
    // продлении. Когда клиент возвращает/продлевает — его аренда уходит
    // из этого списка (parent архивируется при extend, status=completed
    // при return) → цифра уменьшается в реальном времени.
    //
    // v0.4.28: ужесточил фильтр — раньше сюда попадали аренды со
    // status=active+endPlannedAt=сегодня даже если endActualAt уже
    // выставлен (промежуточное состояние при возврате) или статус
    // успел перескочить в overdue (status сменился, но endPlannedAt
    // = сегодня). Теперь:
    //   • endActualAt должен быть null (клиент не сдал скутер)
    //   • статус только active|returning (отбрасываем overdue/problem/
    //     completed_damage — оператор уже не ждёт от них «поступления»)
    const returnsTodayRentals = rentals.filter(
      (r) =>
        (r.status === "active" || r.status === "returning") &&
        r.endPlannedAt.slice(0, 10) === todayKey &&
        !r.endActualAt,
    );
    const todayIncoming = returnsTodayRentals.reduce(
      (s, r) => s + (r.sum ?? 0),
      0,
    );
    const todayIncomingCount = returnsTodayRentals.length;

    // Дельта vs вчера — для индикатора. Берём аналогичный показатель
    // на вчерашний день: возвраты/продления по rental.sum, чьи
    // endPlannedAt = вчера. Это скорее тренд, чем строгое сравнение.
    const yesterdayRentals = rentals.filter(
      (r) => r.endPlannedAt.slice(0, 10) === yesterdayKey,
    );
    const yesterdayIncoming = yesterdayRentals.reduce(
      (s, r) => s + (r.sum ?? 0),
      0,
    );
    const todayIncomingDelta =
      yesterdayIncoming > 0
        ? Math.round(
            ((todayIncoming - yesterdayIncoming) / yesterdayIncoming) * 100,
          )
        : null;

    // ===== KPI: Просрочки
    // v0.2.99: считаем по КАЛЕНДАРНОЙ дате, не по timestamp. Если план
    // возврата сегодня — это ещё не просрочка, оператор имеет весь день
    // на приём. Просрочка начинается со СЛЕДУЮЩЕГО дня (endPlannedAt's
    // date < today's date). Раньше использовался timestamp-comparison —
    // в результате после 16:00 сегодняшние возвраты ошибочно
    // подсвечивались как просрочка.
    const overdueRentals = rentals.filter(
      (r) =>
        r.status === "overdue" ||
        (r.status === "active" && r.endPlannedAt.slice(0, 10) < todayKey),
    );
    const overdueYesterday = rentals.filter(
      (r) =>
        r.status === "overdue" && r.updatedAt && r.updatedAt < todayKey,
    ).length;

    // v0.4.2: долг по просрочке считается по бизнес-формуле
    // 1.5 × rate × overdueDays = «дни» (rate × days) + «штраф 50%»
    // (round(rate × 0.5) × days). То же что в карточке аренды и в
    // фильтре «С долгом» в Клиентах.
    //
    // Внимание: здесь показывается ИСХОДНОЕ начисление, без вычета
    // событий из debt_entries (списаний/оплат). Если оператор сбросил
    // штраф через «Действия → Сбросить просрочку», то на дашборде до
    // обновления данных всё равно будет видна полная сумма. Источник
    // правды для остатка — карточка аренды (берёт /api/rentals/:id/debt).
    // Это сделано осознанно: API /rentals/archived не возвращает
    // дебт-события, и тянуть их по каждому rental на дашборде = N+1.
    const overdueDebtFor = (r: ApiRental): number => {
      const endDateKey = r.endPlannedAt.slice(0, 10);
      const days = Math.max(0, daysBetweenYmd(endDateKey, todayKey));
      if (days <= 0) return 0;
      // v0.4.25: учитываем rateUnit. Для week-тарифов сначала приводим
      // к дневному эквиваленту = round(rate / 7).
      const daily = r.rateUnit === "week" ? Math.round(r.rate / 7) : r.rate;
      return Math.round(daily * 1.5) * days;
    };

    const overdueSum = overdueRentals.reduce(
      (s, r) => s + overdueDebtFor(r),
      0,
    );

    const overdue: OverdueItem[] = overdueRentals.map((r) => {
      const sc = r.scooterId != null ? scooterById.get(r.scooterId) : null;
      const cl = clientById.get(r.clientId);
      const endDateKey = r.endPlannedAt.slice(0, 10);
      const daysOverdue = Math.max(0, daysBetweenYmd(endDateKey, todayKey));
      return {
        rentalId: r.id,
        scooterName: sc?.name ?? "—",
        clientName: cl?.name ?? "—",
        clientPhone: cl?.phone ?? "",
        endPlannedAt: r.endPlannedAt,
        daysOverdue,
        debt: overdueDebtFor(r),
      };
    });

    // ===== Активные аренды / загрузка парка
    // Считаем активной только аренду со скутером — иначе «призрачные»
    // аренды без scooterId раздувают счётчик и расходятся с парком.
    const activeRentalsCount = rentals.filter(
      (r) =>
        (r.status === "active" || r.status === "overdue") &&
        r.scooterId != null,
    ).length;

    // fleetTotal — скутеры которые потенциально могут быть в парке аренды.
    // Sold / buyout — выбыли из оборота, их в знаменатель загрузки не включаем,
    // иначе загрузка будет искусственно занижена.
    const inCirculationStatuses = new Set([
      "ready",
      "rental_pool",
      "repair",
      "disassembly",
    ]);
    const fleetTotal = scooters.filter((s) =>
      inCirculationStatuses.has(s.baseStatus),
    ).length;
    // Эффективный знаменатель загрузки — max(статичный парк, активные аренды),
    // чтобы при редких проскальзываниях статусов не получить >100%.
    const denom = Math.max(fleetTotal, activeRentalsCount);
    const loadPercent =
      denom > 0 ? Math.round((activeRentalsCount / denom) * 100) : 0;

    // ===== Парк по статусам
    const park = {
      total: fleetTotal,
      inRental: activeRentalsCount,
      ready: scooters.filter((s) => s.baseStatus === "ready").length,
      inRepair: scooters.filter((s) => s.baseStatus === "repair").length,
      forSale: scooters.filter(
        (s) => s.baseStatus === "for_sale" || s.baseStatus === "buyout",
      ).length,
      sold: scooters.filter((s) => s.baseStatus === "sold").length,
    };

    // ===== Возвраты сегодня (status=active, endPlannedAt = сегодня)
    const returnsToday: ReturnItem[] = rentals
      .filter(
        (r) =>
          (r.status === "active" || r.status === "returning") &&
          r.endPlannedAt.slice(0, 10) === todayKey,
      )
      .map((r) => {
        const sc = r.scooterId != null ? scooterById.get(r.scooterId) : null;
        const cl = clientById.get(r.clientId);
        return {
          rentalId: r.id,
          scooterName: sc?.name ?? "—",
          clientName: cl?.name ?? "—",
          clientPhone: cl?.phone ?? "",
          endPlannedAt: r.endPlannedAt,
          sum: r.sum,
        };
      })
      .sort((a, b) => a.endPlannedAt.localeCompare(b.endPlannedAt));

    // ===== Выручка за период (v0.4.10: общий хук) =====
    const revenueMonth = periodRevenue.total;
    const revenueMonthCount = periodRevenue.count;

    // ===== Ожидаемая выручка — аренды этого месяца без зафиксированного rent-платежа.
    // Это случаи когда скутер уже выдан клиенту (active/overdue/returning/returned),
    // но админ ещё не прошёл чеклист «Подтвердить оплату». Деньги в кассе
    // есть, а в системе — нет. Показываем отдельной строкой чтобы сразу
    // видеть «хвост» и закрыть его в пару кликов.
    const rentPaymentsByRentalId = new Set(
      payments.filter((p) => p.type === "rent").map((p) => p.rentalId),
    );
    const expectedRentals = rentals.filter((r) => {
      if (!["active", "overdue", "returning", "returned"].includes(r.status))
        return false;
      // Берём аренды, начавшиеся в текущем расчётном периоде (15→14)
      const startMs = new Date(r.startAt).getTime();
      if (startMs < monthStart.getTime() || startMs >= monthEnd.getTime())
        return false;
      return !rentPaymentsByRentalId.has(r.id);
    });
    const revenueExpected = expectedRentals.reduce((s, r) => s + r.sum, 0);
    const revenueExpectedCount = expectedRentals.length;

    // ===== Платежи по дням периода — приходят из общего хука =====
    const revenueByDay = periodRevenue.byDay;

    const hasRentals = rentals.length > 0;
    const hasScooters = scooters.length > 0;
    const hasAnyData = hasRentals || hasScooters || clients.length > 0;

    // === Множества для подсветки плиток ParkPanel ===
    const overdueRentalIds = new Set<number>(overdueRentals.map((r) => r.id));
    const returnsTodayRentalIds = new Set<number>(
      returnsToday.map((r) => r.rentalId),
    );
    // Аренды с активным долгом по ущербу (debt>0 в любом акте). На фронте
    // debt уже подсчитан сервером на базе total/depositCovered/payments —
    // оператор увидит красный квадратик пока есть хоть одна копейка долга.
    const damageDebtRentalIds = new Set<number>(
      damageAll
        .filter((d) => d.debt > 0)
        .map((d) => d.rentalId)
        .filter((id): id is number => typeof id === "number"),
    );

    // Те же множества, но по scooterId — напрямую по списку аренд.
    // Раньше ParkPanel пытался свести rentalId→scooterId через Map<scooter,
    // rentalId>, которая хранит только ОДНУ аренду на скутер; при дублях
    // в легаси-данных терялась подсветка (плитка синяя, но без жёлтого
    // кружочка возврата). Считаем напрямую: скутер «возвращается сегодня»
    // если у него ЛЮБАЯ rental попадает в returnsToday.
    const overdueScooterIds = new Set<number>();
    const overdueRentalByScooter = new Map<number, number>();
    overdueRentals.forEach((r) => {
      if (r.scooterId != null) {
        overdueScooterIds.add(r.scooterId);
        // Запоминаем ПЕРВУЮ найденную просрочку — её и будем открывать.
        if (!overdueRentalByScooter.has(r.scooterId)) {
          overdueRentalByScooter.set(r.scooterId, r.id);
        }
      }
    });
    const returnsTodayScooterIds = new Set<number>();
    const returnsTodayRentalByScooter = new Map<number, number>();
    const pastDueTodayScooterIds = new Set<number>();
    // Для подсчёта дублей активных аренд на одном скутере собираем все
    // открытые rentals на каждый scooterId.
    const openRentalsByScooter = new Map<number, number[]>();
    const nowMs = now.getTime();
    rentals.forEach((r) => {
      if (r.scooterId == null) return;
      const isOpen =
        r.status === "active" ||
        r.status === "overdue" ||
        r.status === "returning";
      if (isOpen) {
        const arr = openRentalsByScooter.get(r.scooterId) ?? [];
        arr.push(r.id);
        openRentalsByScooter.set(r.scooterId, arr);
      }
      const isReturnToday =
        (r.status === "active" || r.status === "returning") &&
        r.endPlannedAt.slice(0, 10) === todayKey;
      if (isReturnToday) {
        returnsTodayScooterIds.add(r.scooterId);
        if (!returnsTodayRentalByScooter.has(r.scooterId)) {
          returnsTodayRentalByScooter.set(r.scooterId, r.id);
        }
        // Если время уже прошло — отмечаем как «опаздывает по времени»
        // (это ещё не просрочка по бизнес-правилу, просрочка завтра).
        const endMs = new Date(r.endPlannedAt).getTime();
        if (!Number.isNaN(endMs) && endMs < nowMs) {
          pastDueTodayScooterIds.add(r.scooterId);
        }
      }
    });
    const anyActiveRentalByScooter = new Map<number, number>();
    openRentalsByScooter.forEach((ids, scooterId) => {
      // Берём максимальный id (самая свежая запись) — если дублей нет,
      // это и есть единственная активная аренда.
      anyActiveRentalByScooter.set(
        scooterId,
        ids.reduce((a, b) => (a > b ? a : b)),
      );
    });
    const damageDebtScooterIds = new Set<number>();
    const damageDebtRentalByScooter = new Map<number, number>();
    const rentalById = new Map(rentals.map((r) => [r.id, r] as const));
    damageAll.forEach((d) => {
      if (d.debt <= 0) return;
      const r = rentalById.get(d.rentalId);
      if (r?.scooterId != null) {
        damageDebtScooterIds.add(r.scooterId);
        if (!damageDebtRentalByScooter.has(r.scooterId)) {
          damageDebtRentalByScooter.set(r.scooterId, r.id);
        }
      }
    });

    const duplicateActiveByScooter = Array.from(openRentalsByScooter.entries())
      .filter(([, ids]) => ids.length > 1)
      .map(([scooterId, ids]) => ({
        scooterId,
        // sort desc — свежие сверху для удобства
        rentalIds: [...ids].sort((a, b) => b - a),
      }));

    return {
      isLoading,
      hasAnyData,
      hasScooters,
      hasRentals,
      todayIncoming,
      todayIncomingCount,
      todayIncomingDelta,
      overdueCount: overdueRentals.length,
      overdueSum,
      overdueDeltaFromYesterday: overdueRentals.length - overdueYesterday,
      activeRentalsCount,
      fleetTotal,
      loadPercent,
      tasksToday: 0, // задач ещё нет в API
      park,
      returnsToday,
      overdue,
      overdueRentalIds,
      damageDebtRentalIds,
      returnsTodayRentalIds,
      overdueScooterIds,
      damageDebtScooterIds,
      returnsTodayScooterIds,
      pastDueTodayScooterIds,
      overdueRentalByScooter,
      returnsTodayRentalByScooter,
      damageDebtRentalByScooter,
      anyActiveRentalByScooter,
      duplicateActiveByScooter,
      revenueMonth,
      revenueMonthCount,
      revenueExpected,
      revenueExpectedCount,
      revenueByDay,
    };
  }, [
    clientsQ.data,
    rentalsQ.data,
    scootersQ.data,
    paymentsQ.data,
    damageReportsQ.data,
    isLoading,
    periodRevenue,
  ]);
}

// utils
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
/**
 * Календарных дней между двумя YYYY-MM-DD строками (b - a, без учёта
 * времени). Положительное значение, если b позже a; 0 если та же дата.
 * Используется для подсчёта «дней просрочки» — день возврата = 0,
 * следующий = 1 и т.д.
 */
function daysBetweenYmd(a: string, b: string): number {
  const aMs = new Date(`${a}T00:00:00Z`).getTime();
  const bMs = new Date(`${b}T00:00:00Z`).getTime();
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 0;
  return Math.round((bMs - aMs) / 86_400_000);
}

/** Приветствие по времени суток. */
export function greetingByHour(d = new Date()): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return "Доброе утро";
  if (h >= 12 && h < 18) return "Добрый день";
  if (h >= 18 && h < 23) return "Добрый вечер";
  return "Доброй ночи";
}

/** Форматирование денег в ₽ с пробелами как разделителями тысяч. */
export function formatRub(n: number): string {
  return new Intl.NumberFormat("ru-RU").format(Math.round(n));
}
