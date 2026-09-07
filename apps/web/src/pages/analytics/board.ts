import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Доска аналитики (06.09) — что и как показывать на экране показателей.
 *
 * Доска общая: её собирает директор, а видят все, потому что тот же экран
 * висит на втором мониторе для сотрудников. Хранится на сервере, чтобы не
 * зависеть от браузера и переезжала на любой монитор.
 */

/** Старые три размера — только чтобы прочитать доску, сохранённую до канваса. */
export type TileSize = "s" | "m" | "l";
export type BoardPeriod = "today" | "week" | "month" | "year";

export type BoardTile = {
  /** Идентификатор показателя из каталога (metrics.ts). */
  metric: string;
  /** Ширина и высота в клетках сетки (07.09: канвас). */
  w: number;
  h: number;
  /** @deprecated старые доски; при чтении переводится в w/h. */
  size?: TileSize;
  /** Ручной план. null/undefined — плана нет. */
  plan?: number | null;
  /** Свой период плитки; null — общий период доски. */
  period?: BoardPeriod | null;
};

/** Старый размер → клетки. Герой был 2×2, широкая 2×1, маленькая 1×1. */
export function normalizeTile(t: Partial<BoardTile> & { metric: string }): BoardTile {
  const fromSize =
    t.size === "l" ? { w: 2, h: 2 } : t.size === "m" ? { w: 2, h: 1 } : { w: 1, h: 1 };
  return {
    ...t,
    metric: t.metric,
    w: Math.max(1, Math.min(8, t.w ?? fromSize.w)),
    h: Math.max(1, Math.min(6, t.h ?? fromSize.h)),
  };
}

export function normalizeBoard(b: Board): Board {
  return { ...b, tiles: b.tiles.map(normalizeTile) };
}

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
  // Сетка доски — 4 клетки в ширину на компьютере; герой занимает половину.
  tiles: [
    { metric: "rent.park_load", w: 2, h: 2, plan: null },
    { metric: "rent.revenue", w: 2, h: 1, plan: null },
    { metric: "rent.overdue", w: 1, h: 1, plan: null },
    { metric: "rent.income_today", w: 1, h: 1, plan: null },
    { metric: "rent.active", w: 1, h: 1, plan: null },
    { metric: "rent.new_clients", w: 1, h: 1, plan: null, period: "week" },
    { metric: "rent.returns", w: 1, h: 1, plan: null, period: "week" },
    { metric: "sales.count", w: 1, h: 1, plan: null },
    { metric: "sales.revenue", w: 2, h: 1, plan: null },
    { metric: "sales.profit", w: 2, h: 1, plan: null },
    { metric: "service.count", w: 1, h: 1, plan: null },
    { metric: "service.revenue", w: 2, h: 1, plan: null },
    { metric: "buyout.active", w: 1, h: 1, plan: null },
    { metric: "plan.summary", w: 2, h: 2 },
  ],
};

const boardKey = ["analytics", "board"] as const;

export function useAnalyticsBoard() {
  return useQuery({
    queryKey: boardKey,
    queryFn: () =>
      api
        .get<{ board: Board | null; updatedAt?: string }>("/api/analytics/board")
        .then((r) => ({ ...r, board: r.board ? normalizeBoard(r.board) : null })),
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
