export type RouteId =
  | "dashboard"
  | "clients"
  // Правка 31.08: отдельного раздела в меню больше нет — заявки открываются
  // кнопкой внутри «Аренд» и «Продаж». Маршрут оставлен для старых ссылок.
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
  | "storage"
  | "whats-new"
  | "progress"
  | "partners"
  | "settings";

const KEY = "hulk-route";

const READY: RouteId[] = [
  "dashboard",
  "clients",
  "rentals",
  "debtors",
  "fleet",
  "sales",
  "rassrochki",
  "service",
  "docs",
  "storage",
  "whats-new",
  "progress",
  "partners",
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
