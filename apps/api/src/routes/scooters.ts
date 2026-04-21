import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { scooters } from "../db/schema.js";

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
}
