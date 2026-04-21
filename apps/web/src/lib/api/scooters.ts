import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export type CreateScooterInput = {
  name: string;
  model: ApiScooter["model"];
  vin?: string | null;
  engineNo?: string | null;
  mileage?: number;
  baseStatus?: ApiScooter["baseStatus"];
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  lastOilChangeMileage?: number | null;
  note?: string | null;
};

export type PatchScooterInput = Partial<CreateScooterInput>;

export function useCreateScooter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateScooterInput) =>
      api.post<ApiScooter>("/api/scooters", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scootersKeys.all });
    },
  });
}

export function usePatchScooter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: PatchScooterInput }) =>
      api.patch<ApiScooter>(`/api/scooters/${args.id}`, args.patch),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: scootersKeys.all });
      qc.setQueryData(scootersKeys.byId(row.id), row);
    },
  });
}
