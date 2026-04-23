import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type ApiActivityItem = {
  id: number;
  userId: number | null;
  userName: string;
  userRole: string | null;
  entity: string;
  entityId: number | null;
  action: string;
  summary: string;
  meta: unknown;
  createdAt: string;
};

export const activityKeys = {
  all: ["activity"] as const,
  recent: (limit: number) => [...activityKeys.all, "recent", limit] as const,
};

export function useActivityLog(limit = 50) {
  return useQuery({
    queryKey: activityKeys.recent(limit),
    queryFn: () =>
      api
        .get<{ items: ApiActivityItem[] }>(`/api/activity?limit=${limit}`)
        .then((r) => r.items),
    refetchInterval: 30_000, // обновляем каждые 30с чтобы лента жила
  });
}
