import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Пункт 1 — очередь подтверждений «ключом директора». */

export type ApprovalRequest = {
  id: number;
  action: string;
  summary: string;
  /** Старые запросы — строки; с 22.10 — { facts, note } (см. OperationBrief). */
  detailsJson: string[] | { facts?: unknown; note?: string[] } | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  requestedByUserId: number | null;
  requestedByName: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedByName: string | null;
  consumedAt: string | null;
};

/** keySet — защита включена (ключом или меняющимся кодом). */
export type ApprovalsStatus = {
  keySet: boolean;
  mode?: "off" | "key" | "code";
  /** Это аккаунт директора — подтверждает одним нажатием, видит код. */
  isDirector?: boolean;
  pending: number;
};

export const approvalsKeys = {
  all: ["approvals"] as const,
  status: ["approvals", "status"] as const,
};

/** Установлен ли ключ + число висящих запросов. Поллинг — очередь должна
 *  сама появляться у директора на телефоне без перезагрузки. */
export function useApprovalsStatus() {
  return useQuery({
    queryKey: approvalsKeys.status,
    queryFn: () =>
      api.get<ApprovalsStatus>("/api/approvals/status"),
    refetchInterval: 15_000,
  });
}

export function usePendingApprovals(enabled = true) {
  return useQuery({
    queryKey: [...approvalsKeys.all, "pending"],
    queryFn: () =>
      api.get<{ items: ApprovalRequest[] }>("/api/approvals?status=pending"),
    refetchInterval: 10_000,
    enabled,
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; key?: string }) =>
      api.post<ApprovalRequest>(
        `/api/approvals/${args.id}/approve`,
        args.key ? { key: args.key } : {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: approvalsKeys.all }),
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; key?: string }) =>
      api.post<ApprovalRequest>(
        `/api/approvals/${args.id}/reject`,
        args.key ? { key: args.key } : {},
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: approvalsKeys.all }),
  });
}

export type DirectorCode = {
  code: string;
  period: number;
  serverNow: number;
  endsAt: number;
};
