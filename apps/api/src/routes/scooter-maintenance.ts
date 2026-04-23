import type { FastifyInstance } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { scooterMaintenance, scooters, users } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

const KindEnum = z.enum(["oil", "repair", "parts", "other"]);

const Body = z
  .object({
    scooterId: z.number().int().positive(),
    kind: KindEnum.default("other"),
    performedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    amount: z.number().int().min(0).max(10_000_000).default(0),
    mileage: z.number().int().min(0).max(1_000_000).nullable().optional(),
    note: z.string().nullable().optional(),
  })
  .strict();

export async function scooterMaintenanceRoutes(app: FastifyInstance) {
  /** GET /api/scooter-maintenance?scooterId=123 — журнал обслуживания скутера */
  app.get<{ Querystring: { scooterId?: string } }>("/", async (req, reply) => {
    const scooterId = Number(req.query.scooterId);
    if (!Number.isFinite(scooterId))
      return reply.code(400).send({ error: "scooterId required" });
    const rows = await db
      .select()
      .from(scooterMaintenance)
      .where(eq(scooterMaintenance.scooterId, scooterId))
      .orderBy(desc(scooterMaintenance.performedOn));
    return { items: rows };
  });

  app.post("/", async (req, reply) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });

    const { scooterId } = parsed.data;
    const [sc] = await db.select({ name: scooters.name }).from(scooters).where(eq(scooters.id, scooterId));
    if (!sc) return reply.code(404).send({ error: "scooter not found" });

    const [u] = req.user
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, req.user.userId))
      : [];
    const createdBy = u?.name ?? req.user?.login ?? null;

    const [row] = await db
      .insert(scooterMaintenance)
      .values({
        scooterId,
        kind: parsed.data.kind,
        performedOn: parsed.data.performedOn,
        amount: parsed.data.amount,
        mileage: parsed.data.mileage ?? null,
        note: parsed.data.note ?? null,
        createdBy,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    await logActivity(req, {
      entity: "maintenance",
      entityId: row.id,
      action: "created",
      summary: `Запись обслуживания для ${sc.name}: ${row.kind}, ${row.amount} ₽`,
      meta: { scooterId },
    });

    return row;
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed = Body.partial().safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });

    const [updated] = await db
      .update(scooterMaintenance)
      .set(parsed.data)
      .where(eq(scooterMaintenance.id, id))
      .returning();
    if (!updated) return reply.code(404).send({ error: "not found" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    await db.delete(scooterMaintenance).where(eq(scooterMaintenance.id, id));
    return { ok: true };
  });

  void and;
}
