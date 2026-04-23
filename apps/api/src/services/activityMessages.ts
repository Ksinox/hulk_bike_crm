/**
 * Человеко-читаемые лейблы для сводок в activity_log.
 * Всё что пишем в summary — должно быть на русском и понятно сотруднику,
 * а не техническим ключом из БД.
 */

export const SCOOTER_STATUS_RU: Record<string, string> = {
  ready: "Не распределён",
  rental_pool: "Парк аренды",
  repair: "Ремонт",
  buyout: "Выкуп",
  for_sale: "На продаже",
  sold: "Продан",
  disassembly: "В разборке",
};

export const RENTAL_STATUS_RU: Record<string, string> = {
  new_request: "Заявка",
  meeting: "Встреча",
  active: "Активна",
  overdue: "Просрочена",
  returning: "Возврат",
  completed: "Завершена",
  completed_damage: "Завершена с ущербом",
  cancelled: "Отменена",
  police: "Передано в полицию",
  court: "Передано в суд",
};

export const MAINTENANCE_KIND_RU: Record<string, string> = {
  oil: "замена масла",
  repair: "ремонт",
  parts: "запчасти",
  other: "прочие работы",
};

export function scooterStatusLabel(status: string): string {
  return SCOOTER_STATUS_RU[status] ?? status;
}

export function rentalStatusLabel(status: string): string {
  return RENTAL_STATUS_RU[status] ?? status;
}

export function maintenanceKindLabel(kind: string): string {
  return MAINTENANCE_KIND_RU[kind] ?? kind;
}

/**
 * Собирает короткое описание что именно изменилось в объекте, сравнивая
 * before/after. Возвращает массив человечных пунктов: ["имя", "тарифы"].
 * Пустой массив = ничего значимого не изменилось.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: T,
  fields: Record<keyof T | string, string>,
): string[] {
  const out: string[] = [];
  for (const key of Object.keys(fields)) {
    const a = before[key as keyof T];
    const b = after[key as keyof T];
    if (a !== b && JSON.stringify(a) !== JSON.stringify(b)) {
      out.push(fields[key]!);
    }
  }
  return out;
}
