import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

/**
 * Диагностический + восстановительный endpoint — только для creator.
 *
 * GET /api/_diag/counts — счёт строк по таблицам
 * GET /api/_diag/columns/:table — список колонок таблицы (для проверки
 *   что миграции реально применились)
 * POST /api/_diag/heal — применяет недостающие колонки/таблицы заново
 *   через ALTER TABLE IF NOT EXISTS. Идемпотентно — можно дёргать
 *   сколько угодно раз.
 */
export async function diagRoutes(app: FastifyInstance) {
  app.get("/counts", async (req, reply) => {
    if (req.user.role !== "creator") {
      return reply.code(403).send({ error: "creator_only" });
    }
    const tables = [
      "users",
      "clients",
      "scooters",
      "scooter_models",
      "scooter_documents",
      "rentals",
      "payments",
      "return_inspections",
      "equipment_items",
      "rental_incidents",
      "activity_log",
    ];
    const result: Record<string, number | string> = {};
    for (const t of tables) {
      try {
        const rows = await db.execute(
          sql.raw(`SELECT count(*)::int as c FROM "${t}"`),
        );
        const c = (rows[0] as { c?: number } | undefined)?.c ?? 0;
        result[t] = c;
      } catch (e) {
        result[t] = `ERR: ${(e as Error).message ?? "unknown"}`;
      }
    }
    return result;
  });

  app.get<{ Params: { table: string } }>(
    "/columns/:table",
    async (req, reply) => {
      if (req.user.role !== "creator") {
        return reply.code(403).send({ error: "creator_only" });
      }
      const table = req.params.table.replace(/[^a-z0-9_]/gi, "");
      const rows = await db.execute(
        sql`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_name = ${table}
          ORDER BY ordinal_position
        `,
      );
      return { table, columns: rows };
    },
  );

  /**
   * Догнать схему: добавляем все недостающие колонки, которые ввели
   * наши последние миграции. Идемпотентно — каждое DDL обёрнуто в
   * IF NOT EXISTS / try/catch с пропуском «уже существует».
   *
   * Список синхронизирован с файлами в drizzle/ и schema.ts.
   * При каждой новой миграции — добавлять сюда соответствующее DDL.
   */
  app.post("/heal", async (req, reply) => {
    if (req.user.role !== "creator") {
      return reply.code(403).send({ error: "creator_only" });
    }

    // Все колонки которые добавлялись в миграциях 0006-0011.
    // ADD COLUMN IF NOT EXISTS — Postgres 9.6+ поддерживает.
    const ddls = [
      // 0006: clients.source_custom
      `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "source_custom" text`,
      // 0007: clients.is_foreigner / passport_raw
      `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "is_foreigner" boolean DEFAULT false NOT NULL`,
      `ALTER TABLE "clients" ADD COLUMN IF NOT EXISTS "passport_raw" text`,
      // 0008: rentals.archived_at / archived_by
      `ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "archived_at" timestamp with time zone`,
      `ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "archived_by" text`,
      // 0009: scooter_models.fuel_l_per_100km
      `ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "fuel_l_per_100km" numeric(4, 2)`,
      // 0010: scooter_models.day_rate + short_rate default
      `ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "day_rate" integer DEFAULT 1300 NOT NULL`,
      `ALTER TABLE "scooter_models" ALTER COLUMN "short_rate" SET DEFAULT 700`,
      // 0011: scooter_models.active
      `ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true NOT NULL`,
    ];

    const results: Array<{
      sql: string;
      ok: boolean;
      error?: string;
    }> = [];
    for (const ddl of ddls) {
      try {
        await db.execute(sql.raw(ddl));
        results.push({ sql: ddl, ok: true });
      } catch (e) {
        results.push({
          sql: ddl,
          ok: false,
          error: (e as Error).message ?? "unknown",
        });
      }
    }
    return { applied: results.filter((r) => r.ok).length, results };
  });

  /**
   * POST /api/_diag/backup — ручной запуск бэкапа БД в MinIO.
   * Сохраняет в hulk-backups/backups/YYYY-MM-DD.json.gz.
   */
  app.post("/backup", async (req, reply) => {
    if (req.user.role !== "creator") {
      return reply.code(403).send({ error: "creator_only" });
    }
    const { runBackup } = await import("../services/backup.js");
    try {
      const result = await runBackup();
      return { ok: true, ...result };
    } catch (e) {
      return reply.code(500).send({
        ok: false,
        error: (e as Error).message ?? "backup_failed",
      });
    }
  });
}
