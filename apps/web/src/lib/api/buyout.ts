import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/**
 * «Аренда с выкупом» (01.09).
 *
 * Сервер отдаёт сделки вместе с графиком и посчитанным прогрессом —
 * прогресс, просрочка и остаток считаются по графику, а не хранятся
 * флагом: иначе они «протухают» при любой правке.
 */

export type BuyoutStatus =
  | "draft"
  | "contract"
  | "active"
  | "closed"
  | "defaulted"
  | "cancelled";

export type BuyoutScheduleRow = {
  id: number;
  dealId: number;
  seq: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  paidAt: string | null;
  note: string | null;
};

export type BuyoutProgress = {
  due: number;
  paid: number;
  left: number;
  percent: number;
  paidCount: number;
  leftCount: number;
  overdueCount: number;
  overdueAmount: number;
  overdueDays: number;
  nextDue: { date: string; amount: number } | null;
};

export type BuyoutDeal = {
  id: number;
  status: BuyoutStatus;
  clientId: number | null;
  scooterId: number | null;
  managerId: number | null;
  scooterPrice: number;
  termMonths: number;
  markup: number;
  total: number;
  downPayment: number;
  financed: number;
  period: "month" | "week";
  paymentAmount: number;
  paymentsCount: number;
  startDate: string | null;
  blacklistChecked: boolean;
  airtagConfirmed: boolean;
  scooterName: string | null;
  modelName: string | null;
  vin: string | null;
  engineNo: string | null;
  frameNumber: string | null;
  mileage: number | null;
  comment: string | null;
  cancelReason: string | null;
  contractAt: string | null;
  signedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  // подтянутое сервером
  clientName: string | null;
  clientPhone: string | null;
  clientBlacklisted: boolean;
  managerName: string | null;
  managerColor: string | null;
  createdBy: string | null;
  schedule: BuyoutScheduleRow[];
  progress: BuyoutProgress;
};

export type BuyoutPaymentRecord = {
  id: number;
  dealId: number;
  amount: number;
  paidAt: string;
  method: string;
  kind: "down_payment" | "regular" | "early_partial" | "early_full";
  note: string | null;
};

export const buyoutKeys = {
  all: ["buyout"] as const,
  deals: ["buyout", "deals"] as const,
  markups: ["buyout", "markups"] as const,
  payments: (id: number) => ["buyout", "payments", id] as const,
};

export function useBuyoutDeals() {
  return useQuery({
    queryKey: buyoutKeys.deals,
    queryFn: () => api.get<{ items: BuyoutDeal[] }>("/api/buyout/deals"),
    staleTime: 20_000,
  });
}

export function useBuyoutMarkups() {
  return useQuery({
    queryKey: buyoutKeys.markups,
    queryFn: () =>
      api.get<{ markups: Record<string, number> }>("/api/buyout/markups"),
    staleTime: 300_000,
  });
}

export type BuyoutDealInput = {
  clientId?: number | null;
  scooterId?: number | null;
  managerId?: number | null;
  scooterPrice?: number;
  termMonths?: number;
  downPayment?: number;
  period?: "month" | "week";
  startDate?: string | null;
  blacklistChecked?: boolean;
  airtagConfirmed?: boolean;
  comment?: string | null;
};

export function useCreateBuyoutDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BuyoutDealInput) =>
      api.post<BuyoutDeal>("/api/buyout/deals", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyoutKeys.all }),
  });
}

export function usePatchBuyoutDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: BuyoutDealInput & { id: number }) =>
      api.patch<BuyoutDeal>(`/api/buyout/deals/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyoutKeys.all }),
  });
}

export function useBuyoutContract() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<BuyoutDeal>(`/api/buyout/deals/${id}/contract`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyoutKeys.all }),
  });
}

/** Подписание: строит график и переводит технику в «Выкуп». */
export function useSignBuyoutDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<BuyoutDeal>(`/api/buyout/deals/${id}/sign`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buyoutKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
    },
  });
}

export function useBuyoutPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      amount: number;
      method?: "cash" | "card" | "transfer";
      note?: string | null;
      /** Полное досрочное погашение — сервер сам возьмёт остаток. */
      payoff?: boolean;
    }) =>
      api.post<{ ok: true; closed: boolean; progress: BuyoutProgress }>(
        `/api/buyout/deals/${id}/payments`,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buyoutKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useCancelBuyoutDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      reason,
      status,
    }: {
      id: number;
      reason?: string;
      /** «defaulted» — выкуп сорван, техника изымается. */
      status?: "cancelled" | "defaulted";
    }) => api.post<BuyoutDeal>(`/api/buyout/deals/${id}/cancel`, { reason, status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: buyoutKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
    },
  });
}

export function useDeleteBuyoutDeal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/buyout/deals/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyoutKeys.all }),
  });
}

export function useBuyoutPayments(id: number | null) {
  return useQuery({
    queryKey: buyoutKeys.payments(id ?? 0),
    queryFn: () =>
      api.get<{
        payments: BuyoutPaymentRecord[];
        schedule: BuyoutScheduleRow[];
        progress: BuyoutProgress;
        discipline: {
          onTime: number;
          late: number;
          avgLateDays: number;
          score: number;
        };
      }>(`/api/buyout/deals/${id}/payments`),
    enabled: id != null,
    staleTime: 10_000,
  });
}

export function useSetBuyoutMarkups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (markups: Record<string, number>) =>
      api.put<{ markups: Record<string, number> }>("/api/buyout/markups", {
        markups,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: buyoutKeys.markups }),
  });
}

const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function buyoutContractUrl(id: number, format: "html" | "docx" = "html") {
  return `${API_BASE}/api/buyout/deals/${id}/document${format === "docx" ? "?format=docx" : ""}`;
}

export const BUYOUT_STATUS_LABEL: Record<BuyoutStatus, string> = {
  draft: "Черновик",
  contract: "Договор сформирован",
  active: "Выплачивается",
  closed: "Выкуплен",
  defaulted: "Сорван",
  cancelled: "Отменён",
};

export const BUYOUT_STATUS_CLASS: Record<BuyoutStatus, string> = {
  draft: "bg-surface-soft text-muted",
  contract: "bg-orange-soft text-orange-ink",
  active: "bg-blue-50 text-blue-700",
  closed: "bg-emerald-100 text-emerald-700",
  defaulted: "bg-red-soft text-red-ink",
  cancelled: "bg-surface-soft text-muted-2",
};
