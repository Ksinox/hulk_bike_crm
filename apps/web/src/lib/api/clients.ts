import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiClient, ListResponse } from "./types";

export const clientsKeys = {
  all: ["clients"] as const,
  list: () => [...clientsKeys.all, "list"] as const,
  byId: (id: number) => [...clientsKeys.all, "detail", id] as const,
};

export function useApiClients() {
  return useQuery({
    queryKey: clientsKeys.list(),
    queryFn: () =>
      api.get<ListResponse<ApiClient>>("/api/clients").then((r) => r.items),
  });
}

export function useApiClient(id: number | null) {
  return useQuery({
    queryKey: id == null ? clientsKeys.all : clientsKeys.byId(id),
    queryFn: () => api.get<ApiClient>(`/api/clients/${id}`),
    enabled: id != null,
  });
}
