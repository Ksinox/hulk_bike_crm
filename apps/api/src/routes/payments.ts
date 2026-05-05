import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { damageReports, payments, rentals } from "../db/schema.js";

const CreatePaymentBody = z
  .object({
    rentalId: z.number().int().positive(),
    type: z.enum(["rent", "deposit", "fine", "damage", "refund"]),
    amount: z.number().int().positive(),
    method: z.enum(["cash", "card", "transfer"]),
    paid: z.boolean().optional(),
    paidAt: z.string().optional().nullable(),
    scheduledOn: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
  })
  .strict();

const PatchPaymentBody = z
  .object({
    paid: z.boolean().optional(),
    paidAt: z.string().optional().nullable(),
    amount: z.number().int().positive().optional(),
    note: z.string().optional().nullable(),
  })
  .strict();

/**
 * Когда долг по ущербу полностью погашен — переводим аренду из
 * 'completed_damage' / 'problem' → 'completed'. Источник правды по
 * долгу: damage_reports (total - depositCovered) − Σ(paid damage payments).
 *
 * v0.4.19: расширено на 'problem' (раньше только completed_damage),
 * и считаем по реальному debt из damage_reports + сумма paid платежей,
 * а не по «есть ли неоплаченные scheduled». Раньше если все
 * damage-payments были paid=true, leftover=0 — статус сменялся, но
 * для 'problem' этого не делалось вообще.
 */
async function maybeAutoClose(rentalId: number) {
  const [r] = await db.select().from(rentals).where(eq(rentals.id, rentalId));
  if (!r) return;
  if (r.status !== "completed_damage" && r.status !== "problem") return;

  const reports = await db
    .select({
      total: damageReports.total,
      depositCovered: damageReports.depositCovered,
    })
    .from(damageReports)
    .where(eq(damageReports.rentalId, rentalId));
  const billed = reports.reduce(
    (s, x) => s + (x.total ?? 0) - (x.depositCovered ?? 0),
    0,
  );

  const paidRow = await db
    .select({ s: sql<number>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments)
    .where(
      sql`${payments.rentalId} = ${rentalId} AND ${payments.type} = 'damage' AND ${payments.paid} = true`,
    );
  const paidSum = Number(paidRow[0]?.s ?? 0);

  const debt = Math.max(0, billed - paidSum);
  if (debt === 0) {
    await db
      .update(rentals)
      .set({ status: "completed", updatedAt: sql`now()` })
      .where(eq(rentals.id, rentalId));
  }
}

export async function paymentsRoutes(app: FastifyInstance) {
  // GET /api/payments?rentalId=123
  app.get<{ Querystring: { rentalId?: string } }>("/", async (req) => {
    const rentalId = req.query.rentalId ? Number(req.query.rentalId) : null;
    const rows = rentalId
      ? await db
          .select()
          .from(payments)
          .where(eq(payments.rentalId, rentalId))
          .orderBy(payments.id)
      : await db.select().from(payments).orderBy(payments.id);
    return { items: rows };
  });

  // POST /api/payments
  app.post("/", async (req, reply) => {
    const parsed = CreatePaymentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const d = parsed.data;
    const [row] = await db
      .insert(payments)
      .values({
        rentalId: d.rentalId,
        type: d.type,
        amount: d.amount,
        method: d.method,
        paid: d.paid ?? false,
        paidAt: d.paidAt ? new Date(d.paidAt) : null,
        scheduledOn: d.scheduledOn ?? null,
        note: d.note ?? null,
      })
      .returning();
    if (d.paid) await maybeAutoClose(d.rentalId);
    return reply.code(201).send(row);
  });

  // PATCH /api/payments/:id
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const parsed = PatchPaymentBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.paidAt !== undefined) {
      patch.paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : null;
    }
    const [row] = await db
      .update(payments)
      .set(patch)
      .where(eq(payments.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    if (parsed.data.paid === true) await maybeAutoClose(row.rentalId);
    return row;
  });
}
