import type { FastifyInstance } from "fastify";
import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { activityLog } from "../db/schema.js";

/**
 * GET /api/activity?limit=50&offset=0
 * Лента последних действий. Видна всем авторизованным ролям.
 * Возвращает items + total чтобы UI мог пагинировать полный журнал.
 */
export async function activityRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/",
    async (req) => {
      const Q = z.object({
        limit: z.coerce.number().int().min(1).max(500).optional(),
        offset: z.coerce.number().int().min(0).optional(),
      });
      const parsed = Q.safeParse(req.query);
      const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 50;
      const offset = parsed.success && parsed.data.offset ? parsed.data.offset : 0;

      const [rows, totalRow] = await Promise.all([
        db
          .select()
          .from(activityLog)
          .orderBy(desc(activityLog.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(activityLog),
      ]);

      return { items: rows, total: totalRow[0]?.count ?? 0 };
    },
  );
}
