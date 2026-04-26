import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { scooterModels } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";
import { diffFields } from "../services/activityMessages.js";
import { makeFileKey, putObject, removeObject } from "../storage/index.js";

const MAX_AVATAR = 5 * 1024 * 1024; // 5 МБ

const staffOnly = requireRole("director", "admin");

const Body = z
  .object({
    name: z.string().trim().min(1).max(100),
    avatarKey: z.string().optional().nullable(),
    avatarFileName: z.string().optional().nullable(),
    quickPick: z.boolean().optional(),
    shortRate: z.number().int().min(0).max(1_000_000).optional(),
    weekRate: z.number().int().min(0).max(1_000_000).optional(),
    monthRate: z.number().int().min(0).max(1_000_000).optional(),
    /** Технические характеристики — для лендинга */
    maxSpeedKmh: z.number().int().min(0).max(400).nullable().optional(),
    tankVolumeL: z.union([z.number().min(0).max(99), z.string().regex(/^\d+(\.\d{1,2})?$/)])
      .nullable()
      .optional(),
    fuelLPer100Km: z.union([z.number().min(0).max(99), z.string().regex(/^\d+(\.\d{1,2})?$/)])
      .nullable()
      .optional(),
    coolingType: z.enum(["air", "liquid"]).nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

export async function scooterModelsRoutes(app: FastifyInstance) {
  /** Список всех моделей. quickPick=true — кандидаты для быстрого пикера. */
  app.get("/", async () => {
    const rows = await db.select().from(scooterModels).orderBy(scooterModels.id);
    return { items: rows };
  });

  app.post("/", { preHandler: staffOnly }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const data = parsed.data;
    const [dup] = await db
      .select({ id: scooterModels.id })
      .from(scooterModels)
      .where(eq(scooterModels.name, data.name));
    if (dup) return reply.code(409).send({ error: "name already exists" });

    const [row] = await db
      .insert(scooterModels)
      .values({
        name: data.name,
        avatarKey: data.avatarKey ?? null,
        avatarFileName: data.avatarFileName ?? null,
        quickPick: data.quickPick ?? false,
        shortRate: data.shortRate ?? 1300,
        weekRate: data.weekRate ?? 500,
        monthRate: data.monthRate ?? 400,
        maxSpeedKmh: data.maxSpeedKmh ?? null,
        // Drizzle для numeric ждёт строку
        tankVolumeL: data.tankVolumeL == null ? null : String(data.tankVolumeL),
        fuelLPer100Km: data.fuelLPer100Km == null ? null : String(data.fuelLPer100Km),
        coolingType: data.coolingType ?? null,
        note: data.note ?? null,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    await logActivity(req, {
      entity: "model",
      entityId: row.id,
      action: "created",
      summary: `Создана модель «${row.name}» · тарифы ${row.shortRate}/${row.weekRate}/${row.monthRate} ₽ за сутки`,
    });

    return row;
  });

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const parsed = Body.partial().safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      }

      const [before] = await db
        .select()
        .from(scooterModels)
        .where(eq(scooterModels.id, id));
      if (!before) return reply.code(404).send({ error: "not found" });

      // Подготавливаем patch: numeric требует string-репрезентацию
      const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
      if ("tankVolumeL" in patch) {
        patch.tankVolumeL = patch.tankVolumeL == null ? null : String(patch.tankVolumeL);
      }
      if ("fuelLPer100Km" in patch) {
        patch.fuelLPer100Km = patch.fuelLPer100Km == null ? null : String(patch.fuelLPer100Km);
      }
      const [updated] = await db
        .update(scooterModels)
        .set(patch)
        .where(eq(scooterModels.id, id))
        .returning();
      if (!updated) return reply.code(404).send({ error: "not found" });

      // Собираем человечный список что именно поменяли
      const changes = diffFields(
        before as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
        {
          name: "название",
          shortRate: "тариф 1–3 дня",
          weekRate: "тариф за неделю",
          monthRate: "тариф за месяц",
          quickPick: "быстрый выбор",
          maxSpeedKmh: "макс. скорость",
          tankVolumeL: "объём бака",
          fuelLPer100Km: "расход топлива",
          coolingType: "тип охлаждения",
          note: "примечание",
        },
      );
      let summary: string;
      if (before.name !== updated.name) {
        summary = `Модель «${before.name}» переименована в «${updated.name}»`;
      } else if (changes.length === 0) {
        summary = `Модель «${updated.name}» сохранена без изменений`;
      } else {
        summary = `В модели «${updated.name}» обновлено: ${changes.join(", ")}`;
      }

      await logActivity(req, {
        entity: "model",
        entityId: id,
        action: "updated",
        summary,
      });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [existing] = await db
        .select()
        .from(scooterModels)
        .where(eq(scooterModels.id, id));
      if (!existing) return reply.code(404).send({ error: "not found" });

      // удалим аватарку из MinIO если была
      if (existing.avatarKey) {
        await removeObject(existing.avatarKey).catch(() => null);
      }

      await db.delete(scooterModels).where(eq(scooterModels.id, id));
      await logActivity(req, {
        entity: "model",
        entityId: id,
        action: "deleted",
        summary: `Удалена модель «${existing.name}»`,
      });
      return { ok: true };
    },
  );

  /**
   * POST /api/scooter-models/:id/avatar (multipart)
   * Поле file — картинка (JPG/PNG/WEBP, до 5 МБ).
   * Кладёт в MinIO, обновляет avatarKey/avatarFileName, старую удаляет.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/avatar",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

      const [existing] = await db
        .select()
        .from(scooterModels)
        .where(eq(scooterModels.id, id));
      if (!existing) return reply.code(404).send({ error: "not found" });

      const parts = req.parts({ limits: { fileSize: MAX_AVATAR, files: 1 } });
      let fileBuf: Buffer | null = null;
      let fileName = "avatar";
      let mimeType = "application/octet-stream";
      for await (const part of parts) {
        if (part.type === "file") {
          fileBuf = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        }
      }
      if (!fileBuf) return reply.code(400).send({ error: "file required" });
      if (!/^image\//.test(mimeType))
        return reply.code(400).send({ error: "only images" });

      const key = makeFileKey(`models/${id}`, fileName);
      await putObject(key, fileBuf, mimeType);

      // удаляем старую
      if (existing.avatarKey && existing.avatarKey !== key) {
        await removeObject(existing.avatarKey).catch(() => null);
      }

      const [updated] = await db
        .update(scooterModels)
        .set({ avatarKey: key, avatarFileName: fileName, updatedAt: new Date() })
        .where(eq(scooterModels.id, id))
        .returning();
      await logActivity(req, {
        entity: "model",
        entityId: id,
        action: "avatar_uploaded",
        summary: existing.avatarKey
          ? `Заменена аватарка модели «${existing.name}»`
          : `Загружена аватарка модели «${existing.name}»`,
      });
      return updated;
    },
  );

  /** DELETE /api/scooter-models/:id/avatar — снять аватарку. */
  app.delete<{ Params: { id: string } }>(
    "/:id/avatar",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [existing] = await db
        .select()
        .from(scooterModels)
        .where(eq(scooterModels.id, id));
      if (!existing) return reply.code(404).send({ error: "not found" });
      if (existing.avatarKey) {
        await removeObject(existing.avatarKey).catch(() => null);
      }
      const [updated] = await db
        .update(scooterModels)
        .set({ avatarKey: null, avatarFileName: null, updatedAt: new Date() })
        .where(eq(scooterModels.id, id))
        .returning();
      if (existing.avatarKey) {
        await logActivity(req, {
          entity: "model",
          entityId: id,
          action: "avatar_deleted",
          summary: `Удалена аватарка модели «${existing.name}»`,
        });
      }
      return updated;
    },
  );
}
