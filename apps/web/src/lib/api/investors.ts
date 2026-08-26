import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";

/**
 * Правки 2.0, п.6-8: инвесторы партнёрской техники.
 *
 * Техника заводится ЧЕРЕЗ инвестора, поэтому список инвесторов — это
 * главный экран блока «Партнёрка»: у каждого видно количество единиц,
 * размер инвестиций и средний доход.
 */

export type ApiInvestor = {
  id: number;
  name: string;
  phone: string | null;
  note: string | null;
  /** Периодичность выплат: раз в неделю / раз в месяц. */
  payoutPeriod: "week" | "month";
  /** week: 1 (пн) … 7 (вс); month: число месяца. */
  payoutDay: number;
  createdAt: string;
  /** Живая техника инвестора. */
  units: number;
  /** Размер инвестиций = Σ цен закупа его техники. */
  invested: number;
  /** Выручка его техники за период. */
  revenue: number;
  /** Доход инвестора за период (его доля). */
  income: number;
  /** Доход, приведённый к 30 дням — «средний ежемесячный». */
  monthlyIncome: number;
  scooterIds: number[];
};

export type InvestorPayoutRow = {
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: number;
  isDueToday: boolean;
  paid: { id: number; amount: number; paidAt: string; note: string | null } | null;
};

export type InvestorPayouts = {
  investor: {
    id: number;
    name: string;
    payoutPeriod: "week" | "month";
    payoutDay: number;
  };
  /** Текущий незакрытый период — «набежало N ₽, выплата такого-то». */
  current: {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    amount: number;
    daysLeft: number;
  };
  items: InvestorPayoutRow[];
};

export const investorsKeys = {
  all: ["investors"] as const,
  list: (from?: string, to?: string) => ["investors", "list", from, to] as const,
  payouts: (id: number) => ["investors", "payouts", id] as const,
};

export function useApiInvestors(period?: { from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (period?.from) qs.set("from", period.from);
  if (period?.to) qs.set("to", period.to);
  const suffix = qs.toString() ? `?${qs}` : "";
  return useQuery({
    queryKey: investorsKeys.list(period?.from, period?.to),
    queryFn: () =>
      api.get<{ items: ApiInvestor[]; period: { from: string; to: string } }>(
        `/api/investors${suffix}`,
      ),
    staleTime: 30_000,
  });
}

export function useInvestorPayouts(id: number | null, count = 8) {
  return useQuery({
    queryKey: investorsKeys.payouts(id ?? 0),
    queryFn: () =>
      api.get<InvestorPayouts>(`/api/investors/${id}/payouts?count=${count}`),
    enabled: id != null,
    staleTime: 15_000,
  });
}

export type InvestorInput = {
  name: string;
  phone?: string | null;
  note?: string | null;
  payoutPeriod?: "week" | "month";
  payoutDay?: number;
};

export function useCreateInvestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: InvestorInput) =>
      api.post<ApiInvestor>("/api/investors", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: investorsKeys.all }),
  });
}

export function usePatchInvestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: InvestorInput & { id: number }) =>
      api.patch<ApiInvestor>(`/api/investors/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: investorsKeys.all }),
  });
}

export function useDeleteInvestor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete<{ ok: true }>(`/api/investors/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: investorsKeys.all }),
  });
}

/** Отметить выплату произведённой (галочка в графике). */
export function useMarkPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: number;
      periodStart: string;
      periodEnd: string;
      amount: number;
      note?: string | null;
    }) => api.post(`/api/investors/${id}/payouts`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: investorsKeys.all }),
  });
}

/** Снять отметку выплаты. */
export function useUnmarkPayout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, payoutId }: { id: number; payoutId: number }) =>
      api.delete(`/api/investors/${id}/payouts/${payoutId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: investorsKeys.all }),
  });
}
