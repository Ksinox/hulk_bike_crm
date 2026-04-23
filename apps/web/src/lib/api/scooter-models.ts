import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiScooterModel = {
  id: number;
  name: string;
  avatarKey: string | null;
  avatarFileName: string | null;
  quickPick: boolean;
  shortRate: number;
  weekRate: number;
  monthRate: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateModelInput = {
  name: string;
  avatarKey?: string | null;
  avatarFileName?: string | null;
  quickPick?: boolean;
  shortRate?: number;
  weekRate?: number;
  monthRate?: number;
  note?: string | null;
};

export const scooterModelsKeys = {
  all: ["scooter-models"] as const,
  list: () => [...scooterModelsKeys.all, "list"] as const,
};

export function useApiScooterModels() {
  return useQuery({
    queryKey: scooterModelsKeys.list(),
    queryFn: () =>
      api
        .get<{ items: ApiScooterModel[] }>("/api/scooter-models")
        .then((r) => r.items),
  });
}

export function useCreateScooterModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateModelInput) =>
      api.post<ApiScooterModel>("/api/scooter-models", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterModelsKeys.all });
    },
  });
}

export function usePatchScooterModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<CreateModelInput> }) =>
      api.patch<ApiScooterModel>(`/api/scooter-models/${args.id}`, args.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterModelsKeys.all });
    },
  });
}

export function useDeleteScooterModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/scooter-models/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterModelsKeys.all });
    },
  });
}
