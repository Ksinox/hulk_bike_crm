import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { scooterModels } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";

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
        note: data.note ?? null,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    await logActivity(req, {
      entity: "model",
      entityId: row.id,
      action: "created",
      summary: `Добавлена модель «${row.name}»`,
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

      const [updated] = await db
        .update(scooterModels)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(scooterModels.id, id))
        .returning();
      if (!updated) return reply.code(404).send({ error: "not found" });

      await logActivity(req, {
        entity: "model",
        entityId: id,
        action: "updated",
        summary: `Изменена модель «${updated.name}»`,
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
}
