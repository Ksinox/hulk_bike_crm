import { useCallback, useMemo, useState } from "react";
import { progressItems } from "@/data/progress";

/**
 * Отметки «здесь есть свежие изменения» на странице «Развитие» (31.08).
 *
 * Механика простая и честная:
 *   • у пункта есть `updatedAt` — дата, когда его последний раз меняли;
 *   • браузер помнит, с какой датой пункт уже открывали (localStorage);
 *   • точка горит, пока `updatedAt` новее запомненной даты.
 *
 * Поэтому: посмотрел пункт — точка гаснет; доработали пункт и подняли
 * `updatedAt` — точка загорается снова, даже если раньше его читали.
 * Отметки живут в браузере заказчика: у каждого свой «прочитано».
 */

const KEY = "hulk-progress-seen";

type SeenMap = Record<string, string>;

function load(): SeenMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SeenMap) : {};
  } catch {
    return {};
  }
}

function save(map: SeenMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* приватный режим — переживём без запоминания */
  }
}

export function useProgressSeen() {
  const [seen, setSeen] = useState<SeenMap>(load);

  const isFresh = useCallback(
    (id: string, updatedAt?: string) => {
      if (!updatedAt) return false;
      const s = seen[id];
      return !s || s < updatedAt;
    },
    [seen],
  );

  /** Пункт открыли — считаем прочитанным на его текущую дату. */
  const markSeen = useCallback((id: string, updatedAt?: string) => {
    if (!updatedAt) return;
    setSeen((prev) => {
      if (prev[id] === updatedAt) return prev;
      const next = { ...prev, [id]: updatedAt };
      save(next);
      return next;
    });
  }, []);

  const freshCount = useMemo(
    () => progressItems.filter((i) => isFresh(i.id, i.updatedAt)).length,
    [isFresh],
  );

  const markAllSeen = useCallback(() => {
    const next: SeenMap = { ...load() };
    for (const i of progressItems) {
      if (i.updatedAt) next[i.id] = i.updatedAt;
    }
    save(next);
    setSeen(next);
  }, []);

  return { isFresh, markSeen, markAllSeen, freshCount };
}
