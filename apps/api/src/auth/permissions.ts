import { z } from "zod";

/**
 * Права на щепетильные данные (14.09, фундамент личных аккаунтов).
 *
 * Правило одно: нет права — показателя у человека нет вовсе. Сервер эти
 * поля не отдаёт, интерфейс не рисует ни блок, ни подпись «скрыто».
 * Директор и создатель видят всё; их права не настраиваются.
 *
 * Список будет расти: новое право — новая строка здесь и в
 * apps/web/src/lib/permissions.ts (подписи для экрана «Сотрудники»).
 * `byDefault` — что получает аккаунт, если директор это право не трогал.
 */
export const PERMISSIONS = {
  "data.profit": {
    label: "Прибыль, закуп и маржа",
    byDefault: false,
  },
  "data.repairProfit": {
    label: "Прибыль ремонтов",
    byDefault: true,
  },
  "data.partnerShares": {
    label: "Доли партнёров",
    byDefault: false,
  },
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;
export type Perms = Record<PermissionKey, boolean>;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

/** Роли, которые видят всё и управляют правами других. */
export function isFullAccessRole(role: string): boolean {
  return role === "creator" || role === "director";
}

/** Права по умолчанию для нового аккаунта. */
export function defaultPermissions(): Perms {
  return Object.fromEntries(
    PERMISSION_KEYS.map((k) => [k, PERMISSIONS[k].byDefault]),
  ) as Perms;
}

/** Итоговые права: полный доступ по роли либо сохранённое поверх умолчаний. */
export function effectivePermissions(role: string, stored: unknown): Perms {
  if (isFullAccessRole(role)) {
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as Perms;
  }
  const base = defaultPermissions();
  if (stored && typeof stored === "object") {
    for (const k of PERMISSION_KEYS) {
      const v = (stored as Record<string, unknown>)[k];
      if (typeof v === "boolean") base[k] = v;
    }
  }
  return base;
}

/** Тело запроса: частичный набор прав. Незнакомые ключи отклоняются. */
export const PermissionsPatchSchema = z
  .object(
    Object.fromEntries(PERMISSION_KEYS.map((k) => [k, z.boolean().optional()])) as Record<
      PermissionKey,
      z.ZodOptional<z.ZodBoolean>
    >,
  )
  .strict();
