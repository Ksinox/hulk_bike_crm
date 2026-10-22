import { useCallback, useEffect, useMemo, useState } from "react";
import { progressItems } from "@/data/progress";
import { markChangelogSeen } from "@/pages/whats-new/useUnreadChangelog";

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
 *
 * 22.10 (заказчик): «в реальной работе никто не будет просматривать каждый
 * пункт — зашёл в раздел один раз, и всё прочитано». Поэтому при входе на
 * страницу все пункты сразу отмечаются прочитанными — значок в меню гаснет.
 * В этот заход новые пункты по-прежнему подсвечены (снимок на момент входа),
 * чтобы было видно, что поменялось.
 */

/** Событие для меню: отметки изменились — пересчитать значок. */
export const PROGRESS_SEEN_EVENT = "hulk:progress-seen";

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
  // Снимок «что было прочитано» на момент входа — по нему подсветка.
  const [seen, setSeen] = useState<SeenMap>(load);

  // Зашли в раздел — всё прочитано (в хранилище), значок в меню гаснет.
  useEffect(() => {
    const all: SeenMap = { ...load() };
    for (const i of progressItems) if (i.updatedAt) all[i.id] = i.updatedAt;
    save(all);
    // и вкладка «Что уже сделано» — значок раздела складывается из обеих
    markChangelogSeen();
    window.dispatchEvent(new Event(PROGRESS_SEEN_EVENT));
  }, []);

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
    // хранилище уже отмечено при входе — гасим только подсветку пункта
    setSeen((prev) => (prev[id] === updatedAt ? prev : { ...prev, [id]: updatedAt }));
  }, []);

  const freshCount = useMemo(
    () => progressItems.filter((i) => isFresh(i.id, i.updatedAt)).length,
    [isFresh],
  );

  return { isFresh, markSeen, freshCount };
}
