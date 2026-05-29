import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { noteStickers } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

/* ============================================================
 * Стикеры-заметки (v0.8.12).
 *
 * Маршруты под префиксом /api/stickers:
 *   GET    /?entity=rental&entityId=12[&includeDismissed=1]
 *   POST   /                 — создать стикер
 *   POST   /:id/dismiss      — снять стикер (мягко, остаётся для истории)
 *
 * entity: 'rental' | 'client'. kind: 'note' | 'contact'.
 * Каждое создание/снятие пишется в журнал действий (на ту же сущность),
 * чтобы аудитор видел кто/когда/что написал.
 * ============================================================ */

const ENTITIES = ["rental", "client"] as const;
const KINDS = ["note", "contact"] as const;

const CreateBody = z
  .object({
    entity: z.enum(ENTITIES),
    entityId: z.number().int().positive(),
    kind: z.enum(KINDS).optional().default("note"),
    text: z.string().trim().min(1).max(2000),
    color: z.string().trim().max(24).optional().default("yellow"),
  })
  .strict();

const ListQuery = z.object({
  entity: z.enum(ENTITIES),
  entityId: z.coerce.number().int().positive(),
  includeDismissed: z.coerce.boolean().optional(),
});

const kindWord = (kind: string) =>
  kind === "contact" ? "Комментарий по связи" : "Заметка";

export async function stickersRoutes(app: FastifyInstance) {
  // GET /api/stickers?entity=rental&entityId=12
  app.get("/", async (req, reply) => {
    const parsed = ListQuery.safeParse(req.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const { entity, entityId, includeDismissed } = parsed.data;
    const where = includeDismissed
      ? and(eq(noteStickers.entity, entity), eq(noteStickers.entityId, entityId))
      : and(
          eq(noteStickers.entity, entity),
          eq(noteStickers.entityId, entityId),
          isNull(noteStickers.dismissedAt),
        );
    const rows = await db
      .select()
      .from(noteStickers)
      .where(where)
      .orderBy(desc(noteStickers.createdAt));
    return rows;
  });

  // POST /api/stickers
  app.post("/", async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const { entity, entityId, kind, text, color } = parsed.data;
    const [row] = await db
      .insert(noteStickers)
      .values({
        entity,
        entityId,
        kind,
        text,
        color,
        createdByUserId: req.user?.userId ?? null,
        createdByName: req.user?.login ?? null,
      })
      .returning();

    await logActivity(req, {
      entity,
      entityId,
      action: "note_added",
      summary: `${kindWord(kind)} добавлена: «${text}»`,
      meta: { kind, text },
    });
    return reply.code(201).send(row);
  });

  // POST /api/stickers/:id/dismiss — мягкое снятие
  app.post<{ Params: { id: string } }>("/:id/dismiss", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db
      .update(noteStickers)
      .set({
        dismissedAt: new Date(),
        dismissedByName: req.user?.login ?? null,
      })
      .where(and(eq(noteStickers.id, id), isNull(noteStickers.dismissedAt)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    await logActivity(req, {
      entity: row.entity as (typeof ENTITIES)[number],
      entityId: row.entityId,
      action: "note_unpinned",
      summary: `${kindWord(row.kind)} откреплена: «${row.text}»`,
      meta: { kind: row.kind, text: row.text },
    });
    return row;
  });

  // DELETE /api/stickers/:id — полное удаление (из раздела «Заметки»).
  // Аудит остаётся в журнале (note_deleted), сама запись удаляется.
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db
      .delete(noteStickers)
      .where(eq(noteStickers.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    await logActivity(req, {
      entity: row.entity as (typeof ENTITIES)[number],
      entityId: row.entityId,
      action: "note_deleted",
      summary: `${kindWord(row.kind)} удалена: «${row.text}»`,
      meta: { kind: row.kind, text: row.text },
    });
    return { ok: true };
  });
}
