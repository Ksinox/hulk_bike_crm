import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { documentTemplates } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { requireRole } from "../auth/plugin.js";
import { VARIABLE_CATALOG } from "../documents/variables.js";

/**
 * Пользовательские шаблоны документов (overrides системных + custom).
 *
 *   GET  /api/document-templates                    — все шаблоны
 *   GET  /api/document-templates/by-key/:key        — конкретный по templateKey
 *   POST /api/document-templates                    — создать
 *   PATCH /api/document-templates/:id               — изменить
 *   DELETE /api/document-templates/:id              — удалить (системный
 *                                                     откатится к дефолту)
 *
 * Чтение — все авторизованные. Запись — director/creator.
 */
const staffOnly = requireRole("director");

const CreateBody = z.object({
  templateKey: z.string().min(1).max(100),
  kind: z.enum(["override", "custom"]).default("override"),
  name: z.string().min(1).max(200),
  body: z.string(),
});

const PatchBody = z.object({
  name: z.string().min(1).max(200).optional(),
  body: z.string().optional(),
});

function getUserId(req: FastifyRequest): number | null {
  const u = (req as unknown as { user?: { userId?: number } }).user;
  return u?.userId ?? null;
}

export async function documentTemplatesRoutes(app: FastifyInstance) {
  /** Каталог переменных для UI sidebar редактора. */
  app.get("/variables", async () => ({ groups: VARIABLE_CATALOG }));

  app.get("/", async () => {
    const rows = await db
      .select()
      .from(documentTemplates)
      .orderBy(asc(documentTemplates.templateKey), asc(documentTemplates.id));
    return { items: rows };
  });

  app.get<{ Params: { key: string } }>(
    "/by-key/:key",
    async (req, reply) => {
      const key = req.params.key;
      const [row] = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.templateKey, key));
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    },
  );

  app.post("/", { preHandler: staffOnly }, async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const userId = getUserId(req);
    // Если override для уже существующего key — заменяем (upsert).
    if (parsed.data.kind === "override") {
      const [existing] = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.templateKey, parsed.data.templateKey));
      if (existing) {
        const [updated] = await db
          .update(documentTemplates)
          .set({
            name: parsed.data.name,
            body: parsed.data.body,
            updatedAt: new Date(),
          })
          .where(eq(documentTemplates.id, existing.id))
          .returning();
        return updated;
      }
    }
    const [row] = await db
      .insert(documentTemplates)
      .values({
        templateKey: parsed.data.templateKey,
        kind: parsed.data.kind,
        name: parsed.data.name,
        body: parsed.data.body,
        createdByUserId: userId,
      })
      .returning();
    await logActivity(req, {
      entity: "document_template",
      entityId: row!.id,
      action: "created",
      summary: `Создан шаблон документа «${row!.name}» (${row!.kind})`,
    });
    return row;
  });

  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const parsed = PatchBody.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const [row] = await db
        .update(documentTemplates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(documentTemplates.id, id))
        .returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(documentTemplates)
        .where(eq(documentTemplates.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });
      await db.delete(documentTemplates).where(eq(documentTemplates.id, id));
      await logActivity(req, {
        entity: "document_template",
        entityId: id,
        action: "deleted",
        summary: `Удалён шаблон «${row.name}»`,
      });
      return reply.code(204).send();
    },
  );
}
