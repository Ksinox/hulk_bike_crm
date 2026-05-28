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
  amount: number;
  paidAmount: number;
  status: "active" | "ended";
  createdByName: string | null;
  createdAt: string;
  endedAt: string | null;
};

/** Стоимость паркинга: 1-е сутки бесплатно, далее 250 ₽/сут. */
export function parkingAmount(days: number): number {
  return days > 1 ? PARKING_RATE_PER_DAY * (days - 1) : 0;
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
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["activity"] });
  };
}

export function useCreateParking() {
  const invalidate = useInvalidateParking();
  return useMutation({
    mutationFn: (args: { rentalId: number; startDate: string; endDate: string }) =>
      api.post<{ session: ParkingSession }>(
        `/api/rentals/${args.rentalId}/parking`,
        { startDate: args.startDate, endDate: args.endDate },
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
    mutationFn: (args: { rentalId: number; sessionId: number }) =>
      api.post<{ session: ParkingSession }>(
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
