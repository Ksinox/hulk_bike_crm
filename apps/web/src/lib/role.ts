import { useSyncExternalStore } from "react";

/**
 * Роль текущего пользователя.
 * - director — владелец бизнеса, видит экономику парка, цены закупа, чистую маржу
 * - admin    — управляющий, видит только операционку, без цен закупа/ROI
 *
 * На этапе демо храним в localStorage и переключаем через UI в Topbar.
 * В будущем будет приходить из auth-контекста.
 */
export type UserRole = "director" | "admin";

const KEY = "hulk-role";

function load(): UserRole {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "director" || v === "admin") return v;
  } catch {}
  return "director";
}

let current: UserRole = load();
const listeners = new Set<() => void>();

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getRole(): UserRole {
  return current;
}

export function setRole(r: UserRole) {
  if (current === r) return;
  current = r;
  try {
    localStorage.setItem(KEY, r);
  } catch {}
  listeners.forEach((l) => l());
}

export function toggleRole() {
  setRole(current === "director" ? "admin" : "director");
}

export function useRole(): UserRole {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => current,
  );
}

export function isDirector(): boolean {
  return current === "director";
}
