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
