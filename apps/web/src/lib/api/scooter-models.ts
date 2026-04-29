import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type CoolingType = "air" | "liquid";

export type ApiScooterModel = {
  id: number;
  name: string;
  avatarKey: string | null;
  avatarFileName: string | null;
  /** Кропнутая миниатюра (≤512px JPEG) — для плиток/списков. */
  avatarThumbKey: string | null;
  avatarThumbFileName: string | null;
  quickPick: boolean;
  /**
   * false → модель не показывается на лендинге и в выборах CRM
   * (форма аренды, фильтры). Используется когда модели временно нет,
   * а удалять нельзя из-за истории.
   */
  active: boolean;
  /** ₽/сут на коротком прокате 1–2 дня */
  dayRate: number;
  /** ₽/сут на тарифе 3–6 дней */
  shortRate: number;
  /** ₽/сут на тарифе 7–29 дней */
  weekRate: number;
  /** ₽/сут на длинном тарифе 30+ дней */
  monthRate: number;
  /** Технические характеристики — отображаются на лендинге. */
  maxSpeedKmh: number | null;
  /** numeric(4,1) — Drizzle отдаёт строкой, на странице удобнее держать строку */
  tankVolumeL: string | null;
  /** numeric(4,2), л на 100 км */
  fuelLPer100Km: string | null;
  coolingType: CoolingType | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateModelInput = {
  name: string;
  avatarKey?: string | null;
  avatarFileName?: string | null;
  quickPick?: boolean;
  active?: boolean;
  dayRate?: number;
  shortRate?: number;
  weekRate?: number;
  monthRate?: number;
  maxSpeedKmh?: number | null;
  tankVolumeL?: string | number | null;
  fuelLPer100Km?: string | number | null;
  coolingType?: CoolingType | null;
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

/**
 * Загрузить аватарку модели (multipart).
 *  - file  — оригинал (после ресайза/сжатия на клиенте)
 *  - thumb — опционально, кропнутая миниатюра 512×512 от ImageCropDialog
 */
export function useUploadScooterModelAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { id: number; file: Blob; thumb?: Blob }) => {
      const fd = new FormData();
      const fileName =
        args.file instanceof File ? args.file.name : "avatar.jpg";
      fd.append("file", args.file, fileName);
      if (args.thumb) {
        fd.append("thumb", args.thumb, "thumb.jpg");
      }
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
