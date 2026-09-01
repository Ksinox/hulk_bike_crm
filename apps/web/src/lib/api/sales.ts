import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/**
 * Блок «Продажи» (31.08).
 *
 * Сервер отдаёт «сырьё» — список сделок, менеджеров и планов. Показатели,
 * рейтинги и динамику считает фронт: продаж десятки в год, а фильтры
 * (период, менеджер, разрез день/неделя/месяц/год) должны переключаться
 * мгновенно, без запроса на каждое нажатие.
 */

export type SaleDealStatus = "draft" | "contract" | "signed" | "cancelled";

export type SaleDealDocument = {
  id: number;
  dealId: number;
  fileKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  title: string | null;
  uploadedAt: string;
};

export type SaleDeal = {
  id: number;
  status: SaleDealStatus;
  clientId: number | null;
  scooterId: number | null;
  managerId: number | null;
  price: number;
  purchasePrice: number | null;
  managerCommissionPct: number | null;
  managerCommission: number | null;
  /** Чем рассчитались за технику — фиксируется при подписании (01.09). */
  payMethod?: "cash" | "transfer" | "mixed";
  payCash?: number;
  payTransfer?: number;
  scooterName: string | null;
  modelName: string | null;
  vin: string | null;
  engineNo: string | null;
  frameNumber: string | null;
  purchaseBatch: string | null;
  mileage: number | null;
  comment: string | null;
  cancelReason: string | null;
  contractAt: string | null;
  signedAt: string | null;
  soldAt: string | null;
  createdAt: string;
  updatedAt: string;
  // Подтянутое сервером
  clientName: string | null;
  clientPhone: string | null;
  managerName: string | null;
  managerColor: string | null;
  createdBy: string | null;
  documents: SaleDealDocument[];
};

export type SaleManager = {
  id: number;
  name: string;
  phone: string | null;
  avatarColor: string;
  commissionPct: number;
  userId: number | null;
  active: boolean;
  note: string | null;
  createdAt: string;
  archivedAt: string | null;
};

export type SalePlan = {
  id: number;
  /** Первое число месяца: «2026-08-01». */
  period: string;
  units: number;
  revenue: number;
  profit: number;
  marginPct: number;
  updatedAt: string;
};

export const salesKeys = {
  all: ["sales"] as const,
  deals: ["sales", "deals"] as const,
  managers: ["sales", "managers"] as const,
  plans: ["sales", "plans"] as const,
};

export function useSaleDeals() {
  return useQuery({
    queryKey: salesKeys.deals,
    queryFn: () => api.get<{ items: SaleDeal[] }>("/api/sales/deals"),
    staleTime: 20_000,
  });
}

export function useSaleManagers() {
  return useQuery({
    queryKey: salesKeys.managers,
    queryFn: () => api.get<{ items: SaleManager[] }>("/api/sales/managers"),
    staleTime: 60_000,
  });
}

export function useSalePlans() {
  return useQuery({
    queryKey: salesKeys.plans,
    queryFn: () => api.get<{ items: SalePlan[] }>("/api/sales/plans"),
    staleTime: 60_000,
  });
}

export type SaleDealInput = {
  clientId?: number | null;
  scooterId?: number | null;
  managerId?: number | null;
  price?: number;
  comment?: string | null;
};

export function useCreateSaleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaleDealInput) =>
      api.post<SaleDeal>("/api/sales/deals", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function usePatchSaleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: SaleDealInput & { id: number }) =>
      api.patch<SaleDeal>(`/api/sales/deals/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

/** Отметить, что договор сформирован (шаг 5 сделки). */
export function useGenerateSaleContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<SaleDeal>(`/api/sales/deals/${id}/contract`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

/** Договор подписан → продажа состоялась, техника уходит в «Продан». */
export function useSignSaleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payMethod,
      payCash,
    }: {
      id: number;
      /** Чем рассчитались за технику (01.09). */
      payMethod?: "cash" | "transfer" | "mixed";
      payCash?: number;
    }) =>
      api.post<SaleDeal>(`/api/sales/deals/${id}/sign`, {
        ...(payMethod ? { payMethod } : {}),
        ...(payMethod === "mixed" ? { payCash: payCash ?? 0 } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: salesKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useCancelSaleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: number; reason?: string }) =>
      api.post<SaleDeal>(`/api/sales/deals/${id}/cancel`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: salesKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
    },
  });
}

export function useDeleteSaleDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/sales/deals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export type SaleManagerInput = {
  name: string;
  phone?: string | null;
  avatarColor?: string;
  commissionPct?: number;
  note?: string | null;
  active?: boolean;
};

export function useCreateSaleManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SaleManagerInput) =>
      api.post<SaleManager>("/api/sales/managers", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function usePatchSaleManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<SaleManagerInput> & { id: number }) =>
      api.patch<SaleManager>(`/api/sales/managers/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function useDeleteSaleManager() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true; archived: boolean; deals?: number }>(
        `/api/sales/managers/${id}`,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export type SalePlanInput = {
  /** «2026-08» или «2026-08-01». */
  period: string;
  units?: number;
  revenue?: number;
  profit?: number;
  marginPct?: number;
};

export function useSetSalePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SalePlanInput) =>
      api.put<SalePlan>("/api/sales/plans", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.plans }),
  });
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

/** Ссылка на договор купли-продажи: html — предпросмотр, docx — Word. */
export function saleContractUrl(dealId: number, format: "html" | "docx" = "html") {
  return `${API_BASE}/api/sales/deals/${dealId}/document${format === "docx" ? "?format=docx" : ""}`;
}

/** Загрузка скана подписанного договора. */
export function useUploadSaleDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ dealId, file }: { dealId: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_BASE}/api/sales/deals/${dealId}/documents`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) throw new Error(`upload ${res.status}`);
      return (await res.json()) as SaleDealDocument;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

export function useDeleteSaleDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ dealId, docId }: { dealId: number; docId: number }) =>
      api.delete<{ ok: true }>(`/api/sales/deals/${dealId}/documents/${docId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: salesKeys.all }),
  });
}

/* ==================== расчёты для экрана «Обзор» ==================== */

export type SaleMetrics = {
  units: number;
  revenue: number;
  profit: number;
  marginPct: number;
  commission: number;
};

export function emptyMetrics(): SaleMetrics {
  return { units: 0, revenue: 0, profit: 0, marginPct: 0, commission: 0 };
}

/** Показатели по набору проданных сделок. */
export function computeMetrics(deals: SaleDeal[]): SaleMetrics {
  const sold = deals.filter((d) => d.status === "signed");
  const revenue = sold.reduce((s, d) => s + d.price, 0);
  const profit = sold.reduce((s, d) => s + (d.price - (d.purchasePrice ?? 0)), 0);
  return {
    units: sold.length,
    revenue,
    profit,
    marginPct: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    commission: sold.reduce((s, d) => s + (d.managerCommission ?? 0), 0),
  };
}

/** Прибыль одной сделки. */
export function dealProfit(d: SaleDeal): number {
  return d.price - (d.purchasePrice ?? 0);
}
