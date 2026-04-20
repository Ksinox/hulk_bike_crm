import { useSyncExternalStore } from "react";
import type { RouteId } from "./route";

type PendingSelection = {
  route: RouteId;
  clientId?: number;
  rentalId?: number;
};

let pending: PendingSelection | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Запросить переход на страницу route с предустановленным выбором */
export function navigate(sel: PendingSelection): void {
  pending = sel;
  emit();
}

/** Прочитать pending-выбор для страницы; после чтения сбрасывается */
export function consumePending(route: RouteId):
  | { clientId?: number; rentalId?: number }
  | null {
  if (!pending || pending.route !== route) return null;
  const { clientId, rentalId } = pending;
  pending = null;
  emit();
  return { clientId, rentalId };
}

/** Текущий pending (readonly) — для подписки на смену маршрута */
export function usePendingNavigation(): PendingSelection | null {
  return useSyncExternalStore(
    subscribe,
    () => pending,
    () => null,
  );
}
