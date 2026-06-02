/**
 * v0.8.22 — переиспользуемое хранилище режима отображения «Список/Плитки»
 * (пер-пользователь, localStorage). Фабрика — чтобы не плодить копии для
 * Клиентов/Скутеров/Аренд.
 */
export type ViewMode = "list" | "tiles";

export function makeViewMode(prefix: string, dflt: ViewMode = "list") {
  const key = (uid?: number | string) => `${prefix}_view_mode_${uid ?? "anon"}`;
  return {
    load(uid?: number | string): ViewMode {
      try {
        const v = localStorage.getItem(key(uid));
        return v === "list" || v === "tiles" ? v : dflt;
      } catch {
        return dflt;
      }
    },
    save(uid: number | string | undefined, m: ViewMode) {
      try {
        localStorage.setItem(key(uid), m);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Обёртка перехода список↔плитки с морфингом (View Transitions API). */
export function runViewModeTransition(apply: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => void;
  };
  if (doc.startViewTransition) doc.startViewTransition(apply);
  else apply();
}
