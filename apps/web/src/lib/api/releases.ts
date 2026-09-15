import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Показ обновления (15.09, релиз 2.0): мой прогресс по релизам и «кто
 * посмотрел» для директора. Сервер — apps/api/src/routes/releases.ts.
 */

export type ReleaseView = {
  version: string;
  status: "postponed" | "completed";
  postponedCount: number;
  cardsSeen: number;
  hintsDone: string[];
  sectionsVisited: string[];
  completedAt: string | null;
};

export type MyReleaseViews = {
  accountCreatedAt: string | null;
  staffKind: "existing" | "new" | null;
  views: ReleaseView[];
};

export type ReleaseAction =
  | { version: string; action: "postpone" | "complete"; cardsSeen?: number }
  | { version: string; action: "card"; cardsSeen: number }
  | { version: string; action: "hint"; hint: string }
  | { version: string; action: "visit"; section: string };

export type ReleaseViewRow = {
  userId: number;
  name: string;
  position: string | null;
  role: string;
  staffKind: string | null;
  accountCreatedAt: string;
  lastLoginAt: string | null;
  status: "postponed" | "completed" | null;
  postponedCount: number | null;
  cardsSeen: number | null;
  completedAt: string | null;
  updatedAt: string | null;
};

export const releaseKeys = {
  me: ["releases", "me"] as const,
  views: (version: string) => ["releases", "views", version] as const,
};

export function useMyReleaseViews(enabled = true) {
  return useQuery({
    queryKey: releaseKeys.me,
    queryFn: () => api.get<MyReleaseViews>("/api/releases/me"),
    enabled,
    staleTime: 5 * 60_000,
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });
}

/**
 * Отметка прогресса. Кэш «мой прогресс» правим сразу — экран не ждёт сети,
 * а метки «новое» и подсказки не мигают.
 */
export function useReleaseAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: ReleaseAction) => api.post<{ ok: true }>("/api/releases/me", a),
    onMutate: (a) => {
      qc.setQueryData<MyReleaseViews>(releaseKeys.me, (prev) => {
        if (!prev) return prev;
        const views = [...prev.views];
        let i = views.findIndex((v) => v.version === a.version);
        if (i < 0) {
          views.push({
            version: a.version,
            status: "postponed",
            postponedCount: 0,
            cardsSeen: 0,
            hintsDone: [],
            sectionsVisited: [],
            completedAt: null,
          });
          i = views.length - 1;
        }
        const v = { ...views[i]! };
        if (a.action === "postpone" && v.status !== "completed") v.postponedCount += 1;
        if (a.action === "complete") {
          v.status = "completed";
          v.completedAt = v.completedAt ?? new Date().toISOString();
        }
        if ("cardsSeen" in a && a.cardsSeen != null) v.cardsSeen = Math.max(v.cardsSeen, a.cardsSeen);
        if (a.action === "hint" && !v.hintsDone.includes(a.hint)) v.hintsDone = [...v.hintsDone, a.hint];
        if (a.action === "visit" && !v.sectionsVisited.includes(a.section)) {
          v.sectionsVisited = [...v.sectionsVisited, a.section];
        }
        views[i] = v;
        return { ...prev, views };
      });
    },
  });
}

export function useReleaseViewRows(version: string, enabled: boolean) {
  return useQuery({
    queryKey: releaseKeys.views(version),
    queryFn: () =>
      api
        .get<{ items: ReleaseViewRow[] }>(`/api/releases/views?version=${encodeURIComponent(version)}`)
        .then((r) => r.items),
    enabled,
    staleTime: 60_000,
  });
}
