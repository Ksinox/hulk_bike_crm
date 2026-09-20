import { saveDevTab, saveSettingsTab } from "./sectionTabs";

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
  // Блок «Финансы» (20.09): приход, расход, прибыль. Виден по праву.
  | "finance"
  | "docs"
  | "staff"
  | "storage"
  | "whats-new"
  | "progress"
  | "partners"
  | "settings";

const KEY = "hulk-route";

/**
 * 18.09: «Что нового» — вкладка «Развития», «Хранилище» — вкладка
 * «Настроек». Старые ссылки, сохранённый раздел и кнопки ведут туда.
 */
export function normalizeRoute(r: RouteId): RouteId {
  if (r === "whats-new") {
    saveDevTab("done");
    return "progress";
  }
  if (r === "storage") {
    saveSettingsTab("storage");
    return "settings";
  }
  return r;
}

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
  // Аналитика (06.09): раздел показателей и экран на второй монитор.
  "analytics",
];

export function loadRoute(): RouteId {
  try {
    const v = localStorage.getItem(KEY) as RouteId | null;
    if (v && READY.includes(v)) return normalizeRoute(v);
  } catch {}
  return "dashboard";
}

export function saveRoute(r: RouteId) {
  try {
    localStorage.setItem(KEY, r);
  } catch {}
}
