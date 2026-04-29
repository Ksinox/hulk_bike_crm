import type { FastifyInstance } from "fastify";
import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  activityLog,
  clients,
  payments,
  rentals,
  returnInspections,
  scooters,
  scooterModels,
  scooterSwaps,
  users as usersTable,
} from "../db/schema.js";

/**
 * Возвращает ставку модели за период аренды. Используется при свапе
 * на другую модель чтобы посчитать доплату.
 */
function pickRateByPeriod(
  model: typeof scooterModels.$inferSelect,
  period: "short" | "week" | "month",
): number | null {
  if (period === "short") return model.shortRate ?? model.dayRate ?? null;
  if (period === "week") return model.weekRate ?? null;
  if (period === "month") return model.monthRate ?? null;
  return null;
}
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
  "problem",
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
    startAt: z.string().optional(),
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
  // Основной список — без архива.
  app.get("/", async () => {
    const rows = await db
      .select()
      .from(rentals)
      .where(isNull(rentals.archivedAt))
      .orderBy(desc(rentals.id));
    return { items: rows };
  });

  /**
   * Список архива — удалённые аренды. Видны для истории клиента,
   * могут быть восстановлены директором/создателем.
   */
  app.get("/archived", async () => {
    const rows = await db
      .select()
      .from(rentals)
      .where(isNotNull(rentals.archivedAt))
      .orderBy(desc(rentals.archivedAt));
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

    // Аренда в статусе «выдана» обязана иметь скутер. Иначе в системе
    // появляются «призраки» — аренды без скутера, которые раздувают
    // счётчик «активных» и не имеют физического смысла.
    const issuedStatuses = new Set(["active", "overdue", "returning"]);
    if (d.status && issuedStatuses.has(d.status) && !d.scooterId) {
      return reply.code(400).send({
        error: "scooter_required",
        message: "Для аренды в статусе «выдана» обязателен скутер.",
      });
    }

    // Блокируем выдачу скутера, по которому уже есть открытая аренда.
    // Открытая = active / overdue / returning. Скутер занят, пока возврат
    // не подтверждён — иначе один скутер окажется одновременно у двух
    // клиентов в учёте, и парк-метрики будут врать.
    if (d.scooterId) {
      const openRentals = await db
        .select({ id: rentals.id, status: rentals.status })
        .from(rentals)
        .where(
          and(
            eq(rentals.scooterId, d.scooterId),
            sql`${rentals.status} IN ('active', 'overdue', 'returning')`,
          ),
        );
      if (openRentals.length > 0) {
        const r = openRentals[0]!;
        return reply.code(409).send({
          error: "scooter_busy",
          message: `Скутер ещё в открытой аренде #${String(r.id).padStart(4, "0")} (${rentalStatusLabel(r.status)}). Сначала закройте её.`,
          rentalId: r.id,
          rentalStatus: r.status,
        });
      }
    }

    const initialStatus = d.status ?? "new_request";
    const [row] = await db
      .insert(rentals)
      .values({
        clientId: d.clientId,
        scooterId: d.scooterId ?? null,
        parentRentalId: d.parentRentalId ?? null,
        status: initialStatus,
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

    // Авто-платёж за аренду: если статус сразу «выдана» (active/overdue/
    // returning), значит клиент уже оплатил при выдаче — фиксируем платёж
    // как paid. Раньше платёж создавался отдельным шагом «Подтвердить
    // оплату», но этот функционал убран по решению заказчика: «если
    // аренда есть — значит оплачена».
    const issued = ["active", "overdue", "returning"].includes(initialStatus);
    if (issued && row.sum > 0) {
      await db.insert(payments).values({
        rentalId: row.id,
        type: "rent",
        amount: row.sum,
        method: row.paymentMethod,
        paid: true,
        paidAt: new Date(),
        note: "оплата аренды (автоматически при создании)",
      });
    }

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
    if (parsed.data.startAt)
      patch.startAt = new Date(parsed.data.startAt);
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

    // Синхронизация платежа аренды: если в PATCH пришла новая sum
    // и она отличается от старой — обновляем связанный платёж rent
    // (или создаём новый если был оплачен ранее, а сейчас нет).
    // Без этого «За всё время» в карточке остаётся со старой суммой,
    // и сумма «прибавляется» вместо пересчёта.
    if (
      parsed.data.sum !== undefined &&
      parsed.data.sum !== before.sum
    ) {
      const existingRent = await db
        .select()
        .from(payments)
        .where(and(eq(payments.rentalId, id), eq(payments.type, "rent")));
      if (existingRent.length > 0) {
        // Обновляем самый ранний rent-платёж (обычно он один на аренду).
        const target = existingRent[0]!;
        await db
          .update(payments)
          .set({ amount: parsed.data.sum })
          .where(eq(payments.id, target.id));
      } else if (parsed.data.sum > 0) {
        // Платежа не было — создадим, если статус активен/завершён.
        const activeStatuses = ["active", "overdue", "returning", "completed"];
        if (activeStatuses.includes(row.status)) {
          await db.insert(payments).values({
            rentalId: id,
            type: "rent",
            amount: parsed.data.sum,
            method: row.paymentMethod ?? "cash",
            paid: true,
            paidAt: new Date(),
          });
        }
      }
    }

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

  /**
   * DELETE /api/rentals/:id
   * Soft-delete: аренда уходит в архив (archivedAt = now()).
   * История клиента и платежи сохраняются, но в основных списках
   * аренда не показывается. Восстановить можно через POST /:id/unarchive.
   *
   * Доступно только creator/director. Удаляется ВНЕ ЗАВИСИМОСТИ от статуса
   * аренды — это сознательное решение заказчика, ответственность за
   * корректность учёта на нём. Активная аренда удалится тоже.
   */
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    if (req.user.role !== "creator" && req.user.role !== "director") {
      return reply.code(403).send({ error: "forbidden" });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

    const [row] = await db.select().from(rentals).where(eq(rentals.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.archivedAt) {
      return reply.code(409).send({ error: "already_archived" });
    }

    const [u] = await db
      .select({ name: usersTable.name })
      .from(usersTable)
      .where(eq(usersTable.id, req.user.userId));
    const by = u?.name ?? "система";
    // Сшиваем цепочку: дети удаляемой связки переподцепляются к её
    // родителю. Иначе при удалении mid-chain потомки осиротеют —
    // getRentalChainIds их потеряет, цепочка разорвётся.
    await db
      .update(rentals)
      .set({ parentRentalId: row.parentRentalId, updatedAt: sql`now()` })
      .where(eq(rentals.parentRentalId, id));
    await db
      .update(rentals)
      .set({ archivedAt: sql`now()`, archivedBy: by })
      .where(eq(rentals.id, id));

    await logActivity(req, {
      entity: "rental",
      entityId: id,
      action: "archived",
      summary: `Аренда #${String(id).padStart(4, "0")} перемещена в архив`,
    });
    return reply.code(204).send();
  });

  /**
   * POST /api/rentals/:id/reset-chain
   *
   * Жёсткая «очистка» аренды — оставляет в цепочке только корневую
   * (базовую) связку, физически удаляет всех её потомков (продления и
   * замены) вместе с платежами, инспекциями возврата, swap-записями
   * и activity_log. Корень разархивируется и status сбрасывается в
   * active. Используется когда оператор перенакручивал замены/продления
   * и хочет вернуться к чистому состоянию.
   *
   * Доступ — только creator. Операция необратима.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/reset-chain",
    async (req, reply) => {
      if (req.user.role !== "creator") {
        return reply.code(403).send({ error: "creator_only" });
      }
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });

      const [start] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, id));
      if (!start) return reply.code(404).send({ error: "not found" });

      // Поднимаемся к корню цепочки (обходим parentRentalId до конца).
      // Защита от циклов через лимит итераций — на проде ситуация
      // невозможна, но если БД повреждена не висим вечно.
      let rootId = start.id;
      let parentId = start.parentRentalId;
      let safety = 100;
      while (parentId != null && safety-- > 0) {
        const [parent] = await db
          .select()
          .from(rentals)
          .where(eq(rentals.id, parentId));
        if (!parent) break;
        rootId = parent.id;
        parentId = parent.parentRentalId;
      }

      // BFS вниз — собираем все id потомков корня.
      const allIds: number[] = [rootId];
      const queue: number[] = [rootId];
      while (queue.length > 0) {
        const head = queue.shift()!;
        const kids = await db
          .select({ id: rentals.id })
          .from(rentals)
          .where(eq(rentals.parentRentalId, head));
        for (const k of kids) {
          allIds.push(k.id);
          queue.push(k.id);
        }
      }
      const descendantIds = allIds.filter((x) => x !== rootId);

      // Чистим всё что висит на потомках (и на корне — activity_log).
      const inList = (ids: number[]) =>
        sql.join(
          ids.map((x) => sql`${x}`),
          sql`, `,
        );
      for (const rid of allIds) {
        await db
          .delete(activityLog)
          .where(
            and(
              eq(activityLog.entity, "rental"),
              eq(activityLog.entityId, rid),
            ),
          );
      }
      if (descendantIds.length > 0) {
        await db
          .delete(payments)
          .where(sql`${payments.rentalId} IN (${inList(descendantIds)})`);
        await db
          .delete(returnInspections)
          .where(sql`${returnInspections.rentalId} IN (${inList(descendantIds)})`);
        await db
          .delete(scooterSwaps)
          .where(sql`${scooterSwaps.rentalId} IN (${inList(descendantIds)})`);
        await db
          .delete(rentals)
          .where(sql`${rentals.id} IN (${inList(descendantIds)})`);
      }
      // swap-записи самого корня тоже стираем — историю замен сбрасываем.
      await db.delete(scooterSwaps).where(eq(scooterSwaps.rentalId, rootId));
      // Корень — разархивируем и возвращаем в active.
      await db
        .update(rentals)
        .set({
          archivedAt: null,
          archivedBy: null,
          endActualAt: null,
          status: "active",
          updatedAt: sql`now()`,
        })
        .where(eq(rentals.id, rootId));

      await logActivity(req, {
        entity: "rental",
        entityId: rootId,
        action: "chain_reset",
        summary: `Сброс цепочки аренды #${String(rootId).padStart(4, "0")} — удалено связок: ${descendantIds.length}`,
        meta: { removedRentalIds: descendantIds },
      });

      return reply.code(200).send({ rootId, removed: descendantIds.length });
    },
  );

  /**
   * POST /api/rentals/:id/unarchive — вернуть аренду из архива.
   * Сбрасывает archivedAt/archivedBy.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/unarchive",
    async (req, reply) => {
      if (req.user.role !== "creator" && req.user.role !== "director") {
        return reply.code(403).send({ error: "forbidden" });
      }
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });

      const [row] = await db
        .update(rentals)
        .set({ archivedAt: null, archivedBy: null })
        .where(and(eq(rentals.id, id), isNotNull(rentals.archivedAt)))
        .returning();
      if (!row)
        return reply
          .code(404)
          .send({ error: "not found or not archived" });

      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "unarchived",
        summary: `Аренда #${String(id).padStart(4, "0")} восстановлена из архива`,
      });
      return row;
    },
  );

  /**
   * DELETE /api/rentals/:id/purge — ХАРДКОРНОЕ физическое удаление.
   * Только для creator. Удаляет аренду + все связанные платежи +
   * инспекции возврата + ВСЕ записи activity_log по этой аренде —
   * т.е. в системе не остаётся вообще никакого следа. Сам факт
   * удаления тоже НЕ логируется (по требованию заказчика).
   *
   * Операция необратимая. Использовать осознанно.
   */
  // ВАЖНО: путь /purge/:id (а не /:id/purge) — иначе Fastify radix tree
  // конфликтует с уже объявленным DELETE /:id и второй маршрут не
  // регистрируется (молча). Префикс «purge/» делает путь статичным.
  app.delete<{ Params: { id: string } }>(
    "/purge/:id",
    async (req, reply) => {
      if (req.user.role !== "creator") {
        return reply.code(403).send({ error: "creator_only" });
      }
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });

      const [row] = await db.select().from(rentals).where(eq(rentals.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });

      // Чистим в обратном порядке зависимостей:
      // 1. activity_log — все записи про эту аренду
      // 2. payments
      // 3. return_inspections
      // 4. сама аренда
      // Дочерние аренды-продления (parentRentalId = id) тоже зачищаем —
      // иначе останутся осиротевшие записи.
      const childIds = (
        await db
          .select({ id: rentals.id })
          .from(rentals)
          .where(eq(rentals.parentRentalId, id))
      ).map((c) => c.id);
      const allIds = [id, ...childIds];

      for (const rid of allIds) {
        await db
          .delete(activityLog)
          .where(
            and(
              eq(activityLog.entity, "rental"),
              eq(activityLog.entityId, rid),
            ),
          );
        await db.delete(payments).where(eq(payments.rentalId, rid));
        await db
          .delete(returnInspections)
          .where(eq(returnInspections.rentalId, rid));
      }
      // Дочерние сначала (FK), потом сама
      if (childIds.length > 0) {
        await db
          .delete(rentals)
          .where(
            sql`${rentals.id} IN (${sql.join(
              childIds.map((c) => sql`${c}`),
              sql`, `,
            )})`,
          );
      }
      await db.delete(rentals).where(eq(rentals.id, id));

      // Сознательно НЕ пишем activity_log про purge — заказчик попросил
      // «нигде инфа не запишется».
      return reply.code(204).send();
    },
  );

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
            // Аренда без ущерба сразу уходит в архив (не засоряет
            // активный список). С ущербом — НЕ архивируется, остаётся
            // в активных как «проблемная» пока долг не будет погашен.
            archivedAt: withDamage ? null : sql`now()`,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id))
          .returning();
        if (!r) throw new Error("not found");

        // Скутер возвращается в парк аренды — становится доступным
        // для следующей аренды. Если был ущерб и нужен ремонт — оператор
        // отдельно переводит в "repair" через карточку скутера.
        if (r.scooterId) {
          await tx
            .update(scooters)
            .set({ baseStatus: "rental_pool", updatedAt: sql`now()` })
            .where(eq(scooters.id, r.scooterId));
        }

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
            // Закрытая «материнская» аренда уезжает в архив. Связь
            // (parentRentalId у потомка) сохраняется — историю не теряем.
            archivedAt: sql`now()`,
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

        // Авто-платёж за продление — продлили = оплатили (тот же подход
        // что и в POST /api/rentals: убираем шаг «подтвердить оплату»).
        if (child && child.sum > 0) {
          await tx.insert(payments).values({
            rentalId: child.id,
            type: "rent",
            amount: child.sum,
            method: child.paymentMethod,
            paid: true,
            paidAt: new Date(),
            note: "оплата продления (автоматически)",
          });
        }
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
   * POST /api/rentals/:id/swap-scooter — замена скутера на лету.
   * v0.2.75. Создаёт новую связку (parentRentalId = old.id) с другим скутером,
   * старый закрывается и архивируется (как при extend), старый скутер уходит
   * в repair. Срок аренды (endPlannedAt) сохраняется. Привязка к договору —
   * к корневой связке цепочки.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/swap-scooter",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          newScooterId: z.number().int().positive(),
          /**
           * Куда деть старый скутер — любой из 7 baseStatus (см.
           * SCOOTER_BASE_STATUS_OPTIONS на фронте). Чаще всего это
           * 'repair' (на ремонт) или 'rental_pool' (свободен), но
           * допускаем и редкие сценарии: продажа, разборка и т.д.
           */
          oldScooterStatus: z
            .enum([
              "ready",
              "rental_pool",
              "repair",
              "buyout",
              "for_sale",
              "sold",
              "disassembly",
            ])
            .default("repair"),
          /** Опциональный комментарий к причине замены. */
          reason: z.string().max(500).optional(),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const d = parsed.data;

      const result = await db.transaction(async (tx) => {
        const [old] = await tx.select().from(rentals).where(eq(rentals.id, id));
        if (!old) throw new Error("not found");
        if (old.status !== "active" && old.status !== "overdue") {
          throw new Error("rental not active");
        }
        // Проверим, что новый скутер существует и в rental_pool.
        const [newScooter] = await tx
          .select()
          .from(scooters)
          .where(eq(scooters.id, d.newScooterId));
        if (!newScooter) throw new Error("new scooter not found");
        if (newScooter.baseStatus !== "rental_pool") {
          throw new Error("new scooter not in rental_pool");
        }

        const now = new Date();
        const prevScooterId = old.scooterId;

        // === Замена in-place ===
        // Раньше создавали child rental с parentRentalId — но это плодило
        // фантомные «продления» в цепочке после каждого свапа: 9 замен
        // = 9 новых связок, расчёт долга и срока врал. Теперь меняем
        // scooterId прямо в текущей связке. История замен — в отдельной
        // таблице scooter_swaps. Условия аренды (rate, days, sum,
        // endPlannedAt) НЕ трогаем — клиент платит за тот же период.
        await tx
          .update(rentals)
          .set({ scooterId: d.newScooterId, updatedAt: sql`now()` })
          .where(eq(rentals.id, id));

        // Старый скутер — в выбранный оператором статус (rental_pool/repair).
        if (prevScooterId) {
          await tx
            .update(scooters)
            .set({ baseStatus: d.oldScooterStatus, updatedAt: sql`now()` })
            .where(eq(scooters.id, prevScooterId));
        }

        // Доплата за смену модели — если у нового скутера ставка выше.
        // Считаем по тарифу аренды и оставшимся дням до endPlannedAt.
        // Если ставки равны или новая ниже — нулевая разница, payment
        // не создаём.
        let feeAmount = 0;
        if (newScooter.modelId != null) {
          const [newModel] = await tx
            .select()
            .from(scooterModels)
            .where(eq(scooterModels.id, newScooter.modelId));
          if (newModel) {
            const newRate = pickRateByPeriod(newModel, old.tariffPeriod);
            if (newRate != null && newRate > old.rate) {
              const msLeft = old.endPlannedAt.getTime() - now.getTime();
              const daysLeft = Math.max(1, Math.ceil(msLeft / 86_400_000));
              feeAmount = (newRate - old.rate) * daysLeft;
            }
          }
        }

        // Запись в журнал замен — нужна шаблону act_swap.
        await tx.insert(scooterSwaps).values({
          rentalId: id,
          prevScooterId,
          newScooterId: d.newScooterId,
          swapAt: now,
          reason: d.reason ?? null,
          feeAmount,
          createdByUserId: req.user.userId,
        });

        // Если разница есть — выставляем доплату как payment 'swap_fee',
        // не paid. Попадает в плашку «Долг» через chainPayments.
        if (feeAmount > 0) {
          await tx.insert(payments).values({
            rentalId: id,
            type: "swap_fee",
            amount: feeAmount,
            method: old.paymentMethod,
            paid: false,
            note: d.reason
              ? `доплата за замену модели: ${d.reason}`
              : `доплата за замену модели`,
          });
        }

        // Note аренды — для отображения в карточке.
        await tx
          .update(rentals)
          .set({
            note: d.reason
              ? `замена скутера: ${d.reason}`
              : `замена скутера`,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id));

        return { rentalId: id, feeAmount };
      });

      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "scooter_swapped",
        summary: `Замена скутера в аренде #${String(id).padStart(4, "0")}${result.feeAmount > 0 ? ` (доплата ${result.feeAmount} ₽)` : ""}`,
        meta: { newScooterId: d.newScooterId, feeAmount: result.feeAmount },
      });

      // Возвращаем актуальную аренду — фронту удобно показать обновлённый
      // scooterId без отдельного refetch.
      const [updated] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, id));
      return reply.code(200).send(updated);
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
