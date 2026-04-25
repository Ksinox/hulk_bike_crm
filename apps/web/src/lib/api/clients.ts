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
