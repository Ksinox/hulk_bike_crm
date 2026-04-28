import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ListResponse } from "./types";
import { clientsKeys } from "./clients";

/**
 * Хуки для работы с публичными заявками клиентов в CRM.
 * Polling каждые 10 сек — обновление в «реальном времени» без WebSocket.
 */

export type ApplicationFileKind =
  | "passport_main"
  | "passport_reg"
  | "license"
  | "selfie";

export type ApplicationFile = {
  id: number;
  kind: ApplicationFileKind;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type ApiApplication = {
  id: number;
  status: "draft" | "new" | "viewed" | "cancelled";
  name: string | null;
  phone: string | null;
  extraPhone: string | null;
  isForeigner: boolean;
  passportRaw: string | null;
  birthDate: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  passportIssuedOn: string | null;
  passportIssuer: string | null;
  passportDivisionCode: string | null;
  passportRegistration: string | null;
  liveAddress: string | null;
  sameAddress: boolean;
  viewedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  files: ApplicationFile[];
};

export const applicationsKeys = {
  all: ["client-applications"] as const,
  list: (status?: string) =>
    [...applicationsKeys.all, "list", status ?? "active"] as const,
  byId: (id: number) => [...applicationsKeys.all, "detail", id] as const,
};

/** Список заявок (по умолчанию — new + viewed). Polling 10 сек. */
export function useApplications() {
  return useQuery({
    queryKey: applicationsKeys.list(),
    queryFn: () =>
      api
        .get<ListResponse<ApiApplication>>("/api/client-applications")
        .then((r) => r.items),
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

export function useApplication(id: number | null) {
  return useQuery({
    queryKey: id == null ? applicationsKeys.all : applicationsKeys.byId(id),
    queryFn: () => api.get<ApiApplication>(`/api/client-applications/${id}`),
    enabled: id != null,
  });
}

export function useMarkApplicationViewed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.post<{ ok: true }>(`/api/client-applications/${id}/mark-viewed`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

export function useDeleteApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/client-applications/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
    },
  });
}

export type ConvertApplicationInput = {
  name: string;
  phone: string;
  extraPhone?: string | null;
  source?: "avito" | "repeat" | "ref" | "maps" | "other";
  sourceCustom?: string | null;
  isForeigner?: boolean;
  passportRaw?: string | null;
  comment?: string | null;
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
  keepFiles?: Partial<Record<ApplicationFileKind, boolean>>;
};

export function useConvertApplication() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: ConvertApplicationInput }) =>
      api.post<{ id: number }>(
        `/api/client-applications/${args.id}/convert`,
        args.input,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: applicationsKeys.all });
      qc.invalidateQueries({ queryKey: clientsKeys.all });
    },
  });
}

/** URL для img src — фото загружается с cookie-сессией менеджера. */
export function applicationFileUrl(
  id: number,
  kind: ApplicationFileKind,
): string {
  const base =
    import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";
  return `${base}/api/client-applications/${id}/files/${kind}`;
}
