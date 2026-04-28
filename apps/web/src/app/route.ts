export type RouteId =
  | "dashboard"
  | "clients"
  | "rentals"
  | "rassrochki"
  | "sales"
  | "service"
  | "fleet"
  | "incidents"
  | "tasks"
  | "analytics"
  | "docs"
  | "staff"
  | "settings";

const KEY = "hulk-route";

const READY: RouteId[] = ["dashboard", "clients", "rentals", "fleet", "docs"];

export function loadRoute(): RouteId {
  try {
    const v = localStorage.getItem(KEY) as RouteId | null;
    if (v && READY.includes(v)) return v;
  } catch {}
  return "dashboard";
}

export function saveRoute(r: RouteId) {
  try {
    localStorage.setItem(KEY, r);
  } catch {}
}
