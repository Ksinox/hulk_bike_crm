import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiEquipmentItem = {
  id: number;
  name: string;
  avatarKey: string | null;
  avatarFileName: string | null;
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
