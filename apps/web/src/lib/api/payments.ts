import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ListResponse, PaymentMethod } from "./types";

export type ApiPayment = {
  id: number;
  rentalId: number;
  type: "rent" | "deposit" | "fine" | "damage" | "refund" | "swap_fee";
  amount: number;
  method: PaymentMethod;
  paid: boolean;
  paidAt: string | null;
  scheduledOn: string | null;
  note: string | null;
  /** v0.4.26: ссылка на damage_report для типа='damage'. */
  damageReportId?: number | null;
  createdAt: string;
};

export const paymentsKeys = {
  all: ["payments"] as const,
  byRental: (rentalId: number) => [...paymentsKeys.all, "rental", rentalId] as const,
};

export function useApiPayments(rentalId?: number) {
  return useQuery({
    queryKey:
      rentalId != null ? paymentsKeys.byRental(rentalId) : paymentsKeys.all,
    queryFn: () =>
      api
        .get<ListResponse<ApiPayment>>(
          rentalId != null ? `/api/payments?rentalId=${rentalId}` : `/api/payments`,
        )
        .then((r) => r.items),
  });
}
