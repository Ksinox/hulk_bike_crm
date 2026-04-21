import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { rentalTasks } from "../db/schema.js";

const CreateTaskBody = z
  .object({
    rentalId: z.number().int().positive().optional().nullable(),
    clientId: z.number().int().positive().optional().nullable(),
    title: z.string().min(1).max(300),
    dueAt: z.string(), // ISO
  })
  .strict();

const PatchTaskBody = z
  .object({
    done: z.boolean().optional(),
    title: z.string().min(1).max(300).optional(),
    dueAt: z.string().optional(),
  })
  .strict();

export async function tasksRoutes(app: FastifyInstance) {
  // GET /api/tasks?rentalId=123
  app.get<{ Querystring: { rentalId?: string; clientId?: string } }>(
    "/",
    async (req) => {
      const rentalId = req.query.rentalId ? Number(req.query.rentalId) : null;
      const clientId = req.query.clientId ? Number(req.query.clientId) : null;
      let rows = await db.select().from(rentalTasks).orderBy(rentalTasks.dueAt);
      if (rentalId != null) rows = rows.filter((t) => t.rentalId === rentalId);
      if (clientId != null) rows = rows.filter((t) => t.clientId === clientId);
      return { items: rows };
    },
  );

  // POST /api/tasks
  app.post("/", async (req, reply) => {
    const parsed = CreateTaskBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const d = parsed.data;
    const [row] = await db
      .insert(rentalTasks)
      .values({
        rentalId: d.rentalId ?? null,
        clientId: d.clientId ?? null,
        title: d.title,
        dueAt: new Date(d.dueAt),
      })
      .returning();
    return reply.code(201).send(row);
  });

  // PATCH /api/tasks/:id
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const parsed = PatchTaskBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.dueAt) patch.dueAt = new Date(parsed.data.dueAt);
    // done = true → проставляем doneAt автоматически
    if (parsed.data.done === true) patch.doneAt = sql`now()`;
    if (parsed.data.done === false) patch.doneAt = null;
    const [row] = await db
      .update(rentalTasks)
      .set(patch)
      .where(eq(rentalTasks.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
