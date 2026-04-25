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
import type { ApiRental, ApiScooter } from "@/lib/api/types";

export type DashboardMetrics = {
  isLoading: boolean;

  // «есть ли вообще данные»
  hasAnyData: boolean;
  hasScooters: boolean;
  hasRentals: boolean;

  // KPI
  todayIncoming: number; // ₽, запланировано к поступлению сегодня
  todayIncomingCount: number; // число платежей
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

    const clientById = new Map(clients.map((c) => [c.id, c]));
    const scooterById = new Map(scooters.map((s) => [s.id, s]));

    const now = new Date();
    const todayKey = ymd(now);
    const yesterdayKey = ymd(addDays(now, -1));
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // ===== KPI: поступит сегодня (запланированные платежи на сегодня)
    const todayPayments = payments.filter(
      (p) => p.scheduledOn === todayKey && !p.paid,
    );
    const todayIncoming = todayPayments.reduce((s, p) => s + p.amount, 0);
    const todayIncomingCount = todayPayments.length;

    const yesterdayPayments = payments.filter(
      (p) => p.scheduledOn === yesterdayKey,
    );
    const yesterdayIncoming = yesterdayPayments.reduce(
      (s, p) => s + p.amount,
      0,
    );
    const todayIncomingDelta =
      yesterdayIncoming > 0
        ? Math.round(
            ((todayIncoming - yesterdayIncoming) / yesterdayIncoming) * 100,
          )
        : null;

    // ===== KPI: Просрочки
    const overdueRentals = rentals.filter(
      (r) =>
        r.status === "overdue" ||
        (r.status === "active" && r.endPlannedAt < nowIso(now)),
    );
    const overdueYesterday = rentals.filter(
      (r) =>
        r.status === "overdue" && r.updatedAt && r.updatedAt < todayKey,
    ).length;

    const overdueSum = overdueRentals.reduce((s, r) => {
      const scheduledUnpaid = payments
        .filter((p) => p.rentalId === r.id && !p.paid)
        .reduce((ps, p) => ps + p.amount, 0);
      return s + (scheduledUnpaid || r.sum);
    }, 0);

    const overdue: OverdueItem[] = overdueRentals.map((r) => {
      const sc = r.scooterId != null ? scooterById.get(r.scooterId) : null;
      const cl = clientById.get(r.clientId);
      const end = new Date(r.endPlannedAt);
      const daysOverdue = Math.max(
        0,
        Math.floor((now.getTime() - end.getTime()) / 86400_000),
      );
      const debt = payments
        .filter((p) => p.rentalId === r.id && !p.paid)
        .reduce((s, p) => s + p.amount, 0);
      return {
        rentalId: r.id,
        scooterName: sc?.name ?? "—",
        clientName: cl?.name ?? "—",
        clientPhone: cl?.phone ?? "",
        endPlannedAt: r.endPlannedAt,
        daysOverdue,
        debt: debt || r.sum,
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

    // ===== Выручка за месяц
    // В выручку НЕ включаем залоги — это возвратные деньги, не доход.
    // Считаем только тип 'rent', 'damage', 'fine' и прочие «заработки».
    const monthPayments = payments.filter(
      (p) =>
        p.paid &&
        p.paidAt &&
        new Date(p.paidAt) >= monthStart &&
        p.type !== "deposit",
    );
    const revenueMonth = monthPayments.reduce((s, p) => s + p.amount, 0);
    const revenueMonthCount = monthPayments.length;

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
      // Берём аренды, начавшиеся в этом месяце
      const start = new Date(r.startAt);
      if (start < monthStart) return false;
      return !rentPaymentsByRentalId.has(r.id);
    });
    const revenueExpected = expectedRentals.reduce((s, r) => s + r.sum, 0);
    const revenueExpectedCount = expectedRentals.length;

    // ===== Платежи по дням месяца — для графика
    const byDayMap = new Map<string, number>();
    monthPayments.forEach((p) => {
      if (!p.paidAt) return;
      const d = p.paidAt.slice(0, 10);
      byDayMap.set(d, (byDayMap.get(d) ?? 0) + p.amount);
    });
    const revenueByDay = Array.from(byDayMap.entries())
      .map(([date, sum]) => ({ date, sum }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const hasRentals = rentals.length > 0;
    const hasScooters = scooters.length > 0;
    const hasAnyData = hasRentals || hasScooters || clients.length > 0;

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
      revenueMonth,
      revenueMonthCount,
      revenueExpected,
      revenueExpectedCount,
      revenueByDay,
    };
  }, [clientsQ.data, rentalsQ.data, scootersQ.data, paymentsQ.data, isLoading]);
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
function nowIso(d: Date): string {
  return d.toISOString();
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
