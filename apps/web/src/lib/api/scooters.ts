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
  /** FK на scooter_models — источник тарифов/аватарки */
  modelId?: number | null;
  vin?: string | null;
  engineNo?: string | null;
  frameNumber?: string | null;
  year?: number | null;
  color?: string | null;
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

/** Архивированные скутеры (скрыты из основного списка). */
export function useApiScootersArchived() {
  return useQuery({
    queryKey: [...scootersKeys.all, "archived"] as const,
    queryFn: () =>
      api
        .get<ListResponse<ApiScooter>>("/api/scooters/archived")
        .then((r) => r.items),
  });
}

export function useArchiveScooter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<ApiScooter>(`/api/scooters/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scootersKeys.all });
    },
  });
}

export function useRestoreScooter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ApiScooter>(`/api/scooters/${id}/restore`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scootersKeys.all });
    },
  });
}

export function usePurgeScooter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<ApiScooter>(`/api/scooters/${id}/purge`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scootersKeys.all });
    },
  });
}
