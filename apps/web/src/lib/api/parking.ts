/**
 * v0.8.0 — паркинг (пауза аренды).
 *
 * Сессия паркинга сдвигает плановый возврат аренды вперёд на свои дни и
 * стоит льготно: 1-е сутки бесплатно, далее 250 ₽/сут (макс 7 суток).
 * Неоплаченный остаток попадает в долг (см. debt-aggregate.parkingBalance).
 */
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const PARKING_RATE_PER_DAY = 250;
export const PARKING_MAX_DAYS = 7;

export type ParkingSession = {
  id: number;
  rentalId: number;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  days: number;
  ratePerDay: number;
  freeFirstDay: boolean;
  /** true — предоплаченный фиксированный период (дни закреплены); false — открытый. */
  prepaid: boolean;
  amount: number;
  paidAmount: number;
  status: "active" | "ended";
  createdByName: string | null;
  createdAt: string;
  endedAt: string | null;
};

/** Стоимость паркинга: при freeFirstDay 1-е сутки бесплатно, далее 250 ₽/сут. */
export function parkingAmount(days: number, freeFirstDay = true): number {
  if (days <= 0) return 0;
  return freeFirstDay
    ? PARKING_RATE_PER_DAY * Math.max(0, days - 1)
    : PARKING_RATE_PER_DAY * days;
}

export const parkingKeys = {
  all: ["parking-sessions"] as const,
};

export function useParkingSessions() {
  return useQuery({
    queryKey: parkingKeys.all,
    queryFn: () =>
      api
        .get<{ items: ParkingSession[] }>("/api/rentals/parking")
        .then((r) => r.items),
    staleTime: 30_000,
  });
}

/** Сессии паркинга конкретной аренды (отсортированы по началу). */
export function useRentalParking(rentalId: number | null | undefined) {
  const { data: all = [], ...rest } = useParkingSessions();
  const sessions = useMemo(
    () =>
      all
        .filter((s) => s.rentalId === rentalId)
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [all, rentalId],
  );
  return { sessions, ...rest };
}

function useInvalidateParking() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: parkingKeys.all });
    qc.invalidateQueries({ queryKey: ["rentals"] });
    qc.invalidateQueries({ queryKey: ["rentals-archived"] });
    qc.invalidateQueries({ queryKey: ["debt-aggregate"] });
    qc.invalidateQueries({ queryKey: ["rental-debt"] });
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["activity"] });
  };
}

export function useCreateParking() {
  const invalidate = useInvalidateParking();
  return useMutation({
    // Открытый паркинг — дата начала; предоплата — ещё endDate (фикс. период).
    mutationFn: (args: {
      rentalId: number;
      startDate: string;
      /** Задан → предоплаченный фиксированный период [startDate, endDate]. */
      endDate?: string;
      freeFirstDay: boolean;
    }) =>
      api.post<{ session: ParkingSession }>(
        `/api/rentals/${args.rentalId}/parking`,
        {
          startDate: args.startDate,
          freeFirstDay: args.freeFirstDay,
          ...(args.endDate ? { endDate: args.endDate } : {}),
        },
      ),
    onSuccess: invalidate,
  });
}

export function useEditParking() {
  const invalidate = useInvalidateParking();
  return useMutation({
    mutationFn: (args: {
      rentalId: number;
      sessionId: number;
      startDate: string;
      endDate: string;
    }) =>
      api.patch<{ session: ParkingSession }>(
        `/api/rentals/${args.rentalId}/parking/${args.sessionId}`,
        { startDate: args.startDate, endDate: args.endDate },
      ),
    onSuccess: invalidate,
  });
}

export function useEndParking() {
  const invalidate = useInvalidateParking();
  return useMutation({
    // refund — излишек предоплаты при раннем возврате (упал на депозит клиента).
    mutationFn: (args: { rentalId: number; sessionId: number }) =>
      api.post<{ session: ParkingSession; refund?: number }>(
        `/api/rentals/${args.rentalId}/parking/${args.sessionId}/end`,
        {},
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteParking() {
  const invalidate = useInvalidateParking();
  return useMutation({
    mutationFn: (args: { rentalId: number; sessionId: number }) =>
      api.delete<{ ok: true }>(
        `/api/rentals/${args.rentalId}/parking/${args.sessionId}`,
      ),
    onSuccess: invalidate,
  });
}

/** Принять оплату паркинга (FIFO по сессиям). */
export function usePayParking() {
  const invalidate = useInvalidateParking();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      rentalId: number;
      amount: number;
      method?: "cash" | "card" | "transfer" | "deposit";
    }) =>
      api.post<{ applied: number }>(`/api/rentals/${args.rentalId}/parking/pay`, {
        amount: args.amount,
        method: args.method,
      }),
    onSuccess: () => {
      invalidate();
      // Платёж по паркингу → обновить выручку/«за всё время».
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["revenue"] });
    },
  });
}

/** Сумма неоплаченного паркинга по аренде. */
export function unpaidParkingTotal(sessions: ParkingSession[]): number {
  return sessions.reduce(
    (s, p) => s + Math.max(0, p.amount - p.paidAmount),
    0,
  );
}
