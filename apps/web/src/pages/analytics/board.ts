import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Доска аналитики (06.09) — что и как показывать на экране показателей.
 *
 * Доска общая: её собирает директор, а видят все, потому что тот же экран
 * висит на втором мониторе для сотрудников. Хранится на сервере, чтобы не
 * зависеть от браузера и переезжала на любой монитор.
 */

export type TileSize = "s" | "m" | "l";
export type BoardPeriod = "today" | "week" | "month" | "year";

export type BoardTile = {
  /** Идентификатор показателя из каталога (metrics.ts). */
  metric: string;
  size: TileSize;
  /** Ручной план. null/undefined — плана нет. */
  plan?: number | null;
  /** Свой период плитки; null — общий период доски. */
  period?: BoardPeriod | null;
};

export type Board = {
  tiles: BoardTile[];
  period: BoardPeriod;
  title?: string;
};

export const PERIOD_LABEL: Record<BoardPeriod, string> = {
  today: "Сегодня",
  week: "Неделя",
  month: "Месяц",
  year: "Год",
};

/** Доска по умолчанию — то, что директор хотел видеть в первую очередь. */
export const DEFAULT_BOARD: Board = {
  // Планы у нас месячные (как в «Продажах»), поэтому доска по умолчанию
  // смотрит на месяц: тогда видно темп — успеваем ли к концу месяца.
  period: "month",
  title: "Как идут дела",
  tiles: [
    { metric: "rent.park_load", size: "l", plan: null },
    { metric: "rent.active", size: "m", plan: null },
    { metric: "rent.overdue", size: "m", plan: null },
    { metric: "rent.income_today", size: "m", plan: null },
    { metric: "rent.revenue", size: "m", plan: null },
    { metric: "rent.returns", size: "s", plan: null, period: "week" },
    { metric: "rent.new_clients", size: "s", plan: null, period: "week" },
    { metric: "sales.count", size: "s", plan: null },
    { metric: "sales.revenue", size: "m", plan: null },
    { metric: "service.count", size: "s", plan: null },
    { metric: "service.revenue", size: "s", plan: null },
    { metric: "buyout.active", size: "s", plan: null },
    { metric: "plan.summary", size: "l" },
  ],
};

const boardKey = ["analytics", "board"] as const;

export function useAnalyticsBoard() {
  return useQuery({
    queryKey: boardKey,
    queryFn: () =>
      api.get<{ board: Board | null; updatedAt?: string }>("/api/analytics/board"),
    staleTime: 15_000,
    // Стена висит часами — подтягиваем изменения доски сами.
    refetchInterval: 60_000,
  });
}

export function useSaveAnalyticsBoard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (board: Board) =>
      api.put<{ ok: true; board: Board }>("/api/analytics/board", board),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey }),
  });
}
