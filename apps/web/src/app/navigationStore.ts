import type { RouteId } from "./route";

type NavRequest = {
  route: RouteId;
  clientId?: number;
  rentalId?: number;
  scooterId?: number;
  /**
   * Открыть превью договора+акта по аренде сразу после перехода.
   * Используется при продлении: оператор продлил → видим новую карточку
   * + сразу всплывает документ с новыми датами для печати.
   */
  openContract?: boolean;
  /**
   * v0.3.8: открыть конкретный таб карточки аренды сразу после перехода.
   * Сейчас используется значение `"debt"` — клик по строке должника на
   * дашборде открывает аренду с активированным табом «История долгов».
   */
  openTab?: "terms" | "history" | "debt" | "tasks" | "docs";
  /** Откуда пришли — для breadcrumb «← назад» */
  from?: {
    route: RouteId;
    rentalId?: number;
    clientId?: number;
    scooterId?: number;
  };
};

export type BackTarget = {
  route: RouteId;
  rentalId?: number;
  clientId?: number;
  scooterId?: number;
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
  | {
      clientId?: number;
      rentalId?: number;
      scooterId?: number;
      from?: BackTarget;
      openTab?: NavRequest["openTab"];
    }
  | null {
  if (!pending || pending.route !== route) return null;
  const { clientId, rentalId, scooterId, from, openTab } = pending;
  pending = null;
  return { clientId, rentalId, scooterId, from, openTab };
}

/** Подписаться на события навигации (для App) */
export function onNavigate(cb: (req: NavRequest) => void): () => void {
  const handler = (e: Event) => {
    cb((e as CustomEvent<NavRequest>).detail);
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
