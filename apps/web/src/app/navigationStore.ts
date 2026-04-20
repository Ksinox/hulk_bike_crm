import type { RouteId } from "./route";

type NavRequest = {
  route: RouteId;
  clientId?: number;
  rentalId?: number;
};

const EVENT = "hulk:navigate";

let pending: NavRequest | null = null;

/** Запросить переход на страницу с предустановленным выбором */
export function navigate(req: NavRequest): void {
  pending = req;
  window.dispatchEvent(new CustomEvent<NavRequest>(EVENT, { detail: req }));
}

/** Прочитать pending-выбор для маршрута; после чтения сбрасывается */
export function consumePending(route: RouteId):
  | { clientId?: number; rentalId?: number }
  | null {
  if (!pending || pending.route !== route) return null;
  const { clientId, rentalId } = pending;
  pending = null;
  return { clientId, rentalId };
}

/** Подписаться на события навигации (для App) */
export function onNavigate(cb: (req: NavRequest) => void): () => void {
  const handler = (e: Event) => {
    cb((e as CustomEvent<NavRequest>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
