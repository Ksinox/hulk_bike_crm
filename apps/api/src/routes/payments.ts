import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { damageReports, payments, rentals } from "../db/schema.js";

const CreatePaymentBody = z
  .object({
    rentalId: z.number().int().positive(),
    // v0.4.34: добавлен 'swap_fee' — он давно есть в БД-enum payment_type,
    // но в zod-валидаторе отсутствовал, делать руками платёж было нельзя.
    type: z.enum(["rent", "deposit", "fine", "damage", "refund", "swap_fee"]),
    amount: z.number().int().positive(),
    // v0.4.34: добавлен 'deposit' — спец-метод оплат из залога/депозита,
    // не попадает в revenue (см. lib/revenue.ts).
    method: z.enum(["cash", "card", "transfer", "deposit"]),
    paid: z.boolean().optional(),
    paidAt: z.string().optional().nullable(),
    scheduledOn: z.string().optional().nullable(),
    // v0.4.34: критично для платежей type='damage' — раньше схема
    // молча не принимала damageReportId, фронт получал 400 при оплате
    // ущерба (см. PaymentAcceptDialog.distribute → target='damage').
    damageReportId: z.number().int().positive().optional().nullable(),
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

  // v0.4.34: считаем долг ПО КАЖДОМУ damage_report отдельно и суммируем
  // только положительные остатки (Σ max(0, total − depositCovered − paid)).
  // Раньше: brutto billed − Σ всех damage-payments. При множественных
  // актах переплата по одному акту «съедала» долг другого, и autoClose
  // срабатывал преждевременно. Также теперь учитываем damageReportId в
  // payments — если платёж не привязан к акту (legacy), он раздаётся
  // pro-rata между актами.
  const reports = await db
    .select({
      id: damageReports.id,
      total: damageReports.total,
      depositCovered: damageReports.depositCovered,
    })
    .from(damageReports)
    .where(eq(damageReports.rentalId, rentalId));

  if (reports.length === 0) return;

  const damagePays = await db
    .select({
      amount: payments.amount,
      damageReportId: payments.damageReportId,
    })
    .from(payments)
    .where(
      sql`${payments.rentalId} = ${rentalId} AND ${payments.type} = 'damage' AND ${payments.paid} = true`,
    );

  // Сначала разносим платежи с явным damageReportId
  const paidByReport = new Map<number, number>();
  let unassignedPaid = 0;
  for (const p of damagePays) {
    if (p.damageReportId != null) {
      paidByReport.set(
        p.damageReportId,
        (paidByReport.get(p.damageReportId) ?? 0) + (p.amount ?? 0),
      );
    } else {
      unassignedPaid += p.amount ?? 0;
    }
  }
  // Старые legacy-платежи без damageReportId — раскидываем pro-rata
  // по остаточному долгу каждого акта (FIFO по созданию).
  if (unassignedPaid > 0) {
    for (const rep of reports) {
      if (unassignedPaid <= 0) break;
      const reportDebt = Math.max(
        0,
        (rep.total ?? 0) -
          (rep.depositCovered ?? 0) -
          (paidByReport.get(rep.id) ?? 0),
      );
      const take = Math.min(unassignedPaid, reportDebt);
      paidByReport.set(rep.id, (paidByReport.get(rep.id) ?? 0) + take);
      unassignedPaid -= take;
    }
  }

  const debt = reports.reduce(
    (s, rep) =>
      s +
      Math.max(
        0,
        (rep.total ?? 0) -
          (rep.depositCovered ?? 0) -
          (paidByReport.get(rep.id) ?? 0),
      ),
    0,
  );
  if (debt === 0) {
    // v0.4.21: уточнение по бизнесу — если возврат не завершён
    // (endActualAt = null), скутер ещё у клиента, значит после
    // погашения долга аренда должна быть 'active', а не 'completed'.
    // Если возврат уже зафиксирован — переводим в 'completed'.
    const nextStatus: "active" | "completed" =
      r.endActualAt == null ? "active" : "completed";
    await db
      .update(rentals)
      .set({ status: nextStatus, updatedAt: sql`now()` })
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
    // v0.4.34: enforced — type='damage' ОБЯЗАН иметь damageReportId.
    // Иначе платёж не привяжется к конкретному акту и при множественных
    // damage_reports автозакрытие посчитает его в общую кучу. Раньше
    // это было «по соглашению», бэк молчал.
    if (d.type === "damage" && !d.damageReportId) {
      return reply.code(400).send({
        error: "validation",
        message: "damage payment requires damageReportId",
      });
    }
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
        damageReportId: d.damageReportId ?? null,
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
