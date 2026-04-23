import type { FastifyInstance } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  clients,
  payments,
  rentals,
  returnInspections,
  scooters,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { rentalStatusLabel } from "../services/activityMessages.js";

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

/** Снимок экипировки на момент аренды — { itemId?, name, price, free }. */
const EquipmentJsonItem = z
  .object({
    itemId: z.number().int().positive().optional().nullable(),
    name: z.string().min(1).max(100),
    price: z.number().int().min(0).max(1_000_000).default(0),
    free: z.boolean().default(true),
  })
  .strict();

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
    /** Сумма залога в ₽. 0 если неденежный. */
    deposit: z.number().int().min(0).optional(),
    /** Описание предмета, если залог неденежный */
    depositItem: z.string().max(200).optional().nullable(),
    startAt: z.string(), // ISO
    endPlannedAt: z.string(),
    days: z.number().int().positive(),
    sum: z.number().int().min(0),
    paymentMethod: z.enum(["cash", "card", "transfer"]),
    /** Legacy список строк. Желательно присылать equipmentJson. */
    equipment: z.array(z.string()).optional(),
    /** Новый формат экипировки — снимок из каталога */
    equipmentJson: z.array(EquipmentJsonItem).optional(),
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
    confirmContractSigned: z.boolean().optional(),
    confirmRentPaid: z.boolean().optional(),
    confirmDepositReceived: z.boolean().optional(),
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
    deposit: z.number().int().min(0).optional(),
    depositItem: z.string().max(200).nullable().optional(),
    equipmentJson: z.array(EquipmentJsonItem).optional(),
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

const ConfirmPaymentBody = z
  .object({
    role: z.enum(["boss", "manager"]),
    byName: z.string().min(1),
    contractSigned: z.boolean(),
    rentPaid: z.boolean(),
    depositReceived: z.boolean(),
  })
  .strict();

async function summaryForRental(rentalId: number): Promise<string> {
  const [r] = await db.select().from(rentals).where(eq(rentals.id, rentalId));
  if (!r) return `#${rentalId}`;
  const [cl] = await db
    .select({ name: clients.name })
    .from(clients)
    .where(eq(clients.id, r.clientId));
  const [sc] =
    r.scooterId != null
      ? await db.select({ name: scooters.name }).from(scooters).where(eq(scooters.id, r.scooterId))
      : [];
  return `#${r.id} · ${cl?.name ?? "—"}${sc?.name ? " · " + sc.name : ""}`;
}

