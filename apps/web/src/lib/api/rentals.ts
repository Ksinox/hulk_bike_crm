import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiRental, ListResponse } from "./types";

export const rentalsKeys = {
  all: ["rentals"] as const,
  list: () => [...rentalsKeys.all, "list"] as const,
  byId: (id: number) => [...rentalsKeys.all, "detail", id] as const,
};

export function useApiRentals() {
  return useQuery({
    queryKey: rentalsKeys.list(),
    queryFn: () =>
      api.get<ListResponse<ApiRental>>("/api/rentals").then((r) => r.items),
  });
}

/** Архивные (soft-deleted) аренды — для вкладки «Архив». */
export function useApiRentalsArchived() {
  return useQuery({
    queryKey: [...rentalsKeys.all, "archived"] as const,
    queryFn: () =>
      api
        .get<ListResponse<ApiRental>>("/api/rentals/archived")
        .then((r) => r.items),
  });
}

/**
 * История замен скутера в одной аренде (из таблицы scooter_swaps).
 * Заполняется in-place через /swap-scooter — нужен для блока
 * «Ранее в этой аренде» во вкладке «Условия» карточки аренды.
 */
export type ApiScooterSwap = {
  id: number;
  rentalId: number;
  prevScooterId: number | null;
  newScooterId: number;
  swapAt: string;
  reason: string | null;
  feeAmount: number;
  createdByUserId: number | null;
  createdAt: string;
};

export function useApiScooterSwaps(rentalId: number | null) {
  return useQuery({
    enabled: rentalId != null,
    queryKey: [...rentalsKeys.all, "swaps", rentalId ?? 0] as const,
    queryFn: () =>
      api
        .get<{ items: ApiScooterSwap[] }>(
          `/api/rentals/${rentalId}/scooter-swaps`,
        )
        .then((r) => r.items),
  });
}

/**
 * Сброс цепочки аренды до базовой связки. Только creator.
 * Удаляет ВСЕ потомки корня (продления + замены), оставляет только
 * первоначальную связку. Корень разархивируется. Операция необратима.
 */
export function useResetRentalChain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rentalId: number) =>
      api.post<{ rootId: number; removed: number }>(
        `/api/rentals/${rentalId}/reset-chain`,
        {},
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalsKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/**
 * Хардкорное физическое удаление (только creator). Без следов в БД,
 * без записи в activity_log. Операция необратимая.
 */
export function usePurgeRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/rentals/purge/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalsKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/** Восстановление аренды из архива. */
export function useUnarchiveRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ApiRental>(`/api/rentals/${id}/unarchive`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalsKeys.all });
    },
  });
}

export function useApiRental(id: number | null) {
  return useQuery({
    queryKey: id == null ? rentalsKeys.all : rentalsKeys.byId(id),
    queryFn: () => api.get<ApiRental>(`/api/rentals/${id}`),
    enabled: id != null,
  });
}

/**
 * Физическое удаление аренды. Сервер сам решит, можно ли —
 * вернёт 409 если есть подтверждённые платежи или статус «выдана».
 */
/**
 * v0.2.75: замена скутера в аренде.
 * Создаёт child-связку с новым скутером, старая уходит в архив (как при extend).
 * Старый скутер переводится в `repair`, срок аренды (endPlannedAt) сохраняется.
 */
export function useSwapScooter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      rentalId: number;
      newScooterId: number;
      oldScooterStatus?:
        | "ready"
        | "rental_pool"
        | "repair"
        | "buyout"
        | "for_sale"
        | "sold"
        | "disassembly";
      reason?: string;
    }) =>
      api.post<ApiRental>(`/api/rentals/${args.rentalId}/swap-scooter`, {
        newScooterId: args.newScooterId,
        oldScooterStatus: args.oldScooterStatus ?? "repair",
        ...(args.reason ? { reason: args.reason } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalsKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useDeleteRental() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<void>(`/api/rentals/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalsKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
