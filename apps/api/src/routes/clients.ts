import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";

export async function clientsRoutes(app: FastifyInstance) {
  // GET /api/clients
  app.get("/", async () => {
    const rows = await db.select().from(clients).orderBy(clients.name);
    return { items: rows };
  });

  // GET /api/clients/:id
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const [row] = await db.select().from(clients).where(eq(clients.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
