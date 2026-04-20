import type { RouteId } from "./route";

type NavRequest = {
  route: RouteId;
  clientId?: number;
  rentalId?: number;
  /** Откуда пришли — для breadcrumb «← назад» */
  from?: {
    route: RouteId;
    rentalId?: number;
    clientId?: number;
  };
};

export type BackTarget = {
  route: RouteId;
  rentalId?: number;
  clientId?: number;
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
  | { clientId?: number; rentalId?: number; from?: BackTarget }
  | null {
  if (!pending || pending.route !== route) return null;
  const { clientId, rentalId, from } = pending;
  pending = null;
  return { clientId, rentalId, from };
}

/** Подписаться на события навигации (для App) */
export function onNavigate(cb: (req: NavRequest) => void): () => void {
  const handler = (e: Event) => {
    cb((e as CustomEvent<NavRequest>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
