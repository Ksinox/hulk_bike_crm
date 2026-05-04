/**
 * v0.3.8 — учёт долгов аренды.
 *
 * Долг в системе раскладывается на три плашки:
 *  • просрочка   — derived: 1.5 × rate × overdueDays на момент now()
 *  • ущерб       — damage_reports.debt (источник правды — таблица)
 *  • ручной долг — debt_entries (manual_charge − manual_forgive)
 *
 * Этот хук агрегирует всё в одном объекте + отдаёт ленту событий
 * для таба «История долгов».
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type DebtKind =
  | "manual_charge"
  | "manual_forgive"
  | "overdue_forgive"
  | "overdue_payment";

export type DebtEntry = {
  id: number;
  rentalId: number;
  kind: DebtKind;
  amount: number;
  comment: string | null;
  createdByUserId: number | null;
  createdByName: string | null;
  createdAt: string;
};

export type DebtSummary = {
  /** Дней просрочки на момент запроса. 0 если не просрочена. */
  overdueDays: number;
  /** Дневная ставка аренды (для подсказок UI). */
  overdueRate: number;
  /** Полное начисление просрочки (1.5 × rate × overdueDays). */
  overdueCharge: number;
  /** Сколько уже простили из просрочки. */
  overdueForgiven: number;
  /** Сколько уже оплачено в счёт просрочки. */
  overduePaid: number;
  /** Текущий остаток просрочки (overdueCharge - forgiven - paid). */
  overdueBalance: number;
  /** Остаток ручного долга (charge - forgive). */
  manualBalance: number;
  /** Остаток долга по ущербу (Σ damage_reports.debt). */
  damageBalance: number;
  /** Итого: overdueBalance + manualBalance + damageBalance. */
  total: number;
  /** Лента событий долга (последние сверху). */
  events: DebtEntry[];
  /** Снимок damage_reports для таба «История» (без items). */
  damageReports: {
    id: number;
    total: number;
    depositCovered: number;
    clientAgreement: "pending" | "agreed" | "disputed";
    createdAt: string;
  }[];
};

export const debtKeys = {
  all: ["rental-debt"] as const,
  one: (rentalId: number) => [...debtKeys.all, rentalId] as const,
};

export function useRentalDebt(rentalId: number | null | undefined) {
  return useQuery({
    queryKey: debtKeys.one(rentalId ?? 0),
    queryFn: () =>
      api.get<DebtSummary>(`/api/rentals/${rentalId}/debt`),
    enabled: rentalId != null && rentalId > 0,
  });
}

export function useChargeManualDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      rentalId: number;
      amount: number;
      comment: string;
    }) =>
      api.post<DebtEntry>(`/api/rentals/${args.rentalId}/debt/manual`, {
        amount: args.amount,
        comment: args.comment,
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: debtKeys.one(vars.rentalId) });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useForgiveOverdue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { rentalId: number; comment?: string }) =>
      api.post<DebtEntry>(
        `/api/rentals/${args.rentalId}/debt/forgive-overdue`,
        { comment: args.comment ?? "" },
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: debtKeys.one(vars.rentalId) });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

export function useDeleteDebtEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { rentalId: number; entryId: number }) =>
      api.delete<{ ok: true }>(
        `/api/rentals/${args.rentalId}/debt/${args.entryId}`,
      ),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: debtKeys.one(vars.rentalId) });
    },
  });
}
