import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { payments, rentalIncidents, rentals } from "../db/schema.js";

const CreateIncidentBody = z
  .object({
    rentalId: z.number().int().positive(),
    type: z.string().min(1).max(200),
    occurredOn: z.string(), // YYYY-MM-DD
    damage: z.number().int().min(0).optional(),
    note: z.string().optional().nullable(),
  })
  .strict();

export async function incidentsRoutes(app: FastifyInstance) {
  // GET /api/incidents?rentalId=123
  app.get<{ Querystring: { rentalId?: string } }>("/", async (req) => {
    const rentalId = req.query.rentalId ? Number(req.query.rentalId) : null;
    const rows = rentalId
      ? await db
          .select()
          .from(rentalIncidents)
          .where(eq(rentalIncidents.rentalId, rentalId))
          .orderBy(rentalIncidents.id)
      : await db
          .select()
          .from(rentalIncidents)
          .orderBy(rentalIncidents.id);
    return { items: rows };
  });

  // POST /api/incidents — автоматически создаёт damage-платёж если damage > 0
  app.post("/", async (req, reply) => {
    const parsed = CreateIncidentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const d = parsed.data;
    const [rental] = await db
      .select({ scooterId: rentals.scooterId })
      .from(rentals)
      .where(eq(rentals.id, d.rentalId));
    if (!rental) return reply.code(404).send({ error: "rental not found" });

    const result = await db.transaction(async (tx) => {
      const [inc] = await tx
        .insert(rentalIncidents)
        .values({
          rentalId: d.rentalId,
          scooterId: rental.scooterId ?? null,
          type: d.type,
          occurredOn: d.occurredOn,
          damage: d.damage ?? 0,
          paidTowardDamage: 0,
          note: d.note ?? null,
        })
        .returning();
      if ((d.damage ?? 0) > 0) {
        await tx.insert(payments).values({
          rentalId: d.rentalId,
          type: "damage",
          amount: d.damage!,
          method: "cash",
          paid: false,
          scheduledOn: d.occurredOn,
          note: d.note ?? "ущерб по инциденту",
        });
      }
      return inc;
    });
    return reply.code(201).send(result);
  });
}
