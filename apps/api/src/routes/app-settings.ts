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

/**
 * 22.10 (обходы ключа директора): общий PUT писал ЛЮБОЙ ключ — в том числе
 * `director_key_hash` (подставить свой ключ = снять защиту целиком) и
 * `buyout_markups` (у наценок свой путь с ключом). А GET отдавал хэш ключа
 * любому вошедшему. Теперь служебное не читается, а писать через общий PUT
 * можно только то, что настраивается на экране «Настройки».
 */
const HIDDEN_KEYS = new Set([
  "director_key_hash",
  // 22.10: секрет меняющегося кода — кто его прочитает, тот сам считает коды.
  "director_totp_secret",
  "director_totp_used_step",
]);
const WRITABLE_KEYS = new Set(["work_hours_start", "work_hours_end", "return_reasons", "breakdown_reasons"]);

export async function appSettingsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const rows = await db.select().from(appSettings);
    return { items: rows.filter((r) => !HIDDEN_KEYS.has(r.key)) };
  });

  app.get<{ Params: { key: string } }>("/:key", async (req, reply) => {
    if (HIDDEN_KEYS.has(req.params.key)) return reply.code(404).send({ error: "not found" });
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
      // v0.4.22: разрешаем admin менять настройки наравне с
      // director/creator. На UI они один блок «настройки»
      // и логика для оператора одинаковая.
      const allowed = ["director", "creator", "admin"] as const;
      if (!allowed.includes(req.user?.role as never)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      if (!WRITABLE_KEYS.has(req.params.key)) {
        return reply.code(403).send({
          error: "protected_setting",
          message: "Эта настройка меняется только своим разделом (с ключом директора).",
        });
      }
      const Body = z.object({ value: z.string().min(1).max(2000) });
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
