import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  payments,
  rentals,
  returnInspections,
  scooters,
} from "../db/schema.js";

const RentalStatusEnum = z.enum([
  "new_request",
  "meeting",
  "active",
  "overdue",
  "returning",
  "completed",
  "completed_damage",
  "cancelled",
  "police",
  "court",
]);

const CreateRentalBody = z
  .object({
    clientId: z.number().int().positive(),
    scooterId: z.number().int().positive().optional().nullable(),
    parentRentalId: z.number().int().positive().optional().nullable(),
    status: RentalStatusEnum.optional(),
    sourceChannel: z
      .enum(["avito", "repeat", "ref", "passing", "other"])
      .optional(),
    tariffPeriod: z.enum(["short", "week", "month"]),
    rate: z.number().int().positive(),
    deposit: z.number().int().min(0).optional(),
    startAt: z.string(), // ISO
    endPlannedAt: z.string(),
    days: z.number().int().positive(),
    sum: z.number().int().min(0),
    paymentMethod: z.enum(["cash", "card", "transfer"]),
    equipment: z.array(z.string()).optional(),
    note: z.string().optional().nullable(),
  })
  .strict();

const PatchRentalBody = z
  .object({
    status: RentalStatusEnum.optional(),
    scooterId: z.number().int().positive().optional().nullable(),
    endPlannedAt: z.string().optional(),
    endActualAt: z.string().optional().nullable(),
    damageAmount: z.number().int().min(0).optional().nullable(),
    depositReturned: z.boolean().optional().nullable(),
    contractUploaded: z.boolean().optional(),
    paymentConfirmedBy: z
      .enum(["boss", "manager"])
      .optional()
      .nullable(),
    paymentConfirmedByName: z.string().optional().nullable(),
    paymentConfirmedAt: z.string().optional().nullable(),
    note: z.string().optional().nullable(),
    rate: z.number().int().positive().optional(),
    days: z.number().int().positive().optional(),
    sum: z.number().int().min(0).optional(),
  })
  .strict();

const CompleteBody = z
  .object({
    dateActual: z.string(), // YYYY-MM-DD
    conditionOk: z.boolean(),
    equipmentOk: z.boolean(),
    depositReturned: z.boolean(),
    damageAmount: z.number().int().min(0).optional(),
    damageNotes: z.string().optional().nullable(),
    mileageAtReturn: z.number().int().min(0).optional(),
  })
  .strict();

