import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiPriceItem = {
  id: number;
  groupId: number;
  name: string;
  priceA: number | null;
  priceB: number | null;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ApiPriceGroup = {
  id: number;
  name: string;
  sortOrder: number;
  hasTwoPrices: boolean;
  priceALabel: string;
  priceBLabel: string | null;
  scooterModelId: number | null;
  createdAt: string;
  updatedAt: string;
  items: ApiPriceItem[];
};

export type CreateGroupInput = {
  name: string;
  sortOrder?: number;
  hasTwoPrices?: boolean;
  priceALabel?: string;
  priceBLabel?: string | null;
  scooterModelId?: number | null;
  /** При создании — скопировать позиции из другой группы. */
  copyItemsFromGroupId?: number | null;
  /** Копировать с ценами или только названия. */
  copyWithPrices?: boolean;
};

export type CreateItemInput = {
  groupId: number;
  name: string;
  priceA?: number | null;
  priceB?: number | null;
  sortOrder?: number;
  note?: string | null;
};

export const priceListKeys = {
  all: ["price-list"] as const,
  list: () => [...priceListKeys.all, "list"] as const,
};

export function useApiPriceList() {
  return useQuery({
    queryKey: priceListKeys.list(),
    queryFn: () =>
      api
        .get<{ groups: ApiPriceGroup[] }>("/api/price-list")
        .then((r) => r.groups),
  });
}

export function useCreatePriceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGroupInput) =>
      api.post<ApiPriceGroup>("/api/price-list/groups", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}

export function usePatchPriceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<CreateGroupInput> }) =>
      api.patch<ApiPriceGroup>(`/api/price-list/groups/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}

export function useDeletePriceGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/price-list/groups/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}

export function useCreatePriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateItemInput) =>
      api.post<ApiPriceItem>("/api/price-list/items", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}

export function usePatchPriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<CreateItemInput> }) =>
      api.patch<ApiPriceItem>(`/api/price-list/items/${args.id}`, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}

export function useDeletePriceItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/price-list/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}

export function useSeedPriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ ok: true; skipped: boolean; message?: string }>(
        "/api/price-list/_seed",
        {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}

/** Снести и пересоздать прейскурант из шаблона v2. Деструктивно. */
export function useReseedPriceList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ ok: true }>("/api/price-list/_reseed", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: priceListKeys.all }),
  });
}
