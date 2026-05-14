/**
 * Архивация завершённых аренд из прошлых расчётных периодов.
 *
 * Бизнес-правило: «если в прошлом периоде было N завершённых аренд, в
 * новом периоде они автоматически уезжают в архив». В архиве оператор
 * фильтрует по периодам/клиентам/скутерам.
 *
 * v0.7: граница берётся из таблицы billing_period_anchors (раньше — из
 * плоской app_settings.billing_period_start_day). Резолвер периода
 * единый, тот же что у фронта — фронт и архив всегда согласованы по
 * границе. Раз в час scheduler определяет period_start для now() и
 * архивирует completed с end_actual_at < period_start.
 *
 * Идемпотентно. Если transition активен — period_start = начало
 * transition'а (т.е. конец последнего «старого» regular-периода).
 */
import { asc, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { activityLog, billingPeriodAnchors } from "../db/schema.js";
import { periodFor, toISODate } from "./billingPeriod.js";

const TICK_INTERVAL_MS = 60 * 60 * 1000; // раз в час

async function tickArchive(): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(billingPeriodAnchors)
      .orderBy(asc(billingPeriodAnchors.effectiveFrom));
    const anchors = rows.map((r) => ({
      id: r.id,
      effectiveFrom: r.effectiveFrom,
      ruleStartDay: r.ruleStartDay,
      kind: r.kind === "transition" ? ("transition" as const) : ("regular" as const),
      transitionEndDate: r.transitionEndDate ?? null,
    }));
    const period = periodFor(new Date(), anchors);
    const periodStartIso = toISODate(period.start);

    const updated = await db.execute(sql`
      UPDATE rentals r
         SET archived_at = now(),
             updated_at = now()
       WHERE r.archived_at IS NULL
         AND r.status = 'completed'
         AND r.end_actual_at IS NOT NULL
         AND r.end_actual_at::date < ${periodStartIso}::date
       RETURNING r.id
    `);
    const updatedRows =
      (updated as unknown as { rows?: Array<{ id: number }> }).rows ??
      (updated as unknown as Array<{ id: number }>);
    const count = Array.isArray(updatedRows) ? updatedRows.length : 0;
    if (count > 0) {
      const ids = updatedRows.map((r) => r.id).slice(0, 20);
      console.log(
        `[archive-scheduler] auto-archive: ${count} rental(s) до ${periodStartIso}, ids: ${ids.join(",")}${count > 20 ? "..." : ""}`,
      );
      try {
        await db.insert(activityLog).values({
          userId: null,
          userName: "система",
          userRole: null,
          entity: "rental",
          entityId: null,
          action: "auto_archive_period",
          summary: `Автоархив прошлого периода: ${count} завершённых аренд (${ids.slice(0, 5).join(", ")}${count > 5 ? "..." : ""}). Граница периода: ${periodStartIso}.`,
          meta: { count, ids, periodStart: periodStartIso } as unknown as object,
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

/**
 * Запускает scheduler архивации. Идёт сразу через 30 секунд после старта,
 * потом раз в час.
 */
export function scheduleRentalArchive(): void {
  setTimeout(tickArchive, 30_000);
  setInterval(tickArchive, TICK_INTERVAL_MS);
  console.log("rental-archive-scheduler: активирован (раз в час)");
}
