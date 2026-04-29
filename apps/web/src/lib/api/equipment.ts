import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiEquipmentItem = {
  id: number;
  name: string;
  avatarKey: string | null;
  avatarFileName: string | null;
  /** Кропнутая миниатюра (≤512px JPEG) — для плиток. */
  avatarThumbKey: string | null;
  avatarThumbFileName: string | null;
  quickPick: boolean;
  price: number;
  isFree: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateEquipmentInput = {
  name: string;
  avatarKey?: string | null;
  avatarFileName?: string | null;
  quickPick?: boolean;
  price?: number;
  isFree?: boolean;
  note?: string | null;
};

export const equipmentKeys = {
  all: ["equipment"] as const,
  list: () => [...equipmentKeys.all, "list"] as const,
};

export function useApiEquipment() {
  return useQuery({
    queryKey: equipmentKeys.list(),
    queryFn: () =>
      api.get<{ items: ApiEquipmentItem[] }>("/api/equipment").then((r) => r.items),
  });
}

export function useCreateEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateEquipmentInput) =>
      api.post<ApiEquipmentItem>("/api/equipment", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}

export function usePatchEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<CreateEquipmentInput> }) =>
      api.patch<ApiEquipmentItem>(`/api/equipment/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}

export function useDeleteEquipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/api/equipment/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}

/**
 * Загрузить аватарку экипировки (multipart).
 *  - file  — оригинал (после ресайза/сжатия на клиенте)
 *  - thumb — опционально, кропнутая миниатюра 512×512 от ImageCropDialog
 */
export function useUploadEquipmentAvatar() {
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
        `${base}/api/equipment/${args.id}/avatar`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!res.ok) throw new Error(`upload failed: ${res.status}`);
      return (await res.json()) as ApiEquipmentItem;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}

export function useDeleteEquipmentAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<ApiEquipmentItem>(`/api/equipment/${id}/avatar`),
    onSuccess: () => qc.invalidateQueries({ queryKey: equipmentKeys.all }),
  });
}
