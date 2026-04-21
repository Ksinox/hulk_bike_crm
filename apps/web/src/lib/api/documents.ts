import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Документ скутера / клиента, как возвращается API.
 */
export type ApiDoc = {
  id: number;
  fileKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type ApiClientDoc = ApiDoc & {
  clientId: number;
  kind: "photo" | "passport" | "license" | "extra";
  title: string | null;
  comment: string | null;
};

export type ApiScooterDoc = ApiDoc & {
  scooterId: number;
  kind: "pts" | "sts" | "osago" | "purchase" | "photo";
  osagoValidUntil: string | null;
};

/** URL-ы для открытия/скачивания — файл всегда стримится через api */
const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

export function fileUrl(
  fileKey: string,
  opts: { download?: boolean; filename?: string } = {},
): string {
  const params = new URLSearchParams();
  if (opts.download) params.set("disposition", "attachment");
  if (opts.filename) params.set("filename", opts.filename);
  const qs = params.toString();
  return `${API_BASE}/api/files/${encodeURI(fileKey)}${qs ? `?${qs}` : ""}`;
}

/* ============ Scooter documents ============ */

export const scooterDocsKeys = {
  byScooter: (scooterId: number) =>
    ["scooter-documents", "byScooter", scooterId] as const,
};

export function useApiScooterDocs(scooterId: number) {
  return useQuery({
    queryKey: scooterDocsKeys.byScooter(scooterId),
    queryFn: () =>
      api
        .get<{ items: ApiScooterDoc[] }>(
          `/api/scooter-documents?scooterId=${scooterId}`,
        )
        .then((r) => r.items),
  });
}

export function useUploadScooterDoc(scooterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: ApiScooterDoc["kind"];
      file: File;
      osagoValidUntil?: string;
    }) => {
      const fd = new FormData();
      fd.append("scooterId", String(scooterId));
      fd.append("kind", args.kind);
      if (args.osagoValidUntil) fd.append("osagoValidUntil", args.osagoValidUntil);
      fd.append("file", args.file);
      const res = await fetch(`${API_BASE}/api/scooter-documents/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {}
        throw new Error(`upload ${res.status} ${JSON.stringify(body)}`);
      }
      return (await res.json()) as ApiScooterDoc;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterDocsKeys.byScooter(scooterId) });
    },
  });
}

export function usePatchScooterDoc(scooterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; osagoValidUntil: string | null }) =>
      api.patch<ApiScooterDoc>(`/api/scooter-documents/${args.id}`, {
        osagoValidUntil: args.osagoValidUntil,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterDocsKeys.byScooter(scooterId) });
    },
  });
}

export function useDeleteScooterDoc(scooterId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/scooter-documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: scooterDocsKeys.byScooter(scooterId) });
    },
  });
}

/* ============ Client documents ============ */

export const clientDocsKeys = {
  byClient: (clientId: number) =>
    ["client-documents", "byClient", clientId] as const,
};

export function useApiClientDocs(clientId: number) {
  return useQuery({
    queryKey: clientDocsKeys.byClient(clientId),
    queryFn: () =>
      api
        .get<{ items: ApiClientDoc[] }>(
          `/api/client-documents?clientId=${clientId}`,
        )
        .then((r) => r.items),
  });
}

export function useUploadClientDoc(clientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      kind: ApiClientDoc["kind"];
      file: File;
      title?: string;
      comment?: string;
    }) => {
      const fd = new FormData();
      fd.append("clientId", String(clientId));
      fd.append("kind", args.kind);
      if (args.title) fd.append("title", args.title);
      if (args.comment) fd.append("comment", args.comment);
      fd.append("file", args.file);
      const res = await fetch(`${API_BASE}/api/client-documents/upload`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {}
        throw new Error(`upload ${res.status} ${JSON.stringify(body)}`);
      }
      return (await res.json()) as ApiClientDoc;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientDocsKeys.byClient(clientId) });
    },
  });
}

export function useDeleteClientDoc(clientId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      api.delete<{ ok: true }>(`/api/client-documents/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: clientDocsKeys.byClient(clientId) });
    },
  });
}
