import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { appSettings } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";

/**
 * Аналитика: доска показателей (06.09).
 *
 * Доска ОБЩАЯ, а не персональная: её собирает директор, а видят все — тот же
 * экран висит на втором мониторе и на нём сотрудники смотрят, что проседает.
 * Поэтому хранится одной записью в app_settings, читать может любой
 * авторизованный, менять — директор и админ.
 */
const staffOnly = requireRole("director", "admin");
const KEY = "analytics_board";

const TileSchema = z.object({
  /** Идентификатор показателя, напр. "rent.park_load". */
  metric: z.string().min(1).max(64),
  /** Размер плитки на доске. */
  size: z.enum(["s", "m", "l"]).default("m"),
  /** Ручной план (для количественных показателей). null — плана нет. */
  plan: z.number().min(0).nullable().optional(),
  /** Свой период плитки; null — берётся общий период доски. */
  period: z.enum(["today", "week", "month", "year"]).nullable().optional(),
});

const BoardSchema = z.object({
  tiles: z.array(TileSchema).max(40),
  /** Общий период доски. */
  period: z.enum(["today", "week", "month", "year"]).default("week"),
  /** Заголовок на экране-стене. */
  title: z.string().max(80).optional(),
});

export type AnalyticsBoard = z.infer<typeof BoardSchema>;

export async function analyticsRoutes(app: FastifyInstance) {
  /** Текущая доска. null → фронт покажет доску по умолчанию. */
  app.get("/board", async () => {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, KEY));
    if (!row) return { board: null };
    try {
      const parsed = BoardSchema.safeParse(JSON.parse(row.value));
      return { board: parsed.success ? parsed.data : null, updatedAt: row.updatedAt };
    } catch {
      return { board: null };
    }
  });

  /** Сохранить доску (директор/админ). */
  app.put("/board", { preHandler: staffOnly }, async (req, reply) => {
    const parsed = BoardSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const value = JSON.stringify(parsed.data);
    await db
      .insert(appSettings)
      .values({
        key: KEY,
        value,
        updatedByUserId: req.user?.userId ?? null,
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value,
          updatedByUserId: req.user?.userId ?? null,
          updatedAt: new Date(),
        },
      });
    await logActivity(req, {
      entity: "settings",
      entityId: null,
      action: "analytics_board_saved",
      summary: `Изменена доска аналитики: ${parsed.data.tiles.length} показателей, период «${parsed.data.period}»`,
    });
    return { ok: true, board: parsed.data };
  });
}
