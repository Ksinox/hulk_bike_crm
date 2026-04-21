import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { scooters } from "../db/schema.js";

const ScooterModelEnum = z.enum(["jog", "gear", "honda", "tank"]);
const ScooterBaseStatusEnum = z.enum([
  "ready",
  "repair",
  "buyout",
  "for_sale",
  "sold",
]);

const CreateScooterBody = z
  .object({
    name: z.string().min(1).max(50),
    model: ScooterModelEnum,
    vin: z.string().max(20).optional().nullable(),
    engineNo: z.string().max(50).optional().nullable(),
    mileage: z.number().int().min(0).optional(),
    baseStatus: ScooterBaseStatusEnum.optional(),
    purchaseDate: z.string().optional().nullable(),
    purchasePrice: z.number().int().min(0).optional().nullable(),
    lastOilChangeMileage: z.number().int().min(0).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  })
  .strict();

const PatchScooterBody = CreateScooterBody.partial();

export async function scootersRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const rows = await db.select().from(scooters).orderBy(scooters.name);
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const [row] = await db.select().from(scooters).where(eq(scooters.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const parsed = CreateScooterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    try {
      const [row] = await db
        .insert(scooters)
        .values({
          ...parsed.data,
          mileage: parsed.data.mileage ?? 0,
          baseStatus: parsed.data.baseStatus ?? "ready",
        })
        .returning();
      return reply.code(201).send(row);
    } catch (e) {
      if (String(e).includes("unique")) {
        return reply.code(409).send({ error: "duplicate name" });
      }
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const parsed = PatchScooterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const [row] = await db
      .update(scooters)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(scooters.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
