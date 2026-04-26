import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";

/**
 * Диагностический endpoint — только для creator. Возвращает количество
 * записей по основным таблицам. Используется для подтверждения что
 * данные в БД есть, после инцидентов с миграциями.
 *
 * GET /api/_diag/counts
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
}
