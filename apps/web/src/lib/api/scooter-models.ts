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

/** Загрузить аватарку модели (multipart). */
export function useUploadScooterModelAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", args.file, args.file.name);
      const base =
        import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
        "http://localhost:4000";
      const res = await fetch(
        `${base}/api/scooter-models/${args.id}/avatar`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      return (await res.json()) as ApiScooterModel;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterModelsKeys.all });
    },
  });
}

export function useDeleteScooterModelAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<ApiScooterModel>(`/api/scooter-models/${id}/avatar`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterModelsKeys.all });
    },
  });
}
