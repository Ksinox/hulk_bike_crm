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

/** Фильтры модалки «Весь журнал» (серверная фильтрация). */
export type ActivityFilters = {
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  category?: string;
  role?: string; // фильтр по исполнителю (роли): director / admin / ...
};

export const activityKeys = {
  all: ["activity"] as const,
  recent: (limit: number) => [...activityKeys.all, "recent", limit] as const,
  page: (limit: number, offset: number, filters?: ActivityFilters) =>
    [
      ...activityKeys.all,
      "page",
      limit,
      offset,
      filters?.from ?? "",
      filters?.to ?? "",
      filters?.category ?? "",
      filters?.role ?? "",
    ] as const,
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

/** Страничный доступ к журналу — для модалки «Весь журнал». filters —
 *  серверные фильтры по датам/типу действия (фильтруем ДО пагинации). */
export function useActivityPage(
  limit: number,
  offset: number,
  filters?: ActivityFilters,
) {
  return useQuery({
    queryKey: activityKeys.page(limit, offset, filters),
    queryFn: () => {
      const qs = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (filters?.from) qs.set("from", filters.from);
      if (filters?.to) qs.set("to", filters.to);
      if (filters?.category) qs.set("category", filters.category);
      if (filters?.role) qs.set("role", filters.role);
      return api.get<{ items: ApiActivityItem[]; total: number }>(
        `/api/activity?${qs.toString()}`,
      );
    },
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