export async function rentalsRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const rows = await db.select().from(rentals).orderBy(desc(rentals.id));
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db.select().from(rentals).where(eq(rentals.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

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
        depositItem: d.depositItem ?? null,
        startAt: new Date(d.startAt),
        endPlannedAt: new Date(d.endPlannedAt),
        days: d.days,
        sum: d.sum,
        paymentMethod: d.paymentMethod,
        equipment: d.equipment ?? [],
        equipmentJson: (d.equipmentJson ?? []) as unknown as object,
        note: d.note ?? null,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    const summary = await summaryForRental(row.id);
    await logActivity(req, {
      entity: "rental",
      entityId: row.id,
      action: "created",
      summary: `Создана аренда ${summary}`,
    });
    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed = PatchRentalBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const [before] = await db.select().from(rentals).where(eq(rentals.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.endPlannedAt)
      patch.endPlannedAt = new Date(parsed.data.endPlannedAt);
    if (parsed.data.endActualAt)
      patch.endActualAt = new Date(parsed.data.endActualAt);
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

    const summary = await summaryForRental(id);
    if (parsed.data.status && parsed.data.status !== before.status) {
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "status_changed",
        summary: `Аренда ${summary}: «${rentalStatusLabel(before.status)}» → «${rentalStatusLabel(row.status)}»`,
      });
    } else {
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "updated",
        summary: `Отредактирована аренда ${summary}`,
      });
    }
    return row;
  });

  // POST /api/rentals/:id/revert-overdue — снять просрочку
  app.post<{ Params: { id: string } }>(
    "/:id/revert-overdue",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const today = new Date();
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
      await db
        .delete(payments)
        .where(
          and(
            eq(payments.rentalId, id),
            eq(payments.type, "fine"),
            eq(payments.paid, false),
          ),
        );

      const summary = await summaryForRental(id);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "revert_overdue",
        summary: `Просрочка снята с аренды ${summary}`,
      });
      return row;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/complete",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const parsed = CompleteBody.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      const d = parsed.data;
      const withDamage = (d.damageAmount ?? 0) > 0 || !d.conditionOk;

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

      const summary = await summaryForRental(id);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "completed",
        summary: withDamage
          ? `Завершена аренда ${summary} · зафиксирован ущерб ${(d.damageAmount ?? 0).toLocaleString("ru-RU")} ₽`
          : `Завершена аренда ${summary} · без ущерба, залог ${d.depositReturned ? "возвращён клиенту" : "удержан"}`,
      });
      return result;
    },
  );

  app.post<{ Params: { id: string } }>(
    "/:id/extend",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          extraDays: z.number().int().positive(),
          newRate: z.number().int().positive(),
          newTariffPeriod: z.enum(["short", "week", "month"]),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      const d = parsed.data;

      const result = await db.transaction(async (tx) => {
        const [old] = await tx.select().from(rentals).where(eq(rentals.id, id));
        if (!old) throw new Error("not found");

        await tx
          .update(rentals)
          .set({
            status: "completed",
            endActualAt: old.endPlannedAt,
            depositReturned: false,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id));

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
            depositItem: old.depositItem,
            startAt: newStart,
            endPlannedAt: newEnd,
            days: d.extraDays,
            sum: d.newRate * d.extraDays,
            paymentMethod: old.paymentMethod,
            equipment: old.equipment,
            equipmentJson: old.equipmentJson as unknown as object,
            note: `продление аренды #${String(old.id).padStart(4, "0")}`,
          })
          .returning();
        return child;
      });

      if (result) {
        const summary = await summaryForRental(result.id);
        await logActivity(req, {
          entity: "rental",
          entityId: result.id,
          action: "extended",
          summary: `Продление аренды ${summary} на ${d.extraDays} дн`,
        });
      }
      return reply.code(201).send(result);
    },
  );

  /**
   * POST /api/rentals/:id/confirm-payment
   * Новый чеклист: contractSigned, rentPaid, depositReceived.
   * Подтвердить можно с неотмеченными, но в activity_log попадёт предупреждение.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/confirm-payment",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

      const parsed = ConfirmPaymentBody.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      const d = parsed.data;

      const [before] = await db.select().from(rentals).where(eq(rentals.id, id));
      if (!before) return reply.code(404).send({ error: "not found" });

      const [row] = await db
        .update(rentals)
        .set({
          paymentConfirmedBy: d.role,
          paymentConfirmedByName: d.byName,
          paymentConfirmedAt: new Date(),
          confirmContractSigned: d.contractSigned,
          confirmRentPaid: d.rentPaid,
          confirmDepositReceived: d.depositReceived,
          updatedAt: sql`now()`,
        })
        .where(eq(rentals.id, id))
        .returning();
      if (!row) return reply.code(404).send({ error: "not found" });

      // Автосоздаём платёж по аренде (если ещё не зафиксирован и галка «получено»).
      if (d.rentPaid && !before.confirmRentPaid) {
        const [hasRent] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.rentalId, id), eq(payments.type, "rent")))
          .limit(1);
        if (!hasRent) {
          await db.insert(payments).values({
            rentalId: id,
            type: "rent",
            amount: row.sum,
            method: row.paymentMethod,
            paid: true,
            paidAt: new Date(),
            note: "оплата аренды (подтверждена при выдаче)",
          });
        }
      }
      // Залог (если денежный и галка «залог получен»)
      if (
        d.depositReceived &&
        !before.confirmDepositReceived &&
        row.deposit > 0 &&
        !row.depositItem
      ) {
        const [hasDep] = await db
          .select({ id: payments.id })
          .from(payments)
          .where(and(eq(payments.rentalId, id), eq(payments.type, "deposit")))
          .limit(1);
        if (!hasDep) {
          await db.insert(payments).values({
            rentalId: id,
            type: "deposit",
            amount: row.deposit,
            method: row.paymentMethod,
            paid: true,
            paidAt: new Date(),
            note: "залог (получен при выдаче)",
          });
        }
      }

      const summary = await summaryForRental(id);
      const missing: string[] = [];
      if (!d.contractSigned) missing.push("договор не подписан");
      if (!d.rentPaid) missing.push("сумма аренды не получена");
      if (!d.depositReceived) missing.push("залог не получен");

      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "confirmed_payment",
        summary:
          missing.length === 0
            ? `Подтверждена выдача аренды ${summary}: договор подписан, аренда оплачена, залог получен`
            : `Подтверждена выдача аренды ${summary} с замечаниями: ${missing.join(", ")}`,
        meta: {
          contractSigned: d.contractSigned,
          rentPaid: d.rentPaid,
          depositReceived: d.depositReceived,
        },
      });

      // Если что-то «дозакрыли» позже подтверждения — отдельные записи
      if (
        before.paymentConfirmedAt &&
        before.confirmContractSigned === false &&
        d.contractSigned
      ) {
        await logActivity(req, {
          entity: "rental",
          entityId: id,
          action: "contract_signed_later",
          summary: `По аренде ${summary} довезли подписанный договор`,
        });
      }
      if (
        before.paymentConfirmedAt &&
        before.confirmRentPaid === false &&
        d.rentPaid
      ) {
        await logActivity(req, {
          entity: "rental",
          entityId: id,
          action: "rent_paid_later",
          summary: `По аренде ${summary} поступила оплата аренды`,
        });
      }
      if (
        before.paymentConfirmedAt &&
        before.confirmDepositReceived === false &&
        d.depositReceived
      ) {
        await logActivity(req, {
          entity: "rental",
          entityId: id,
          action: "deposit_received_later",
          summary: `По аренде ${summary} получен залог`,
        });
      }

      return row;
    },
  );
}
