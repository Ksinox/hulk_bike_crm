import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiPriceItem = {
  id: number;
  groupId: number;
  name: string;
  priceA: number | null;
  priceB: number | null;
  /** Закуп за штуку (прайс запчастей). Без права на прибыль ремонтов не приходит. */
  cost?: number | null;
  /** Каталожный код и ключ картинки (прайс запчастей, 2.0.2). */
  code?: string | null;
  imageKey?: string | null;
  sortOrder: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PriceKind = "damage" | "service" | "part";

export type ApiPriceGroup = {
  id: number;
  name: string;
  sortOrder: number;
  hasTwoPrices: boolean;
  priceALabel: string;
  priceBLabel: string | null;
  scooterModelId: number | null;
  /** 'damage' — прайс ущерба, 'service' — работы, 'part' — запчасти сторонних ремонтов. */
  kind: PriceKind;
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
  kind?: PriceKind;
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
  cost?: number | null;
  sortOrder?: number;
  note?: string | null;
};

/**
 * Группа прайса запчастей называется «Зона · Узел» (2.0.2): «Двигатель ·
 * Головка и ГРМ». Зона — заголовок и кнопка быстрого перехода, узел —
 * название группы.
 */
export function splitPriceGroup(name: string): { zone: string | null; sub: string } {
  const i = name.indexOf(" · ");
  return i > 0 ? { zone: name.slice(0, i), sub: name.slice(i + 3) } : { zone: null, sub: name };
}

/** Зоны в порядке групп (для кнопок быстрого перехода). */
export function priceZones(groups: { name: string }[]): string[] {
  const out: string[] = [];
  for (const g of groups) {
    const z = splitPriceGroup(g.name).zone;
    if (z && !out.includes(z)) out.push(z);
  }
  return out;
}

export const priceListKeys = {
  all: ["price-list"] as const,
  list: () => [...priceListKeys.all, "list"] as const,
};

/**
 * Прайс одного вида: 'damage' — ущерб (по моделям нашей техники),
 * 'service' — работы, 'part' — запчасти для сторонних ремонтов. Без
 * аргумента — весь прайс, как было раньше.
 */
export function usePriceList(kind?: PriceKind) {
  return useQuery({
    queryKey: [...priceListKeys.list(), kind ?? "all"],
    queryFn: () =>
      api.get<{ groups: ApiPriceGroup[] }>(
        `/api/price-list${kind ? `?kind=${kind}` : ""}`,
      ),
  });
}

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
