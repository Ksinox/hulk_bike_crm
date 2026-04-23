import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { equipmentItems } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";
import { diffFields } from "../services/activityMessages.js";
import { makeFileKey, putObject, removeObject } from "../storage/index.js";

const MAX_AVATAR = 5 * 1024 * 1024;

const staffOnly = requireRole("director", "admin");

const Body = z
  .object({
    name: z.string().trim().min(1).max(100),
    avatarKey: z.string().optional().nullable(),
    avatarFileName: z.string().optional().nullable(),
    quickPick: z.boolean().optional(),
    price: z.number().int().min(0).max(1_000_000).optional(),
    isFree: z.boolean().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

export async function equipmentRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const rows = await db.select().from(equipmentItems).orderBy(equipmentItems.id);
    return { items: rows };
  });

  app.post("/", { preHandler: staffOnly }, async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const data = parsed.data;
    const [dup] = await db
      .select({ id: equipmentItems.id })
      .from(equipmentItems)
      .where(eq(equipmentItems.name, data.name));
    if (dup) return reply.code(409).send({ error: "name already exists" });

    const [row] = await db
      .insert(equipmentItems)
      .values({
        name: data.name,
        avatarKey: data.avatarKey ?? null,
        avatarFileName: data.avatarFileName ?? null,
        quickPick: data.quickPick ?? true,
        price: data.price ?? 0,
        isFree: data.isFree ?? true,
        note: data.note ?? null,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    await logActivity(req, {
      entity: "equipment",
      entityId: row.id,
      action: "created",
      summary: row.isFree
        ? `Создана экипировка «${row.name}» (бесплатно)`
        : `Создана экипировка «${row.name}» · ${row.price} ₽`,
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
        .from(equipmentItems)
        .where(eq(equipmentItems.id, id));
      if (!before) return reply.code(404).send({ error: "not found" });

      const [updated] = await db
        .update(equipmentItems)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(equipmentItems.id, id))
        .returning();
      if (!updated) return reply.code(404).send({ error: "not found" });

      const changes = diffFields(
        before as unknown as Record<string, unknown>,
        updated as unknown as Record<string, unknown>,
        {
          name: "название",
          price: "цена",
          isFree: "бесплатно/платно",
          quickPick: "быстрый выбор",
          note: "примечание",
        },
      );
      let summary: string;
      if (before.name !== updated.name) {
        summary = `Экипировка «${before.name}» переименована в «${updated.name}»`;
      } else if (changes.length === 0) {
        summary = `Экипировка «${updated.name}» сохранена без изменений`;
      } else {
        summary = `В экипировке «${updated.name}» обновлено: ${changes.join(", ")}`;
      }

      await logActivity(req, {
        entity: "equipment",
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
        .from(equipmentItems)
        .where(eq(equipmentItems.id, id));
      if (!existing) return reply.code(404).send({ error: "not found" });

      if (existing.avatarKey) {
        await removeObject(existing.avatarKey).catch(() => null);
      }

      await db.delete(equipmentItems).where(eq(equipmentItems.id, id));
      await logActivity(req, {
        entity: "equipment",
        entityId: id,
        action: "deleted",
        summary: `Удалена экипировка «${existing.name}»`,
      });
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/avatar",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [existing] = await db
        .select()
        .from(equipmentItems)
        .where(eq(equipmentItems.id, id));
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

      const key = makeFileKey(`equipment/${id}`, fileName);
      await putObject(key, fileBuf, mimeType);

      if (existing.avatarKey && existing.avatarKey !== key) {
        await removeObject(existing.avatarKey).catch(() => null);
      }

      const [updated] = await db
        .update(equipmentItems)
        .set({ avatarKey: key, avatarFileName: fileName, updatedAt: new Date() })
        .where(eq(equipmentItems.id, id))
        .returning();
      await logActivity(req, {
        entity: "equipment",
        entityId: id,
        action: "avatar_uploaded",
        summary: existing.avatarKey
          ? `Заменена аватарка экипировки «${existing.name}»`
          : `Загружена аватарка экипировки «${existing.name}»`,
      });
      return updated;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id/avatar",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [existing] = await db
        .select()
        .from(equipmentItems)
        .where(eq(equipmentItems.id, id));
      if (!existing) return reply.code(404).send({ error: "not found" });
      if (existing.avatarKey) {
        await removeObject(existing.avatarKey).catch(() => null);
      }
      const [updated] = await db
        .update(equipmentItems)
        .set({ avatarKey: null, avatarFileName: null, updatedAt: new Date() })
        .where(eq(equipmentItems.id, id))
        .returning();
      if (existing.avatarKey) {
        await logActivity(req, {
          entity: "equipment",
          entityId: id,
          action: "avatar_deleted",
          summary: `Удалена аватарка экипировки «${existing.name}»`,
        });
      }
      return updated;
    },
  );
}
