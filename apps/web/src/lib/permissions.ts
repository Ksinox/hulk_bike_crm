import { useMe, type AuthUser } from "@/lib/api/auth";

/**
 * Права на щепетильные данные (14.09, фундамент личных аккаунтов).
 *
 * Правило: нет права — показателя нет вовсе. Не звёздочки и не «скрыто»,
 * а как будто его никогда не было: плашка не рисуется, соседние занимают
 * её место. Сервер эти числа такому аккаунту тоже не отдаёт.
 *
 * Список — зеркало apps/api/src/auth/permissions.ts. Новое право:
 * строка там (ключ и умолчание) и строка здесь (подписи для директора).
 */
export type PermissionKey =
  | "data.profit"
  | "data.repairProfit"
  | "data.partnerShares"
  | "data.finance";

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  /** Где человек это видит — чтобы директор понимал, что выключает. */
  where: string;
  byDefault: boolean;
};

export const PERMISSION_DEFS: PermissionDef[] = [
  {
    key: "data.profit",
    label: "Прибыль, закуп и маржа",
    where:
      "Продажи: прибыль, закупочная цена, маржинальность, процент менеджера · карточка скутера: закуп · аналитика: прибыль с продаж",
    byDefault: false,
  },
  {
    key: "data.repairProfit",
    label: "Прибыль ремонтов",
    where: "Ремонты: плашка «Прибыль», закуп запчастей в наряде · аналитика: прибыль с ремонтов",
    byDefault: true,
  },
  {
    key: "data.partnerShares",
    label: "Доли партнёров",
    where: "Партнёрка: инвесторы, их процент и начисления · доля партнёра в карточке скутера",
    byDefault: false,
  },
  {
    key: "data.finance",
    label: "Финансы: приход, расход, прибыль",
    where:
      "Раздел «Финансы»: приход и расход по статьям, постоянные издержки, ФОТ, прибыль за период. Нет права — раздела в меню нет.",
    byDefault: false,
  },
];

export type Perms = Record<PermissionKey, boolean>;

export function defaultPerms(): Perms {
  return Object.fromEntries(PERMISSION_DEFS.map((d) => [d.key, d.byDefault])) as Perms;
}

export function isFullAccess(role: AuthUser["role"] | undefined): boolean {
  return role === "creator" || role === "director";
}

/** Итоговые права пользователя. Пока профиль грузится — ничего не показываем. */
export function permsOf(me: AuthUser | undefined | null): Perms {
  if (!me) return Object.fromEntries(PERMISSION_DEFS.map((d) => [d.key, false])) as Perms;
  if (isFullAccess(me.role)) {
    return Object.fromEntries(PERMISSION_DEFS.map((d) => [d.key, true])) as Perms;
  }
  return { ...defaultPerms(), ...(me.permissions ?? {}) };
}

export function usePerms(): Perms {
  const { data: me } = useMe();
  return permsOf(me);
}

/** Есть ли у текущего пользователя право. */
export function useCan(key: PermissionKey): boolean {
  return usePerms()[key];
}
