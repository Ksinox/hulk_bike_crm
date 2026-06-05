import {
  Bike,
  FileText,
  HardDrive,
  Home,
  Inbox,
  LayoutGrid,
  LogOut,
  Scale,
  Settings,
  ShoppingBag,
  Sparkles,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { RouteId } from "@/app/route";

export type MobileNavItem = {
  id: RouteId;
  label: string;
  icon: LucideIcon;
  /** Реализована ли мобильная версия экрана (иначе — заглушка «скоро»). */
  ready: boolean;
};

/**
 * Нижний таб-бар — максимум 5 слотов (4 раздела + «Ещё»).
 * Остальные разделы живут в шторке «Ещё» (moreItems).
 * Состав повторяет десктоп-сайдбар, но приоритизирован под телефон:
 * самые частые операторские задачи — на виду.
 */
export const tabItems: MobileNavItem[] = [
  { id: "dashboard", label: "Главная", icon: Home, ready: true },
  { id: "rentals", label: "Аренды", icon: Bike, ready: true },
  { id: "clients", label: "Клиенты", icon: Users, ready: true },
  { id: "fleet", label: "Скутеры", icon: ShoppingBag, ready: true },
];

/** Раздел «Ещё» — раскрывается шторкой снизу. */
export function buildMoreItems(canManageStaff: boolean): MobileNavItem[] {
  const items: MobileNavItem[] = [
    { id: "applications", label: "Заявки", icon: Inbox, ready: true },
    { id: "debtors", label: "Должники", icon: Scale, ready: true },
    { id: "service", label: "Ремонты", icon: Wrench, ready: true },
    { id: "docs", label: "Документы", icon: FileText, ready: true },
  ];
  if (canManageStaff) {
    items.push({ id: "staff", label: "Сотрудники", icon: UserCog, ready: true });
    items.push({
      id: "storage",
      label: "Хранилище",
      icon: HardDrive,
      ready: true,
    });
  }
  items.push(
    { id: "whats-new", label: "Что нового", icon: Sparkles, ready: true },
    { id: "settings", label: "Настройки", icon: Settings, ready: false },
  );
  return items;
}

/** Иконка для кнопки «Ещё» в таб-баре. */
export const moreIcon = LayoutGrid;
export const logoutIcon = LogOut;

/** Человекочитаемый заголовок экрана для верхней панели. */
export function routeTitle(route: RouteId): string {
  const all: Record<string, string> = {
    dashboard: "Главная",
    rentals: "Аренды",
    clients: "Клиенты",
    fleet: "Скутеры",
    applications: "Заявки",
    debtors: "Должники",
    service: "Ремонты",
    docs: "Документы",
    staff: "Сотрудники",
    storage: "Хранилище",
    "whats-new": "Что нового",
    settings: "Настройки",
  };
  return all[route] ?? "Халк Байк";
}
