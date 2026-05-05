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

/**
 * v0.4.5: лента событий по сущности (для табов «История» в карточках
 * аренды / скутера / клиента). Включает связанные события — например
 * для скутера придут все аренды на него и их события.
 */
export function useActivityTimeline(
  entity: "rental" | "scooter" | "client" | null | undefined,
  id: number | null | undefined,
  limit = 200,
) {
  return useQuery({
    queryKey: [...activityKeys.all, "timeline", entity, id, limit] as const,
    queryFn: () =>
      api.get<{ items: ApiActivityItem[]; rentalIds?: number[]; damageReportIds?: number[] }>(
        `/api/activity/timeline?entity=${entity}&id=${id}&limit=${limit}`,
      ),
    enabled: entity != null && id != null && id > 0,
    staleTime: 15_000,
  });
}
