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
    // v0.4.28: автообновление раз в минуту — чтобы KPI на дашборде
    // («Поступит сегодня», «Просрочки», и т.п.) не показывали stale-
    // данные при открытой вкладке без фокуса. Когда оператор где-то
    // принял возврат/продление — invalidateQueries(['rentals']) делает
    // refetch немедленно; интервал страхует случаи, когда инвалидация
    // прошла на другом устройстве/в другой сессии.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
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

/** Удаляет одну запись scooter_swap (из «Замены скутера» в RentalEditModal). */
export function useDeleteScooterSwap() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (swapId: number) =>
      api.delete<void>(`/api/rentals/scooter-swaps/${swapId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: rentalsKeys.all });
    },
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

/* ============ Snapshots документов аренды ============ */

export type RentalDocumentSnapshot = {
  id: number;
  rentalId: number;
  docType: string;
  title: string;
  htmlFileKey: string;
  docxFileKey: string | null;
  size: number;
  savedByUserLogin: string | null;
  savedAt: string;
};

export const rentalDocSnapshotsKeys = {
  byRental: (rentalId: number) =>
    ["rental-document-snapshots", rentalId] as const,
};

export function useApiRentalDocSnapshots(rentalId: number) {
  return useQuery({
    queryKey: rentalDocSnapshotsKeys.byRental(rentalId),
    queryFn: () =>
      api
        .get<ListResponse<RentalDocumentSnapshot>>(
          `/api/rentals/${rentalId}/document-snapshots`,
        )
        .then((r) => r.items),
  });
}

/**
 * Сохранить текущий рендер документа как снапшот в S3 + БД.
 * Возвращает созданную запись.
 */
export function useSaveRentalDocSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { rentalId: number; type: string }) =>
      api.post<RentalDocumentSnapshot>(
        `/api/rentals/${args.rentalId}/document/${args.type}/snapshot`,
        {},
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: rentalDocSnapshotsKeys.byRental(vars.rentalId),
      });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useDeleteRentalDocSnapshot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { snapshotId: number; rentalId: number }) =>
      api.delete<void>(`/api/rental-document-snapshots/${args.snapshotId}`),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({
        queryKey: rentalDocSnapshotsKeys.byRental(vars.rentalId),
      });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/** URL для открытия/скачивания сохранённого снапшота. */
export function rentalDocSnapshotUrl(
  snapshotId: number,
  format: "html" | "docx",
): string {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
    "http://localhost:4000";
  return `${base}/api/rental-document-snapshots/${snapshotId}/file?format=${format}`;
}
