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

async function tickOverdue(): Promise<void> {
  try {
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
    const rows = (updated as unknown as { rows?: Array<{ id: number }> }).rows
      ?? (updated as unknown as Array<{ id: number }>);
    const count = Array.isArray(rows) ? rows.length : 0;
    if (count > 0) {
      const ids = rows.map((r) => r.id).slice(0, 20);
      console.log(
        `[overdue-scheduler] active→overdue: ${count} rental(s), ids: ${ids.join(",")}${count > 20 ? "..." : ""}`,
      );
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
        console.warn("[overdue-scheduler] activityLog insert failed:", e);
      }
    }
  } catch (e) {
    console.error(
      "[overdue-scheduler] tick failed:",
      (e as Error).message ?? e,
    );
  }
}

/**
 * v0.4.48: автоархивация completed-аренд из прошлых расчётных периодов.
 *
 * Бизнес-правило: «если в прошлом месяце было 70 завершённых аренд, в
 * новом месяце они автоматически уезжают в архив». В архиве оператор
 * фильтрует по периодам/клиентам/скутерам.
 *
 * Расчётный период — 15-е число прошлого месяца → 14-е текущего.
 * Граница периода настраивается в app_settings.billing_period_start_day
 * (по умолчанию 15). Раз в час scheduler проверяет: если у completed/
 * completed_damage аренды end_actual_at в ПРОШЛОМ периоде (т.е. ДО
 * начала текущего периода), архивируем.
 *
 * Идемпотентно. completed_damage с непогашенным долгом уже не уйдёт —
 * у него status переведут на 'completed' через normalize только после
 * погашения, а до этого он остаётся видимым в active (как problem).
 */
async function tickArchive(): Promise<void> {
  try {
    // Берём настройку дня начала периода. По умолчанию 15.
    const settings = await db.execute(sql`
      SELECT value FROM app_settings WHERE key='billing_period_start_day' LIMIT 1
    `);
    const sRows = (settings as unknown as { rows?: Array<{ value: string }> }).rows
      ?? (settings as unknown as Array<{ value: string }>);
    const startDay = Number(
      Array.isArray(sRows) && sRows[0]?.value ? sRows[0].value : "15",
    );
    const startDayClamped = Math.min(28, Math.max(1, startDay));

    // Дата начала ТЕКУЩЕГО периода:
    //   если сегодня день >= startDay → period_start = startDay этого месяца
    //   иначе → period_start = startDay прошлого месяца
    // Архивируем completed/completed_damage с end_actual_at < period_start.
    const updated = await db.execute(sql`
      WITH p AS (
        SELECT
          CASE
            WHEN EXTRACT(DAY FROM (now() AT TIME ZONE 'Europe/Moscow')) >= ${startDayClamped}
            THEN make_date(
              EXTRACT(YEAR FROM (now() AT TIME ZONE 'Europe/Moscow'))::int,
              EXTRACT(MONTH FROM (now() AT TIME ZONE 'Europe/Moscow'))::int,
              ${startDayClamped}
            )
            ELSE make_date(
              EXTRACT(YEAR FROM ((now() AT TIME ZONE 'Europe/Moscow') - interval '1 month'))::int,
              EXTRACT(MONTH FROM ((now() AT TIME ZONE 'Europe/Moscow') - interval '1 month'))::int,
              ${startDayClamped}
            )
          END AS period_start
      )
      UPDATE rentals r
         SET archived_at = now(),
             updated_at = now()
        FROM p
       WHERE r.archived_at IS NULL
         AND r.status IN ('completed', 'completed_damage')
         AND r.end_actual_at IS NOT NULL
         AND r.end_actual_at::date < p.period_start
       RETURNING r.id
    `);
    const rows = (updated as unknown as { rows?: Array<{ id: number }> }).rows
      ?? (updated as unknown as Array<{ id: number }>);
    const count = Array.isArray(rows) ? rows.length : 0;
    if (count > 0) {
      const ids = rows.map((r) => r.id).slice(0, 20);
      console.log(
        `[archive-scheduler] auto-archive: ${count} rental(s), ids: ${ids.join(",")}${count > 20 ? "..." : ""}`,
      );
      try {
        await db.insert(activityLog).values({
          userId: null,
          userName: "система",
          userRole: null,
          entity: "rental",
          entityId: null,
          action: "auto_archive_period",
          summary: `Автоархив прошлого периода: ${count} завершённых аренд (${ids.slice(0, 5).join(", ")}${count > 5 ? "..." : ""})`,
          meta: { count, ids } as unknown as object,
        });
      } catch (e) {
        console.warn("[archive-scheduler] activityLog insert failed:", e);
      }
    }
  } catch (e) {
    console.error(
      "[archive-scheduler] tick failed:",
      (e as Error).message ?? e,
    );
  }
}

async function tick(): Promise<void> {
  await tickOverdue();
  await tickArchive();
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
