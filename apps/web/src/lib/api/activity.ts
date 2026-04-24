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
  page: (limit: number, offset: number) =>
    [...activityKeys.all, "page", limit, offset] as const,
};

/** Короткая лента для дашборда — без пагинации. */
export function useActivityLog(limit = 50) {
  return useQuery({
    queryKey: activityKeys.recent(limit),
    queryFn: () =>
      api
        .get<{ items: ApiActivityItem[]; total: number }>(
          `/api/activity?limit=${limit}`,
        )
        .then((r) => r.items),
    refetchInterval: 30_000, // обновляем каждые 30с чтобы лента жила
  });
}

/** Страничный доступ к журналу — для модалки «Весь журнал». */
export function useActivityPage(limit: number, offset: number) {
  return useQuery({
    queryKey: activityKeys.page(limit, offset),
    queryFn: () =>
      api.get<{ items: ApiActivityItem[]; total: number }>(
        `/api/activity?limit=${limit}&offset=${offset}`,
      ),
  });
}
