import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApiClient, ListResponse } from "./types";

export const clientsKeys = {
  all: ["clients"] as const,
  list: () => [...clientsKeys.all, "list"] as const,
  byId: (id: number) => [...clientsKeys.all, "detail", id] as const,
};

export function useApiClients() {
  return useQuery({
    queryKey: clientsKeys.list(),
    queryFn: () =>
      api.get<ListResponse<ApiClient>>("/api/clients").then((r) => r.items),
  });
}

export function useApiClient(id: number | null) {
  return useQuery({
    queryKey: id == null ? clientsKeys.all : clientsKeys.byId(id),
    queryFn: () => api.get<ApiClient>(`/api/clients/${id}`),
    enabled: id != null,
  });
}

/** Источник незакрытого долга клиента по аренде (F3): какая аренда, скутер,
 *  период, сколько и за что. Сейчас — долг по ущербу (переезжает с клиентом). */
export type ClientDebtSource = {
  rentalId: number;
  scooterName: string;
  status: string;
  archived: boolean;
  startIso: string;
  endPlannedIso: string;
  type: "damage";
  amount: number;
  label: string;
};

export function useClientDebtSources(clientId: number | null | undefined) {
  return useQuery({
    queryKey: [...clientsKeys.byId(clientId ?? 0), "debt-sources"] as const,
    queryFn: () =>
      api
        .get<{ items: ClientDebtSource[] }>(
          `/api/clients/${clientId}/debt-sources`,
        )
        .then((r) => r.items),
    enabled: clientId != null,
  });
}

/**
 * Принять оплату по СКВОЗНОМУ долгу клиента (ущерб с прошлых аренд). Сумму
 * бэкенд распределяет по незакрытым актам (старые первыми). Инвалидируем всё,
 * что показывает долг: карточка клиента, источники долга, платежи, агрегаты.
 */
export function usePayClientDamageDebt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      clientId: number;
      amount: number;
      method?: "cash" | "card" | "transfer";
    }) =>
      api.post<{ paid: number; applied: { drId: number; amount: number }[] }>(
        `/api/clients/${args.clientId}/pay-damage-debt`,
        { amount: args.amount, method: args.method },
      ),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: clientsKeys.all });
      qc.invalidateQueries({
        queryKey: [...clientsKeys.byId(vars.clientId), "debt-sources"],
      });
      qc.invalidateQueries({ queryKey: ["damage-reports"] });
      qc.invalidateQueries({ queryKey: ["payments"] });
      qc.invalidateQueries({ queryKey: ["rental-debt"] });
      qc.invalidateQueries({ queryKey: ["debt-aggregate"] });
      qc.invalidateQueries({ queryKey: ["rentals"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}

/** Тело POST /api/clients — подмножество ApiClient */
export type CreateClientInput = {
  name: string;
  phone: string;
  extraPhone?: string | null;
  rating?: number;
  source?: ApiClient["source"];
  sourceCustom?: string | null;
  isForeigner?: boolean;
  passportRaw?: string | null;
  comment?: string | null;
  blacklisted?: boolean;
  blacklistReason?: string | null;
  birthDate?: string | null;
  passportSeries?: string | null;
  passportNumber?: string | null;
  passportIssuedOn?: string | null;
  passportIssuer?: string | null;
  passportDivisionCode?: string | null;
  passportRegistration?: string | null;
  licenseNumber?: string | null;
  licenseCategories?: string | null;
  licenseIssuedOn?: string | null;
  licenseExpiresOn?: string | null;
};

export type PatchClientInput = Partial<CreateClientInput> & {
  unreachable?: boolean;
};

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateClientInput) =>
      api.post<ApiClient>("/api/clients", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientsKeys.all });
    },
  });
}

export function usePatchClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; patch: PatchClientInput }) =>
      api.patch<ApiClient>(`/api/clients/${args.id}`, args.patch),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: clientsKeys.all });
      qc.setQueryData(clientsKeys.byId(row.id), row);
    },
  });
}
