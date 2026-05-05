import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiDamageReportItem = {
  id: number;
  reportId: number;
  priceItemId: number | null;
  name: string;
  originalPrice: number;
  finalPrice: number;
  quantity: number;
  comment: string | null;
  sortOrder: number;
  createdAt: string;
};

export type ApiDamagePayment = {
  id: number;
  rentalId: number;
  type: "damage";
  amount: number;
  method: "cash" | "card" | "transfer" | "deposit";
  paid: boolean;
  paidAt: string | null;
  note: string | null;
  receivedByUserId: number | null;
  receivedByName: string | null;
  damageReportId: number | null;
  createdAt: string;
};

export type DamageClientAgreement = "pending" | "agreed" | "disputed";

export type ApiDamageReport = {
  id: number;
  rentalId: number;
  createdByUserId: number | null;
  total: number;
  depositCovered: number;
  note: string | null;
  /** v0.2.75: реакция клиента на акт после печати. */
  clientAgreement: DamageClientAgreement;
  createdAt: string;
  updatedAt: string;
  items: ApiDamageReportItem[];
  payments: ApiDamagePayment[];
  paidSum: number;
  debt: number;
};

export type CreateDamageItem = {
  priceItemId?: number | null;
  name: string;
  originalPrice: number;
  finalPrice: number;
  quantity: number;
  comment?: string | null;
};

export type CreateDamageReportInput = {
  rentalId: number;
  items: CreateDamageItem[];
  depositCovered?: number;
  note?: string | null;
  sendScooterToRepair?: boolean;
};

export type DamagePaymentInput = {
  amount: number;
  note?: string | null;
  method?: "cash" | "card" | "transfer" | "deposit";
};

export const damageReportsKeys = {
  all: ["damage-reports"] as const,
  byRental: (rentalId: number) =>
    [...damageReportsKeys.all, "rental", rentalId] as const,
  byId: (id: number) => [...damageReportsKeys.all, "id", id] as const,
};

export function useDamageReports(rentalId: number | null) {
  return useQuery({
    enabled: rentalId != null,
    queryKey: damageReportsKeys.byRental(rentalId ?? 0),
    queryFn: () =>
      api
        .get<{ items: ApiDamageReport[] }>(
          `/api/damage-reports?rentalId=${rentalId}`,
        )
        .then((r) => r.items),
  });
}

/**
 * Все damage_reports в системе. Используется на дашборде, чтобы быстро
 * вычислить какие аренды имеют долг по ущербу и подсветить их плитки
 * красным в Парке.
 */
export function useAllDamageReports() {
  return useQuery({
    queryKey: [...damageReportsKeys.all, "list-all"] as const,
    queryFn: () =>
      api
        .get<{ items: ApiDamageReport[] }>(`/api/damage-reports`)
        .then((r) => r.items),
    staleTime: 30_000,
  });
}

/**
 * Все акты ущерба по ВСЕЙ цепочке аренд (root + продления + замены, в т.ч.
 * вручную удалённые сегменты). Нужно для расчёта долга, который должен
 * сохраняться даже если связку, на которой создавался акт, удалили
 * (заказчик: «если мы передумали учитывать продление — это не значит что
 *  мы откатились назад по долгу»).
 *
 * Возвращает плоский массив reports + флаги загрузки.
 */
export function useChainDamageReports(rentalIds: number[]) {
  const queries = useQueries({
    queries: rentalIds.map((id) => ({
      queryKey: damageReportsKeys.byRental(id),
      queryFn: () =>
        api
          .get<{ items: ApiDamageReport[] }>(
            `/api/damage-reports?rentalId=${id}`,
          )
          .then((r) => r.items),
      // Кэш по id живёт независимо от цепочки — react-query уже умеет
      // дедуплицировать через queryKey.
      staleTime: 30_000,
    })),
  });
  const data: ApiDamageReport[] = queries.flatMap((q) => q.data ?? []);
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);
  return { data, isLoading, isError };
}

export function useCreateDamageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDamageReportInput) =>
      api.post<ApiDamageReport>("/api/damage-reports", input),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({
        queryKey: damageReportsKeys.byRental(vars.rentalId),
      });
    },
  });
}

export function usePatchDamageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      id: number;
      patch: {
        depositCovered?: number;
        note?: string | null;
        items?: CreateDamageItem[];
      };
    }) =>
      api.patch<ApiDamageReport>(`/api/damage-reports/${args.id}`, args.patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
    },
  });
}

export function useDeleteDamageReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/damage-reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: damageReportsKeys.all }),
  });
}

/** Установить реакцию клиента на акт (agreed/disputed). v0.2.75. */
export function useDamageAgreement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      reportId: number;
      agreement: "agreed" | "disputed";
    }) =>
      api.post<ApiDamageReport>(
        `/api/damage-reports/${args.reportId}/agreement`,
        { agreement: args.agreement },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/** Внести платёж по акту. receivedByUserId сервер ставит сам. */
export function useDamagePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { reportId: number; input: DamagePaymentInput }) =>
      api.post<ApiDamageReport>(
        `/api/damage-reports/${args.reportId}/payment`,
        args.input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: damageReportsKeys.all });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}
