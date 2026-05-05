/**
 * Авто-перевод аренд из 'active' в 'overdue' по дате.
 *
 * Бизнес-правило: если плановая дата возврата (end_planned_at) уже прошла,
 * аренда фактически просрочена. До v0.4.34 статус в БД оставался 'active'
 * пока оператор не выполнит явное действие (сбросить просрочку, продлить,
 * завершить) — это ломало отчёты, фильтр overdue, KPI на дашборде:
 * фильтр `WHERE status='overdue'` находил 0 записей, а формальная карточка
 * клиента уже несколько дней показывала долг.
 *
 * Решение: ежечасный scheduler делает одно SQL-обновление:
 *
 *     UPDATE rentals SET status='overdue'
 *     WHERE status='active'
 *       AND end_planned_at::date < current_date
 *       AND archived_at IS NULL;
 *
 * Идемпотентно (повторный запуск ничего не делает), безопасно — затрагивает
 * только аренды чья плановая дата возврата уже в прошлом.
 *
 * Логируем число обновлённых записей в activity_log как системное действие
 * чтобы оператор в ленте видел «5 аренд переведены в просрочку» — иначе
 * статусы меняются «магически» и непонятно почему.
 */
import { db } from "../db/index.js";
import { activityLog } from "../db/schema.js";
import { sql } from "drizzle-orm";

const TICK_INTERVAL_MS = 60 * 60 * 1000; // раз в час

async function tick(): Promise<void> {
  try {
    // returning() даёт нам id-ишники реально переведённых — для лога
    // v0.4.38: добавил `end_planned_at IS NOT NULL` — schema NOT NULL,
    // но если когда-нибудь legacy-импорт прокинет NULL, запись зависнет
    // в active. Эта защита бесплатная и предотвращает зависание.
    // v0.4.38: добавил `updated_at < now() - 5s` — защита от race с
    // оператором, который только что выполнил /complete или extend.
    // Без этого scheduler мог тронуть запись параллельно с транзакцией
    // оператора и запутать UI кратковременной сменой статуса.
    const updated = await db.execute(sql`
      UPDATE rentals
         SET status = 'overdue', updated_at = now()
       WHERE status = 'active'
         AND end_planned_at IS NOT NULL
         AND end_planned_at::date < (now() AT TIME ZONE 'Europe/Moscow')::date
         AND archived_at IS NULL
         AND updated_at < now() - interval '5 seconds'
       RETURNING id
    `);
    // postgres-js execute возвращает result.rows
    const rows = (updated as unknown as { rows?: Array<{ id: number }> }).rows
      ?? (updated as unknown as Array<{ id: number }>);
    const count = Array.isArray(rows) ? rows.length : 0;
    if (count > 0) {
      const ids = rows.map((r) => r.id).slice(0, 20);
      // eslint-disable-next-line no-console
      console.log(
        `[overdue-scheduler] active→overdue: ${count} rental(s), ids: ${ids.join(",")}${count > 20 ? "..." : ""}`,
      );
      // Одна сводная запись в activity_log (а не по записи на каждую аренду
      // — иначе при первом включении сразу засрётся лента старыми долгами).
      try {
        await db.insert(activityLog).values({
          userId: null,
          userName: "система",
          userRole: null,
          entity: "rental",
          entityId: null,
          action: "auto_overdue_transition",
          summary: `Автопереход в «Просрочка»: ${count} аренд (${ids.slice(0, 5).join(", ")}${count > 5 ? "..." : ""})`,
          meta: { count, ids } as unknown as object,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[overdue-scheduler] activityLog insert failed:", e);
      }
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(
      "[overdue-scheduler] tick failed:",
      (e as Error).message ?? e,
    );
  }
}

/**
 * Запускает scheduler. Идёт сразу через 30 секунд после старта (на случай
 * если деплой пришёл в момент пересечения дат), потом раз в час.
 */
export function scheduleOverdueTransition(): void {
  setTimeout(tick, 30_000);
  setInterval(tick, TICK_INTERVAL_MS);
  // eslint-disable-next-line no-console
  console.log("overdue-scheduler: активирован (раз в час)");
}
