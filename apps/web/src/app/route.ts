export type RouteId =
  | "dashboard"
  | "clients"
  | "applications"
  | "rentals"
  | "debtors"
  | "rassrochki"
  | "sales"
  | "service"
  | "fleet"
  | "incidents"
  | "tasks"
  | "analytics"
  | "docs"
  | "staff"
  | "whats-new"
  | "settings";

const KEY = "hulk-route";

const READY: RouteId[] = [
  "dashboard",
  "clients",
  "applications",
  "rentals",
  "debtors",
  "fleet",
  "service",
  "docs",
  "whats-new",
];

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
