import type { FastifyInstance } from "fastify";
import { desc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { activityLog } from "../db/schema.js";

/**
 * GET /api/activity?limit=50
 * Лента последних действий. Видна всем авторизованным ролям.
 */
export async function activityRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string } }>("/", async (req) => {
    const Q = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() });
    const parsed = Q.safeParse(req.query);
    const limit = parsed.success && parsed.data.limit ? parsed.data.limit : 50;

    const rows = await db
      .select()
      .from(activityLog)
      .orderBy(desc(activityLog.createdAt))
      .limit(limit);

    return { items: rows };
  });
}
