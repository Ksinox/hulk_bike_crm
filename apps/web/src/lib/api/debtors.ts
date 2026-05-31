/**
 * TanStack Query хуки для модуля «Должники».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  Debtor,
  DebtorDetail,
  DebtType,
  PaymentMethod,
  CallOutcome,
  Stage,
  TodayBundle,
} from "@/lib/debtors/types";

const keys = {
  all: ["debtors"] as const,
  list: (params?: Record<string, string>) => [...keys.all, "list", params ?? {}] as const,
  today: () => [...keys.all, "today"] as const,
  dashboardStats: () => [...keys.all, "dashboard-stats"] as const,
  detail: (id: number) => [...keys.all, "detail", id] as const,
};

/**
 * Дело-должник связано с карточкой клиента (метка «Должник», вкладка с
 * прогрессом, лента событий). Любая мутация по делу должна обновлять и
 * клиентские данные, чтобы суммы/история подтягивались по всей системе.
 */
function invalidateLinked(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["clients"] });
  qc.invalidateQueries({ queryKey: ["activity"] });
}

export function useDebtorsList(params?: { stage?: string; type?: string; closed?: boolean }) {
  const q: Record<string, string> = {};
  if (params?.stage) q.stage = params.stage;
  if (params?.type) q.type = params.type;
  if (params?.closed) q.closed = "1";
  const qs = new URLSearchParams(q).toString();
  return useQuery({
    queryKey: keys.list(q),
    queryFn: () => api.get<{ items: Debtor[] }>(`/api/debtors${qs ? "?" + qs : ""}`),
    staleTime: 30_000,
  });
}

export function useDebtorsToday() {
  return useQuery({
    queryKey: keys.today(),
    queryFn: () => api.get<TodayBundle>("/api/debtors/today"),
    staleTime: 30_000,
  });
}

export function useDebtorsDashboardStats() {
  return useQuery({
    queryKey: keys.dashboardStats(),
    queryFn: () =>
      api.get<{
        totalActive: number;
        totalOverdueSum: number;
        buckets: {
          rental: { count: number; items: { id: number; caseNumber: string; sum: number }[] };
          damage: { count: number; items: { id: number; caseNumber: string; sum: number }[] };
          other: { count: number; items: { id: number; caseNumber: string; sum: number }[] };
        };
      }>("/api/debtors/dashboard-stats"),
    staleTime: 30_000,
  });
}

export function useDebtor(id: number | null) {
  return useQuery({
    queryKey: id ? keys.detail(id) : ["debtors", "detail", "null"],
    queryFn: () => api.get<DebtorDetail>(`/api/debtors/${id}`),
    enabled: id != null,
    staleTime: 10_000,
  });
}

export function useCreateDebtor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      clientId?: number | null;
      externalName?: string | null;
      externalPhone?: string | null;
      type: DebtType;
      totalAmount: number;
      psyRating?: number;
      clientStatus?: "active" | "closed";
      comment?: string | null;
      insuranceCompany?: string | null;
      relatedRentalId?: number | null;
    }) => api.post<Debtor>("/api/debtors", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      invalidateLinked(qc);
    },
  });
}

export function usePatchDebtor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: Partial<Debtor> }) =>
      api.patch<Debtor>(`/api/debtors/${args.id}`, args.patch),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export function useTransitionDebtor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; toStage: Stage; reason?: string }) =>
      api.post<Debtor>(`/api/debtors/${args.id}/transition`, {
        toStage: args.toStage,
        reason: args.reason,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: keys.all });
      invalidateLinked(qc);
    },
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      mode: "by_count" | "by_amount";
      count?: number;
      perPayment?: number;
      totalAmount?: number;
      startDate: string;
      frequency: "daily" | "weekly" | "biweekly" | "monthly";
    }) =>
      api.post<{ schedule: unknown[] }>(`/api/debtors/${args.id}/schedule`, {
        mode: args.mode,
        count: args.count,
        perPayment: args.perPayment,
        totalAmount: args.totalAmount,
        startDate: args.startDate,
        frequency: args.frequency,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: keys.all });
      invalidateLinked(qc);
    },
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      paymentN?: number;
      amount: number;
      method: PaymentMethod;
      paidAt?: string;
      note?: string;
      allocate?: "term" | "total";
    }) =>
      api.post<unknown>(`/api/debtors/${args.id}/payments`, {
        paymentN: args.paymentN,
        amount: args.amount,
        method: args.method,
        paidAt: args.paidAt,
        note: args.note,
        allocate: args.allocate,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: keys.all });
      invalidateLinked(qc);
    },
  });
}

export function useLogCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      outcome: CallOutcome;
      promisedDate?: string;
      note?: string;
    }) =>
      api.post<unknown>(`/api/debtors/${args.id}/calls`, {
        outcome: args.outcome,
        promisedDate: args.promisedDate,
        note: args.note,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.detail(vars.id) });
      invalidateLinked(qc);
    },
  });
}

export function useAddNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; text: string }) =>
      api.post<unknown>(`/api/debtors/${args.id}/notes`, { text: args.text }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: keys.detail(vars.id) }),
  });
}

export function useTransferLawyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; lawyerName: string; reason?: string }) =>
      api.post<unknown>(`/api/debtors/${args.id}/transfer-lawyer`, {
        lawyerName: args.lawyerName,
        reason: args.reason,
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: keys.detail(vars.id) });
      qc.invalidateQueries({ queryKey: keys.all });
    },
  });
}

export function useLawyerUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; note: string }) =>
      api.post<unknown>(`/api/debtors/${args.id}/lawyer-update`, { note: args.note }),
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: keys.detail(vars.id) }),
  });
}

export function useCloseDebtor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      toStage: "closed_paid" | "closed_written_off" | "closed_settled" | "closed_court";
      reason?: string;
    }) =>
      api.post<unknown>(`/api/debtors/${args.id}/close`, {
        toStage: args.toStage,
        reason: args.reason,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.all });
      invalidateLinked(qc);
    },
  });
}