export async function rentalsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const rows = await db.select().from(rentals).orderBy(desc(rentals.id));
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const [row] = await db.select().from(rentals).where(eq(rentals.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // POST /api/rentals
  app.post("/", async (req, reply) => {
    const parsed = CreateRentalBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const d = parsed.data;
    const [row] = await db
      .insert(rentals)
      .values({
        clientId: d.clientId,
        scooterId: d.scooterId ?? null,
        parentRentalId: d.parentRentalId ?? null,
        status: d.status ?? "new_request",
        sourceChannel: d.sourceChannel ?? null,
        tariffPeriod: d.tariffPeriod,
        rate: d.rate,
        deposit: d.deposit ?? 2000,
        startAt: new Date(d.startAt),
        endPlannedAt: new Date(d.endPlannedAt),
        days: d.days,
        sum: d.sum,
        paymentMethod: d.paymentMethod,
        equipment: d.equipment ?? [],
        note: d.note ?? null,
      })
      .returning();
    return reply.code(201).send(row);
  });

  // PATCH /api/rentals/:id — универсальные изменения
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const parsed = PatchRentalBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.endPlannedAt) patch.endPlannedAt = new Date(parsed.data.endPlannedAt);
    if (parsed.data.endActualAt) patch.endActualAt = new Date(parsed.data.endActualAt);
    if (parsed.data.paymentConfirmedAt) {
      patch.paymentConfirmedAt = new Date(parsed.data.paymentConfirmedAt);
    }
    patch.updatedAt = sql`now()`;
    const [row] = await db
      .update(rentals)
      .set(patch)
      .where(eq(rentals.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // POST /api/rentals/:id/revert-overdue — снять просрочку
  app.post<{ Params: { id: string } }>(
    "/:id/revert-overdue",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: "bad id" });
      }
      // сегодня по демо-таймлайну; в реальном проде — now()
      const today = new Date(2026, 9, 13, 12, 0, 0);
      const [row] = await db
        .update(rentals)
        .set({
          status: "active",
          endPlannedAt: today,
          updatedAt: sql`now()`,
        })
        .where(and(eq(rentals.id, id), eq(rentals.status, "overdue")))
        .returning();
      if (!row) {
        return reply
          .code(409)
          .send({ error: "rental is not overdue or does not exist" });
      }
      // снимаем неоплаченные fine-платежи
      await db
        .delete(payments)
        .where(
          and(
            eq(payments.rentalId, id),
            eq(payments.type, "fine"),
            eq(payments.paid, false),
          ),
        );
      return row;
    },
  );

  // POST /api/rentals/:id/complete — завершение возврата (без ущерба или с)
  app.post<{ Params: { id: string } }>(
    "/:id/complete",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: "bad id" });
      }
      const parsed = CompleteBody.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      const d = parsed.data;
      const withDamage = (d.damageAmount ?? 0) > 0 || !d.conditionOk;

      // ----- в одной транзакции: обновить rental + записать inspection + (если ущерб) payment/incident
      const result = await db.transaction(async (tx) => {
        const [r] = await tx
          .update(rentals)
          .set({
            status: withDamage ? "completed_damage" : "completed",
            endActualAt: new Date(`${d.dateActual}T12:00:00+03:00`),
            depositReturned: d.depositReturned,
            damageAmount: d.damageAmount ?? null,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id))
          .returning();
        if (!r) throw new Error("not found");

        await tx
          .insert(returnInspections)
          .values({
            rentalId: id,
            inspectedOn: d.dateActual,
            conditionOk: d.conditionOk,
            equipmentOk: d.equipmentOk,
            depositReturned: d.depositReturned,
            mileageAtReturn: d.mileageAtReturn,
            damageNotes: d.damageNotes ?? null,
          })
          .onConflictDoUpdate({
            target: returnInspections.rentalId,
            set: {
              inspectedOn: d.dateActual,
              conditionOk: d.conditionOk,
              equipmentOk: d.equipmentOk,
              depositReturned: d.depositReturned,
              mileageAtReturn: d.mileageAtReturn,
              damageNotes: d.damageNotes ?? null,
            },
          });

        if (withDamage && d.damageAmount && d.damageAmount > 0) {
          await tx.insert(payments).values({
            rentalId: id,
            type: "damage",
            amount: d.damageAmount,
            method: "cash",
            paid: false,
            scheduledOn: d.dateActual,
            note: d.damageNotes ?? "ущерб при возврате",
          });
        }
        return r;
      });

      return result;
    },
  );

  // POST /api/rentals/:id/extend — продление (создаёт дочернюю аренду)
  app.post<{ Params: { id: string } }>(
    "/:id/extend",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: "bad id" });
      }
      const schema = z
        .object({
          extraDays: z.number().int().positive(),
          newRate: z.number().int().positive(),
          newTariffPeriod: z.enum(["short", "week", "month"]),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      const d = parsed.data;

      const result = await db.transaction(async (tx) => {
        const [old] = await tx
          .select()
          .from(rentals)
          .where(eq(rentals.id, id));
        if (!old) throw new Error("not found");

        // закрываем старую
        await tx
          .update(rentals)
          .set({
            status: "completed",
            endActualAt: old.endPlannedAt,
            depositReturned: false, // залог остаётся в серии
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id));

        // новая начинается где закончилась старая
        const newStart = old.endPlannedAt;
        const newEnd = new Date(newStart.getTime() + d.extraDays * 86_400_000);

        const [child] = await tx
          .insert(rentals)
          .values({
            clientId: old.clientId,
            scooterId: old.scooterId,
            parentRentalId: old.id,
            status: "active",
            sourceChannel: old.sourceChannel,
            tariffPeriod: d.newTariffPeriod,
            rate: d.newRate,
            deposit: old.deposit,
            startAt: newStart,
            endPlannedAt: newEnd,
            days: d.extraDays,
            sum: d.newRate * d.extraDays,
            paymentMethod: old.paymentMethod,
            equipment: old.equipment,
            note: `продление аренды #${String(old.id).padStart(4, "0")}`,
          })
          .returning();
        return child;
      });

      return reply.code(201).send(result);
    },
  );

  // POST /api/rentals/:id/confirm-payment — подтверждение оплаты + флаг контракта
  app.post<{ Params: { id: string } }>(
    "/:id/confirm-payment",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return reply.code(400).send({ error: "bad id" });
      }
      const schema = z
        .object({
          role: z.enum(["boss", "manager"]),
          byName: z.string().min(1),
          contractUploaded: z.boolean(),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      const d = parsed.data;
      const [row] = await db
        .update(rentals)
        .set({
          paymentConfirmedBy: d.role,
          paymentConfirmedByName: d.byName,
          paymentConfirmedAt: new Date(),
          contractUploaded: d.contractUploaded,
          updatedAt: sql`now()`,
        })
        .where(eq(rentals.id, id))
        .returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    },
  );

  // suppress unused warning
  void scooters;
}
