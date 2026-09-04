import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { rentals } from "../db/schema.js";

/**
 * Глобальное правило (заказчик, 04.09): пока по технике идёт аренда, её
 * нельзя перевести в «Выкуп», «Продаётся» или «Продан». Сначала аренду
 * надо завершить. Ремонт/ДТП/разборка под запрет не попадают — это
 * прерывание аренды, а не выбытие техники из парка.
 *
 * Почему проверка живёт на сервере, а не только в интерфейсе: мастера
 * выкупа и продажи меняли статус техники напрямую, минуя общую проверку
 * при смене статуса, — так Gear №06 уехал в выкуп с незакрытой арендой,
 * и дашборд показывал «4 в аренде из 3 в парке». Интерфейс подсказывает,
 * сервер — не пускает.
 *
 * «Активная» в БД одна — 'active': просрочка и возврат считаются на фронте
 * по датам, в базе это всё та же живая аренда. Значит, одной проверки
 * достаточно, чтобы накрыть все три состояния, которые назвал заказчик.
 */

/** Статусы, в которых техника покидает арендный парк. */
export const LEAVES_RENTAL_PARK = new Set(["for_sale", "buyout", "sold"]);

/** Номера живых аренд по технике; пусто — техника свободна. */
export async function activeRentalIds(scooterId: number): Promise<number[]> {
  const rows = await db
    .select({ id: rentals.id })
    .from(rentals)
    .where(and(eq(rentals.scooterId, scooterId), eq(rentals.status, "active")));
  return rows.map((r) => r.id);
}

/** Единый ответ 409 — фронт узнаёт ошибку по коду и показывает человеку. */
export function activeRentalConflict(rentalIds: number[]) {
  const nums = rentalIds.map((id) => `#${String(id).padStart(4, "0")}`).join(", ");
  return {
    error: "scooter_has_active_rental",
    message: `Техника сейчас в аренде (${nums}). Сначала завершите аренду — потом выкуп или продажа.`,
    rentalIds,
  };
}
