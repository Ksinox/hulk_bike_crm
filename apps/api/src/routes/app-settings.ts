/**
 * v0.4.1 — глобальные настройки приложения.
 *
 * Сейчас используется одно: day-of-month начала расчётного периода
 * (15 по умолчанию). UI настраивает в /settings, фронт читает значение
 * через useAppSettings и пересчитывает все KPI/отчёты.
 *
 * Доступ:
 *  - GET   /api/app-settings — читать может любой авторизованный,
 *          т.к. от настроек зависит UI всех ролей.
 *  - PUT   /api/app-settings/:key — править могут только director / creator.
 */
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { appSettings } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

export async function appSettingsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const rows = await db.select().from(appSettings);
    return { items: rows };
  });

  app.get<{ Params: { key: string } }>("/:key", async (req, reply) => {
    const [row] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, req.params.key));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.put<{ Params: { key: string }; Body: { value: string } }>(
    "/:key",
    async (req, reply) => {
      if (req.user?.role !== "director" && req.user?.role !== "creator") {
        return reply.code(403).send({ error: "forbidden" });
      }
      const Body = z.object({ value: z.string().min(1).max(200) });
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      // upsert
      const userId = req.user.userId ?? null;
      const [existing] = await db
        .select()
        .from(appSettings)
        .where(eq(appSettings.key, req.params.key));
      if (existing) {
        await db
          .update(appSettings)
          .set({
            value: parsed.data.value,
            updatedByUserId: userId,
          })
          .where(eq(appSettings.key, req.params.key));
      } else {
        await db.insert(appSettings).values({
          key: req.params.key,
          value: parsed.data.value,
          updatedByUserId: userId,
        });
      }
      await logActivity(req, {
        entity: "user",
        action: "settings_changed",
        summary: `Настройка ${req.params.key} = ${parsed.data.value}`,
      });
      return { key: req.params.key, value: parsed.data.value };
    },
  );
}
