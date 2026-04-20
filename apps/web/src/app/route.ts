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
  | "settings";

const KEY = "hulk-route";

export function loadRoute(): RouteId {
  try {
    const v = localStorage.getItem(KEY);
    if (v) return v as RouteId;
  } catch {}
  return "dashboard";
}

export function saveRoute(r: RouteId) {
  try {
    localStorage.setItem(KEY, r);
  } catch {}
}
