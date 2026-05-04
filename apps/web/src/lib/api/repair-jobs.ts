import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

const API_BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000";

export type ApiRepairProgressPhoto = {
  id: number;
  progressId: number;
  fileKey: string;
  fileName: string;
  mimeType: string;
  size: number;
  uploadedByUserId: number | null;
  uploadedAt: string;
};

export type ApiRepairProgress = {
  id: number;
  repairJobId: number;
  damageReportItemId: number | null;
  title: string;
  qty: number;
  priceSnapshot: number;
  done: boolean;
  notes: string | null;
  completedAt: string | null;
  completedByUserId: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  photos: ApiRepairProgressPhoto[];
};

export type ApiRepairJob = {
  id: number;
  scooterId: number;
  rentalId: number | null;
  damageReportId: number | null;
  status: "in_progress" | "completed";
  startedAt: string;
  completedAt: string | null;
  createdByUserId: number | null;
  completedByUserId: number | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  scooter: { id: number; name: string; model: string } | null;
  rental: {
    id: number;
    clientId: number | null;
    clientName: string | null;
    startAt: string | null;
  } | null;
  progress: ApiRepairProgress[];
};

export const repairJobsKeys = {
  all: ["repair-jobs"] as const,
  list: (status?: string, scooterId?: number) =>
    [...repairJobsKeys.all, "list", status ?? "all", scooterId ?? null] as const,
  byId: (id: number) => [...repairJobsKeys.all, "id", id] as const,
};

/** Список ремонтов. status: 'active' | 'completed' | 'all' (default). */
export function useRepairJobs(opts?: {
  status?: "active" | "completed" | "all";
  scooterId?: number;
}) {
  const status = opts?.status ?? "all";
  const scooterId = opts?.scooterId;
  return useQuery({
    queryKey: repairJobsKeys.list(status, scooterId),
    queryFn: () => {
      const qs = new URLSearchParams();
      if (status !== "all") qs.set("status", status);
      if (scooterId) qs.set("scooterId", String(scooterId));
      const q = qs.toString();
      return api
        .get<{ items: ApiRepairJob[] }>(
          `/api/repair-jobs${q ? `?${q}` : ""}`,
        )
        .then((r) => r.items);
    },
  });
}

export function useRepairJob(id: number | null) {
  return useQuery({
    enabled: id != null,
    queryKey: repairJobsKeys.byId(id ?? 0),
    queryFn: () => api.get<ApiRepairJob>(`/api/repair-jobs/${id}`),
  });
}

export function usePatchRepairProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      progressId: number;
      patch: { done?: boolean; notes?: string | null };
    }) =>
      api.patch<ApiRepairJob>(
        `/api/repair-jobs/progress/${args.progressId}`,
        args.patch,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repairJobsKeys.all });
    },
  });
}

export function useAddRepairProgressItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      jobId: number;
      title: string;
      notes?: string | null;
      qty?: number;
      priceSnapshot?: number;
    }) =>
      api.post<ApiRepairJob>(`/api/repair-jobs/${args.jobId}/progress`, {
        title: args.title,
        notes: args.notes ?? null,
        qty: args.qty,
        priceSnapshot: args.priceSnapshot,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repairJobsKeys.all });
    },
  });
}

export function useDeleteRepairProgressItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (progressId: number) =>
      api.delete<ApiRepairJob>(`/api/repair-jobs/progress/${progressId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repairJobsKeys.all });
    },
  });
}

export function useUploadRepairPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { progressId: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", args.file);
      // api.post wrap'нет тело в JSON — используем raw fetch для multipart.
      const res = await fetch(
        `${API_BASE}/api/repair-jobs/progress/${args.progressId}/photos`,
        { method: "POST", credentials: "include", body: fd },
      );
      if (!res.ok) {
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* ignore */
        }
        const msg =
          (body as { message?: string; error?: string })?.message ??
          (body as { message?: string; error?: string })?.error ??
          `upload ${res.status}`;
        throw new Error(msg);
      }
      return (await res.json()) as ApiRepairProgressPhoto;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repairJobsKeys.all });
    },
  });
}

export function useDeleteRepairPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (photoId: number) =>
      api.delete<void>(`/api/repair-jobs/photos/${photoId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repairJobsKeys.all });
    },
  });
}

export function useCompleteRepairJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      jobId: number;
      newScooterStatus?:
        | "ready"
        | "rental_pool"
        | "repair"
        | "buyout"
        | "for_sale"
        | "sold"
        | "disassembly";
      note?: string | null;
    }) =>
      api.post<ApiRepairJob>(`/api/repair-jobs/${args.jobId}/complete`, {
        newScooterStatus: args.newScooterStatus ?? "rental_pool",
        ...(args.note !== undefined ? { note: args.note } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: repairJobsKeys.all });
      qc.invalidateQueries({ queryKey: ["scooters"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
    },
  });
}
