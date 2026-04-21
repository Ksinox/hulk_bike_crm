import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiScooter, ListResponse } from "./types";

export const scootersKeys = {
  all: ["scooters"] as const,
  list: () => [...scootersKeys.all, "list"] as const,
  byId: (id: number) => [...scootersKeys.all, "detail", id] as const,
};

export function useApiScooters() {
  return useQuery({
    queryKey: scootersKeys.list(),
    queryFn: () =>
      api.get<ListResponse<ApiScooter>>("/api/scooters").then((r) => r.items),
  });
}

export function useApiScooter(id: number | null) {
  return useQuery({
    queryKey: id == null ? scootersKeys.all : scootersKeys.byId(id),
    queryFn: () => api.get<ApiScooter>(`/api/scooters/${id}`),
    enabled: id != null,
  });
}
