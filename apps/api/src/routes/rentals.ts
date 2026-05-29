import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  activityLog,
  clients,
  damageReports,
  damageReportItems,
  debtEntries,
  parkingSessions,
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
import type { DiffPayload } from "../services/activityLog.js";
import { rentalStatusLabel } from "../services/activityMessages.js";

const RentalStatusEnum = z.enum(["active", "completed"]);

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
    /** v0.4.25: 'day' (default) или 'week' — единица измерения ставки. */
    rateUnit: z.enum(["day", "week"]).optional(),
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
    note: z.string().optional().nullable(),
    rate: z.number().int().positive().optional(),
    rateUnit: z.enum(["day", "week"]).optional(),
    days: z.number().int().positive().optional(),
    sum: z.number().int().min(0).optional(),
    deposit: z.number().int().min(0).optional(),
    depositItem: z.string().max(200).nullable().optional(),
    equipmentJson: z.array(EquipmentJsonItem).optional(),
  })
  .strict();

// v0.6.1: scooterNextStatus — выбор оператора что делать со скутером после
// завершения. Если не задан — старое поведение (rental_pool). Допустимые
// варианты соответствуют scooterBaseStatusEnum (не все — `ready` и `sold`
// для /complete нерелевантны).
const SCOOTER_NEXT_STATUSES = [
  "rental_pool",
  "repair",
  "for_sale",
  "disassembly",
  "buyout",
] as const;

const CompleteBody = z
  .object({
    dateActual: z.string(), // YYYY-MM-DD
    conditionOk: z.boolean(),
    equipmentOk: z.boolean(),
    depositReturned: z.boolean(),
    damageAmount: z.number().int().min(0).optional(),
    damageNotes: z.string().optional().nullable(),
    mileageAtReturn: z.number().int().min(0).optional(),
    scooterNextStatus: z.enum(SCOOTER_NEXT_STATUSES).optional(),
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

/**
 * v0.4.38: финансово-чувствительные endpoint'ы (списания/прощения долгов,
 * приёмы оплат, нормализация статуса, удаление debt-entry, смена скутера
 * с доплатой) недоступны механику. Mechanic — это парень в гараже,
 * деньги клиента ему трогать нельзя. creator/director/admin/accountant
 * проходят. Возвращает true если роль OK, иначе шлёт 403 и возвращает false.
 */
function assertFinancialRole(
  req: { user?: { role?: string } },
  reply: { code: (n: number) => { send: (b: unknown) => unknown } },
): boolean {
  const role = req.user?.role;
  if (role && role !== "mechanic") return true;
  reply.code(403).send({
    error: "forbidden",
    message: "Эта операция недоступна механику. Обратитесь к директору.",
  });
  return false;
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
    // v0.4.18: возвращаем ВСЕ архивные (archivedAt IS NOT NULL),
    // независимо от status. Фильтрация по статусу для отображения
    // во вкладке «Архив» переехала на фронт (rentalsStore.useArchivedRentals).
    //
    // Раньше на бэке резался WHERE status IN (completed, ...). Из-за этого
    // если аренда была удалена с нестандартным статусом (например
    // 'returning') — она не возвращалась в API, но её платежи всё равно
    // считались в выручке и в списке RevenueRentalsList показывались
    // как «— · —» (rental не найден в массиве). Двойная фильтрация
    // здесь не нужна — фронт сам решает что показывать в каждом UI-месте.
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
    const issuedStatuses = new Set(["active"]);
    if (d.status && issuedStatuses.has(d.status) && !d.scooterId) {
      return reply.code(400).send({
        error: "scooter_required",
        message: "Для аренды в статусе «выдана» обязателен скутер.",
      });
    }

    // Блокируем выдачу скутера, по которому уже есть открытая аренда.
    // Открытая = active / overdue / returning + archived_at IS NULL.
    // v0.4.44: добавлен фильтр archived_at IS NULL — иначе старые
    // архивные записи со status='active' (legacy до v0.4.36) ложно
    // блокировали выдачу свободного скутера.
    if (d.scooterId) {
      const openRentals = await db
        .select({ id: rentals.id, status: rentals.status })
        .from(rentals)
        .where(
          and(
            eq(rentals.scooterId, d.scooterId),
            sql`${rentals.status} = 'active'`,
            isNull(rentals.archivedAt),
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

    const initialStatus = d.status ?? "active";
    // v0.4.60: snapshot пробега скутера на момент выдачи. Используется
    // в шаблонах актов выдачи через {rental.mileageAtStart} — иначе
    // {scooter.mileage} рендерил бы live-значение, которое после
    // возврата уже изменено и не соответствует моменту выдачи.
    let scooterMileageSnapshot: number | null = null;
    if (d.scooterId) {
      const [s] = await db
        .select({ mileage: scooters.mileage })
        .from(scooters)
        .where(eq(scooters.id, d.scooterId));
      scooterMileageSnapshot = s?.mileage ?? null;
    }
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
        rateUnit: d.rateUnit ?? "day",
        deposit: d.deposit ?? 2000,
        // v0.4.49: snapshot для проверки «нужно ли пополнить залог».
        // Любое списание уменьшает deposit, depositOriginal — константа
        // на момент выдачи. Если depositItem — оригинал не нужен.
        depositOriginal:
          d.depositItem ? 0 : (d.deposit ?? 2000),
        depositItem: d.depositItem ?? null,
        startAt: new Date(d.startAt),
        endPlannedAt: new Date(d.endPlannedAt),
        days: d.days,
        sum: d.sum,
        paymentMethod: d.paymentMethod,
        equipment: d.equipment ?? [],
        equipmentJson: (d.equipmentJson ?? []) as unknown as object,
        mileageAtStart: scooterMileageSnapshot,
        note: d.note ?? null,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    // Авто-платёж за аренду: если статус сразу «выдана» (active/overdue/
    // returning), значит клиент уже оплатил при выдаче — фиксируем платёж
    // как paid. Раньше платёж создавался отдельным шагом «Подтвердить
    // оплату», но этот функционал убран по решению заказчика: «если
    // аренда есть — значит оплачена».
    const issued = initialStatus === "active";
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

    // v0.4.36: whitelist переходов статуса. Через generic PATCH /:id
    // нельзя загнать аренду в произвольный статус — это плодит баги
    // вроде «police-аренда без police-логики», «completed без архива».
    // Допустимые переходы:
    //   active ↔ overdue (sync со scheduler)
    //   active/overdue → returning → completed/completed_damage
    //   * → cancelled (отмена с любого живого статуса)
    //   problem ↔ active (resume-damage / normalize-status)
    //   police/court → active/overdue/completed (revert/return)
    //   completed_damage → completed/active (нормализация после
    //   погашения долга)
    // Финальные статусы (completed, cancelled) трогать через PATCH
    // вообще нельзя — это история.
    if (parsed.data.status && parsed.data.status !== before.status) {
      const allowed: Partial<Record<string, string[]>> = {
        active: ["completed"],
        completed: [],
      };
      const ok = allowed[before.status]?.includes(parsed.data.status);
      if (!ok) {
        return reply.code(409).send({
          error: "invalid_status_transition",
          from: before.status,
          to: parsed.data.status,
          message: `Переход ${before.status} → ${parsed.data.status} запрещён через PATCH. Используйте специализированный endpoint.`,
        });
      }
    }

    // v0.2.97: запрет переназначить аренду на скутер у которого уже есть
    // открытая аренда. Раньше POST /rentals защищался, а PATCH — нет,
    // что плодило дубли «две active аренды на одном скутере». Если
    // оператор хочет именно подменить скутер активной аренды — для этого
    // есть отдельный POST /:id/swap-scooter (с правильной транзакцией).
    if (
      parsed.data.scooterId !== undefined &&
      parsed.data.scooterId !== null &&
      parsed.data.scooterId !== before.scooterId
    ) {
      const targetScooterId = parsed.data.scooterId;
      // v0.4.44: добавлен фильтр archived_at IS NULL — см. комментарий
      // в POST /. Архивные записи не должны блокировать переназначение.
      const conflict = await db
        .select({ id: rentals.id, status: rentals.status })
        .from(rentals)
        .where(
          and(
            eq(rentals.scooterId, targetScooterId),
            sql`${rentals.id} <> ${id}`,
            sql`${rentals.status} = 'active'`,
            isNull(rentals.archivedAt),
          ),
        );
      if (conflict.length > 0) {
        const r = conflict[0]!;
        return reply.code(409).send({
          error: "scooter_busy",
          message: `Скутер уже в открытой аренде (#${r.id}, статус ${r.status}). Сначала закройте её или используйте «Заменить скутер».`,
          rentalId: r.id,
        });
      }
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.startAt)
      patch.startAt = new Date(parsed.data.startAt);
    if (parsed.data.endPlannedAt)
      patch.endPlannedAt = new Date(parsed.data.endPlannedAt);
    if (parsed.data.endActualAt)
      patch.endActualAt = new Date(parsed.data.endActualAt);
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
        const activeStatuses = ["active", "completed"];
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
      // v0.7.16: собираем структурированный diff изменённых полей, чтобы
      // в ленте показывать «Тариф: 500 → 600 ₽», «Дата возврата: …» и т.п.
      const editDiff: DiffPayload = {};
      const dateOnly = (v: unknown): string | null =>
        v ? new Date(v as string).toISOString().slice(0, 10) : null;
      if (parsed.data.rate !== undefined && parsed.data.rate !== before.rate) {
        editDiff.rate = {
          label: "Тариф",
          from: before.rate,
          to: parsed.data.rate,
          kind: "money",
        };
      }
      if (parsed.data.sum !== undefined && parsed.data.sum !== before.sum) {
        editDiff.sum = {
          label: "Сумма аренды",
          from: before.sum,
          to: parsed.data.sum,
          kind: "money",
        };
      }
      if (parsed.data.days !== undefined && parsed.data.days !== before.days) {
        editDiff.days = {
          label: "Срок",
          from: before.days,
          to: parsed.data.days,
          kind: "number",
          suffix: "дн",
        };
      }
      if (parsed.data.deposit !== undefined && parsed.data.deposit !== before.deposit) {
        editDiff.deposit = {
          label: "Залог",
          from: before.deposit,
          to: parsed.data.deposit,
          kind: "money",
        };
      }
      if (
        parsed.data.endPlannedAt !== undefined &&
        dateOnly(parsed.data.endPlannedAt) !==
          dateOnly(before.endPlannedAt as unknown)
      ) {
        editDiff.endPlanned = {
          label: "Дата возврата",
          from: dateOnly(before.endPlannedAt as unknown),
          to: dateOnly(parsed.data.endPlannedAt),
          kind: "date",
        };
      }
      if (
        parsed.data.startAt !== undefined &&
        dateOnly(parsed.data.startAt) !== dateOnly(before.startAt as unknown)
      ) {
        editDiff.start = {
          label: "Дата начала",
          from: dateOnly(before.startAt as unknown),
          to: dateOnly(parsed.data.startAt),
          kind: "date",
        };
      }
      if (
        parsed.data.depositItem !== undefined &&
        (parsed.data.depositItem ?? "") !== (before.depositItem ?? "")
      ) {
        editDiff.depositItem = {
          label: "Залог-предмет",
          from: before.depositItem ?? "—",
          to: parsed.data.depositItem ?? "—",
          kind: "text",
        };
      }
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "updated",
        summary: `Отредактирована аренда ${summary}`,
        ...(Object.keys(editDiff).length > 0 ? { diff: editDiff } : {}),
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
    // Различаем «уже удалена вручную» (archivedBy != null) и «авто-архив»
    // (archivedAt != null, archivedBy == null — связка ушла в архив при
    // extend/swap старой архитектуры). Второе — нормальная связка цепочки,
    // её должно быть можно убрать из цепочки через кнопку «удалить».
    if (row.archivedBy) {
      return reply.code(409).send({ error: "already_archived" });
    }

    // v0.4.36: блокируем soft-delete если по аренде остался непогашенный
    // долг по ущербу или открытый damage_report без agreement. Иначе
    // оператор «архивирует» аренду — в дашборде долг исчезает, но акт
    // ущерба остаётся в БД и потом всплывает рассинхрон. Если нужно
    // правда снести вместе с долгом — есть hard-delete /purge/:id.
    const damageRows = await db
      .select({
        id: damageReports.id,
        total: damageReports.total,
        depositCovered: damageReports.depositCovered,
        clientAgreement: damageReports.clientAgreement,
      })
      .from(damageReports)
      .where(eq(damageReports.rentalId, id));
    if (damageRows.length > 0) {
      // Открытый акт ущерба (pending — клиент ещё не отреагировал)
      // блокирует удаление сам по себе.
      const pending = damageRows.filter((d) => d.clientAgreement === "pending");
      if (pending.length > 0) {
        return reply.code(409).send({
          error: "damage_pending",
          message:
            "По аренде есть акт ущерба без реакции клиента — закройте его (согласен/не согласен) перед удалением",
        });
      }
      // Считаем непогашенный долг по ущербу.
      const damagePaid = await db
        .select({
          amount: payments.amount,
          damageReportId: payments.damageReportId,
        })
        .from(payments)
        .where(
          sql`${payments.rentalId} = ${id} AND ${payments.type} = 'damage' AND ${payments.paid} = true`,
        );
      const paidByReport = new Map<number, number>();
      let unassigned = 0;
      for (const p of damagePaid) {
        if (p.damageReportId != null) {
          paidByReport.set(
            p.damageReportId,
            (paidByReport.get(p.damageReportId) ?? 0) + (p.amount ?? 0),
          );
        } else {
          unassigned += p.amount ?? 0;
        }
      }
      const debt = damageRows.reduce((s, d) => {
        const reportPaid = paidByReport.get(d.id) ?? 0;
        const myDebt = Math.max(
          0,
          (d.total ?? 0) - (d.depositCovered ?? 0) - reportPaid,
        );
        return s + myDebt;
      }, 0);
      const totalDebt = Math.max(0, debt - unassigned);
      if (totalDebt > 0) {
        return reply.code(409).send({
          error: "damage_debt",
          message: `По аренде висит непогашенный долг по ущербу ${totalDebt} ₽. Закройте долг или используйте /purge для физического удаления`,
          debt: totalDebt,
        });
      }
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
    // v0.4.36: при ручной архивации live-аренды (active/overdue/returning/
    // new_request/meeting/problem) принудительно ставим статус
    // 'cancelled' — иначе нарушается инвариант «archived ⇒ status ∈
    // {completed, cancelled, completed_damage}». Без этого аренда с
    // archivedAt + status='active' путала фильтры и отчёты.
    // v0.4.37: симметрия с /complete — блокируем DELETE при unpaid
    // swap_fee/fine. Иначе оператор обходит блокировку, нажав «удалить»
    // вместо «завершить» — долг улетает в архив с висящими платежами.
    const unpaidExtras = await db
      .select({ id: payments.id, type: payments.type, amount: payments.amount })
      .from(payments)
      .where(
        sql`${payments.rentalId} = ${id} AND ${payments.paid} = false AND ${payments.type} IN ('swap_fee', 'fine')`,
      );
    if (unpaidExtras.length > 0) {
      const total = unpaidExtras.reduce((s, p) => s + (p.amount ?? 0), 0);
      return reply.code(409).send({
        error: "unpaid_extras",
        message: `По аренде висят неоплаченные ${unpaidExtras.map((p) => p.type).join(", ")} платежи на ${total} ₽. Закройте перед архивацией.`,
        unpaid: unpaidExtras,
      });
    }

    const wasLive = row.status === "active";
    const nextStatus: "active" | "completed" = wasLive ? "completed" : row.status;
    await db
      .update(rentals)
      .set({
        archivedAt: sql`now()`,
        archivedBy: by,
        status: nextStatus,
        updatedAt: sql`now()`,
      })
      .where(eq(rentals.id, id));
    // v0.4.37: при cancel живой аренды освобождаем скутер (rental_pool).
    // Иначе скутер остаётся «занятым», в парке не показывается как
    // готовый к выдаче, а оператор не может его выдать новому клиенту.
    if (wasLive && row.scooterId) {
      await db
        .update(scooters)
        .set({ baseStatus: "rental_pool", updatedAt: sql`now()` })
        .where(eq(scooters.id, row.scooterId));
    }

    // Если удаляемая связка БЫЛА «головой» цепочки (т.е. больше не было
    // потомков) и у неё есть родитель, который ушёл в архив автоматически
    // (archivedBy == null — авто-архив при extend / legacy swap) — нужно
    // его возродить. Иначе после удаления head у пользователя в active
    // нет ни одной связки этой аренды, и карточка «пропадает». Бизнес-
    // логика: если новая связка отменена, старая снова становится head.
    //
    // ВАЖНО: возрождать родителя ИМЕЕТ СМЫСЛ только если в цепочке
    // вообще не осталось ни одной active-связки (archivedAt IS NULL).
    // Иначе bulk-delete нескольких head'ов подряд возродит сразу
    // несколько предков → у клиента появятся 2-3 active-аренды в одной
    // серии, что нарушает инвариант «одна active на цепочку».
    const hadChildren = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.parentRentalId, id));
    if (hadChildren.length === 0 && row.parentRentalId != null) {
      // Поднимаемся к корню цепочки.
      let rootId = id;
      let parentCursor: number | null = row.parentRentalId;
      let safety = 100;
      while (parentCursor != null && safety-- > 0) {
        const [p] = await db
          .select()
          .from(rentals)
          .where(eq(rentals.id, parentCursor));
        if (!p) break;
        rootId = p.id;
        parentCursor = p.parentRentalId;
      }
      // BFS вниз по дереву, собираем все id цепочки.
      const chainIds = new Set<number>([rootId]);
      const queue: number[] = [rootId];
      while (queue.length > 0) {
        const cur = queue.shift()!;
        const kids = await db
          .select({ id: rentals.id })
          .from(rentals)
          .where(eq(rentals.parentRentalId, cur));
        for (const k of kids) {
          if (!chainIds.has(k.id)) {
            chainIds.add(k.id);
            queue.push(k.id);
          }
        }
      }
      // Есть ли в цепочке (кроме самой удаляемой) хоть одна active-связка?
      const otherIds = [...chainIds].filter((cid) => cid !== id);
      let hasOtherActive = false;
      if (otherIds.length > 0) {
        const otherActive = await db
          .select({ id: rentals.id })
          .from(rentals)
          .where(
            and(
              sql`${rentals.id} IN (${sql.join(
                otherIds.map((x) => sql`${x}`),
                sql`, `,
              )})`,
              isNull(rentals.archivedAt),
            ),
          );
        hasOtherActive = otherActive.length > 0;
      }
      if (!hasOtherActive) {
        const [parent] = await db
          .select()
          .from(rentals)
          .where(eq(rentals.id, row.parentRentalId));
        if (parent && parent.archivedBy == null && parent.archivedAt != null) {
          // v0.5: всегда возрождаем как 'active' — просрочка теперь
          // computed на фронте через effectiveRentalStatus().
          const reborn: "active" = "active";
          // v0.4.38: проверяем что скутер родителя не занят другой
          // активной арендой (через swap-scooter он мог уйти к другой
          // аренде). Если занят — отвязываем (scooterId=null), оператор
          // подберёт новый через UI. Иначе будет инвариант-bust:
          // две live-аренды на одном скутере.
          let parentScooterId: number | null = parent.scooterId ?? null;
          if (parentScooterId != null) {
            const otherOpen = await db
              .select({ id: rentals.id })
              .from(rentals)
              .where(
                and(
                  eq(rentals.scooterId, parentScooterId),
                  sql`${rentals.id} <> ${parent.id}`,
                  sql`${rentals.status} = 'active'`,
                  isNull(rentals.archivedAt),
                ),
              );
            if (otherOpen.length > 0) {
              parentScooterId = null;
            }
          }
          await db
            .update(rentals)
            .set({
              archivedAt: null,
              endActualAt: null,
              status: reborn,
              scooterId: parentScooterId,
              updatedAt: sql`now()`,
            })
            .where(eq(rentals.id, parent.id));
        }
      }
    }

    await logActivity(req, {
      entity: "rental",
      entityId: id,
      action: "archived",
      summary: `Аренда #${String(id).padStart(4, "0")} перемещена в архив`,
    });
    return reply.code(204).send();
  });

  /**
   * DELETE /api/rentals/scooter-swaps/:swapId — удаляет одну запись
   * замены скутера из scooter_swaps. Используется когда оператор хочет
   * почистить лишние замены вручную через «Изменить аренду». Сама
   * аренда не трогается, scooterId не возвращается на старый — просто
   * чистим историю. Доступ — creator/director.
   *
   * Путь /scooter-swaps/:swapId статичный (без /:id перед ним), чтобы
   * Fastify radix tree не путал его с DELETE /:id.
   */
  app.delete<{ Params: { swapId: string } }>(
    "/scooter-swaps/:swapId",
    async (req, reply) => {
      if (req.user.role !== "creator" && req.user.role !== "director") {
        return reply.code(403).send({ error: "forbidden" });
      }
      const sid = Number(req.params.swapId);
      if (!Number.isFinite(sid))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(scooterSwaps)
        .where(eq(scooterSwaps.id, sid));
      if (!row) return reply.code(404).send({ error: "not found" });

      // Проверяем, последняя ли это запись в истории замен этой аренды.
      // Если последняя — отменяем замену: текущий scooterId аренды
      // возвращаем на prevScooterId, текущий скутер уходит в rental_pool
      // (был в repair после свапа). Старшие записи не трогаем — пользователь
      // их удаляет как «чистку истории», физически возврат к более ранним
      // состояниям не делаем.
      const [latest] = await db
        .select({ id: scooterSwaps.id })
        .from(scooterSwaps)
        .where(eq(scooterSwaps.rentalId, row.rentalId))
        .orderBy(desc(scooterSwaps.swapAt))
        .limit(1);
      const isLatest = latest?.id === sid;
      let revertedTo: number | null = null;
      if (isLatest && row.prevScooterId != null) {
        const [rental] = await db
          .select()
          .from(rentals)
          .where(eq(rentals.id, row.rentalId));
        if (rental) {
          // Старый (текущий) скутер аренды — снова свободен.
          if (rental.scooterId != null) {
            await db
              .update(scooters)
              .set({ baseStatus: "rental_pool", updatedAt: sql`now()` })
              .where(eq(scooters.id, rental.scooterId));
          }
          // Возвращаем prev на аренду.
          await db
            .update(rentals)
            .set({
              scooterId: row.prevScooterId,
              updatedAt: sql`now()`,
            })
            .where(eq(rentals.id, row.rentalId));
          revertedTo = row.prevScooterId;
        }
      }

      // Если был payment swap_fee на эту замену — удаляем его (доплата
      // отменяется вместе с самой заменой). Привязки swap_fee→scooter_swaps
      // у нас нет, поэтому ищем последний неоплаченный swap_fee аренды.
      if (isLatest && row.feeAmount > 0) {
        const [feePayment] = await db
          .select()
          .from(payments)
          .where(
            and(
              eq(payments.rentalId, row.rentalId),
              eq(payments.type, "swap_fee"),
              eq(payments.paid, false),
            ),
          )
          .orderBy(desc(payments.createdAt))
          .limit(1);
        if (feePayment) {
          await db.delete(payments).where(eq(payments.id, feePayment.id));
        }
      }

      await db.delete(scooterSwaps).where(eq(scooterSwaps.id, sid));
      await logActivity(req, {
        entity: "rental",
        entityId: row.rentalId,
        action: "scooter_swap_deleted",
        summary: isLatest
          ? `Отменена замена в аренде #${String(row.rentalId).padStart(4, "0")} — скутер возвращён к предыдущему`
          : `Удалена запись о замене из истории #${String(row.rentalId).padStart(4, "0")}`,
        meta: {
          swapId: sid,
          prevScooterId: row.prevScooterId,
          newScooterId: row.newScooterId,
          revertedTo,
          isLatest,
        },
      });
      return reply.code(200).send({ revertedTo, isLatest });
    },
  );

  /**
   * GET /api/rentals/:id/scooter-swaps
   *
   * Возвращает историю замен скутера в этой аренде (из таблицы
   * scooter_swaps, заполняется новым in-place /swap-scooter). UI
   * вкладки «Условия» использует это для блока «Ранее в этой аренде».
   * Сортировка: от старых к новым (по swapAt).
   */
  app.get<{ Params: { id: string } }>(
    "/:id/scooter-swaps",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const rows = await db
        .select()
        .from(scooterSwaps)
        .where(eq(scooterSwaps.rentalId, id))
        .orderBy(scooterSwaps.swapAt);
      return { items: rows };
    },
  );

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

      // Чистим в обратном порядке зависимостей. v0.4.34: расширено —
      // добавили damage_reports, debt_entries и scooter_swaps. Раньше
      // покупная purge оставляла damage_reports с битым FK на rental_id
      // → /api/damage-reports начинал отдавать 500.
      //   1. activity_log — все записи про эту аренду
      //   2. damage_reports (включая damage_report.payments — каскадно через FK)
      //   3. debt_entries
      //   4. payments
      //   5. return_inspections
      //   6. scooter_swaps
      //   7. сама аренда (после дочерних — FK)
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
        await db
          .delete(damageReports)
          .where(eq(damageReports.rentalId, rid));
        await db
          .delete(debtEntries)
          .where(eq(debtEntries.rentalId, rid));
        await db.delete(payments).where(eq(payments.rentalId, rid));
        await db
          .delete(returnInspections)
          .where(eq(returnInspections.rentalId, rid));
        await db
          .delete(scooterSwaps)
          .where(eq(scooterSwaps.rentalId, rid));
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

      // v0.4.36: блокируем complete если по аренде висят неоплаченные
      // swap_fee/fine платежи. Раньше аренда уезжала в архив с долгом
      // по доплате за свап или штрафом — клиент должен, но в системе
      // запись «висит на завершённой аренде», работать с ней неудобно.
      // Если оператор хочет завершить с непогашенным платежом — его
      // нужно явно списать (forgive-overdue / debt/manual) или принять
      // (PaymentAcceptDialog), либо использовать «Закрыть с ущербом»
      // (complete с damageAmount) — тогда долг будет в damage_report.
      const unpaidExtras = await db
        .select({
          id: payments.id,
          type: payments.type,
          amount: payments.amount,
        })
        .from(payments)
        .where(
          sql`${payments.rentalId} = ${id} AND ${payments.paid} = false AND ${payments.type} IN ('swap_fee', 'fine')`,
        );
      if (unpaidExtras.length > 0) {
        const total = unpaidExtras.reduce((s, p) => s + (p.amount ?? 0), 0);
        return reply.code(409).send({
          error: "unpaid_extras",
          message: `По аренде есть неоплаченные ${unpaidExtras.map((p) => p.type).join(", ")} платежи на сумму ${total} ₽. Примите оплату или спишите перед завершением.`,
          unpaid: unpaidExtras,
        });
      }

      const result = await db.transaction(async (tx) => {
        const [r] = await tx
          .update(rentals)
          .set({
            status: "completed",
            endActualAt: new Date(`${d.dateActual}T12:00:00+03:00`),
            depositReturned: d.depositReturned,
            damageAmount: d.damageAmount ?? null,
            // v0.4.48: завершённая аренда НЕ уходит в архив сразу — она
            // получает status='completed' и остаётся видимой в фильтре
            // «Завершены». В архив попадает автоматически при наступлении
            // нового расчётного периода (через scheduler) ИЛИ вручную
            // оператором через DELETE. Раньше /complete сразу ставил
            // archivedAt=now() — оператор не мог посмотреть свежезавершённую
            // аренду в обычном списке, надо было лезть в Архив.
            // С ущербом — НЕ архивируется, остаётся как «проблемная».
            archivedAt: null,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id))
          .returning();
        if (!r) throw new Error("not found");

        // Скутер возвращается в парк аренды — становится доступным
        // для следующей аренды. Если был ущерб и нужен ремонт — оператор
        // отдельно переводит в "repair" через карточку скутера.
        // v0.4.60: при возврате обновляем пробег скутера если оператор
        // его ввёл. Логируем изменение в activity_log на сущность scooter
        // — это видно в карточке скутера и в общей ленте событий.
        let mileageBefore: number | null = null;
        let mileageAfter: number | null = null;
        if (r.scooterId) {
          // v0.6.1: оператор может выбрать что делать со скутером (ремонт/
          // продажа/разборка/выкуп/назад в парк). Если не указано — старое
          // поведение «обратно в парк».
          const nextStatus = d.scooterNextStatus ?? "rental_pool";
          const setVals: Record<string, unknown> = {
            baseStatus: nextStatus,
            updatedAt: sql`now()`,
          };
          if (
            d.mileageAtReturn != null &&
            Number.isFinite(d.mileageAtReturn) &&
            d.mileageAtReturn >= 0
          ) {
            const [s] = await tx
              .select({ mileage: scooters.mileage })
              .from(scooters)
              .where(eq(scooters.id, r.scooterId));
            mileageBefore = s?.mileage ?? 0;
            // Защита от опечатки: пробег должен только расти. Если ввели
            // меньше текущего — игнорируем (но логируем warn).
            if (d.mileageAtReturn >= mileageBefore) {
              setVals.mileage = d.mileageAtReturn;
              mileageAfter = d.mileageAtReturn;
            } else {
              mileageAfter = mileageBefore; // не меняем
            }
          }
          await tx
            .update(scooters)
            .set(setVals)
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

        // v0.5.1: при завершении с ущербом создаём полноценный
        // damage_report — раньше создавался только payment(type='damage',
        // paid=false) без damage_report, и debt-aggregator его не цеплял
        // (unassignedPaid падал в 0 потому что damageBalance считается по
        // damage_reports). Из-за этого после /complete долг по ущербу
        // не отображался — оператор завершал аренду «без видимого долга»
        // и сумма пропадала. Теперь создаётся настоящий акт с одной
        // авто-позицией; оператор позже может его отредактировать через
        // обычный DamageReportDialog и добавить позиции из прейскуранта.
        if (withDamage && d.damageAmount && d.damageAmount > 0) {
          const userId = req.user?.userId ?? null;
          const [report] = await tx
            .insert(damageReports)
            .values({
              rentalId: id,
              createdByUserId: userId,
              total: d.damageAmount,
              depositCovered: 0,
              note: d.damageNotes ?? "Ущерб зафиксирован при возврате",
            })
            .returning();
          if (report) {
            await tx.insert(damageReportItems).values({
              reportId: report.id,
              priceItemId: null,
              name: "Ущерб при возврате",
              originalPrice: d.damageAmount,
              finalPrice: d.damageAmount,
              quantity: 1,
              comment: d.damageNotes ?? null,
              sortOrder: 0,
            });
          }
        }
        // v0.4.34/v0.5: при возврате залога создаём payment(type='refund')
        // чтобы отразить выплату в учёте. Refund исключён из revenue.
        // Чеклист «depositReceived» удалён — наличие deposit-платежа
        // проверяем по payments напрямую.
        const [depPay] = await tx
          .select({ id: payments.id })
          .from(payments)
          .where(
            and(eq(payments.rentalId, id), eq(payments.type, "deposit")),
          )
          .limit(1);
        if (d.depositReturned && (r.deposit ?? 0) > 0 && depPay) {
          // Проверяем что для этой аренды нет уже созданного refund
          // (idempotent на случай повторного вызова /complete).
          const [existing] = await tx
            .select({ id: payments.id })
            .from(payments)
            .where(
              and(
                eq(payments.rentalId, id),
                eq(payments.type, "refund"),
              ),
            )
            .limit(1);
          if (!existing) {
            await tx.insert(payments).values({
              rentalId: id,
              type: "refund",
              amount: r.deposit,
              method: "cash",
              paid: true,
              paidAt: new Date(),
              note: "Залог возвращён клиенту при сдаче",
            });
          }
        }
        return {
          rental: r,
          scooterId: r.scooterId,
          mileageBefore,
          mileageAfter,
        };
      });

      const summary = await summaryForRental(id);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "completed",
        summary: withDamage
          ? `Завершена аренда ${summary} · зафиксирован ущерб ${(d.damageAmount ?? 0).toLocaleString("ru-RU")} ₽`
          : `Завершена аренда ${summary} · без ущерба, залог ${d.depositReturned ? "возвращён клиенту" : "удержан"}`,
        diff: {
          status: {
            label: "Статус",
            from: "active",
            to: "completed",
            kind: "text",
          },
          ...(result.mileageBefore != null && result.mileageAfter != null
            ? {
                mileage: {
                  label: "Пробег",
                  from: result.mileageBefore,
                  to: result.mileageAfter,
                  kind: "number",
                  suffix: "км",
                },
              }
            : {}),
          ...(withDamage && d.damageAmount && d.damageAmount > 0
            ? {
                damage: {
                  label: "Ущерб",
                  from: 0,
                  to: d.damageAmount,
                  kind: "money",
                },
              }
            : {}),
        },
      });
      // v0.4.60: лог изменения пробега скутера (на сущность scooter,
      // чтобы запись была видна в карточке скутера и в его таймлайне).
      if (
        result.scooterId &&
        result.mileageBefore != null &&
        result.mileageAfter != null
      ) {
        if (result.mileageAfter > result.mileageBefore) {
          await logActivity(req, {
            entity: "scooter",
            entityId: result.scooterId,
            action: "mileage_updated",
            summary: `Пробег: ${result.mileageBefore.toLocaleString("ru-RU")} → ${result.mileageAfter.toLocaleString("ru-RU")} км (+${(result.mileageAfter - result.mileageBefore).toLocaleString("ru-RU")} после аренды #${id})`,
            meta: {
              before: result.mileageBefore,
              after: result.mileageAfter,
              delta: result.mileageAfter - result.mileageBefore,
              rentalId: id,
            },
          });
        } else if (
          d.mileageAtReturn != null &&
          d.mileageAtReturn < result.mileageBefore
        ) {
          // Оператор ввёл меньше текущего — мы не обновили, но залогируем
          // факт попытки чтобы было видно при разборе.
          await logActivity(req, {
            entity: "scooter",
            entityId: result.scooterId,
            action: "mileage_skip",
            summary: `Пробег при возврате аренды #${id} (${d.mileageAtReturn.toLocaleString("ru-RU")} км) меньше текущего (${result.mileageBefore.toLocaleString("ru-RU")} км) — не обновлён`,
            meta: {
              entered: d.mileageAtReturn,
              current: result.mileageBefore,
              rentalId: id,
            },
          });
        }
      }
      return result.rental;
    },
  );

  /**
   * POST /api/rentals/:id/revert-completion
   *
   * v0.5.1: возврат завершённой аренды обратно в active. На случай если
   * оператор случайно нажал «Завершить» или клиент передумал возвращать.
   *
   * Что делает:
   *  • status='completed' → 'active'
   *  • endActualAt → null
   *  • depositReturned, damageAmount → null
   *  • archivedAt → null (если был выставлен)
   *  • удаляет return_inspections запись
   *  • удаляет refund-платежи если были созданы при /complete
   *  • скутер возвращается в 'rental_pool' (если был в этой аренде)
   *
   * НЕ трогает damage_reports — если оператор создал акт ущерба при
   * завершении, акт остаётся, его можно удалить/изменить отдельно.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/revert-completion",
    async (req, reply) => {
      if (!assertFinancialRole(req, reply)) return;
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const [rental] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, id));
      if (!rental) return reply.code(404).send({ error: "not found" });
      if (rental.status !== "completed") {
        return reply
          .code(409)
          .send({ error: "not_completed", current: rental.status });
      }
      await db.transaction(async (tx) => {
        await tx
          .update(rentals)
          .set({
            status: "active",
            endActualAt: null,
            depositReturned: null,
            damageAmount: null,
            archivedAt: null,
            archivedBy: null,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id));
        await tx
          .delete(returnInspections)
          .where(eq(returnInspections.rentalId, id));
        // Удаляем refund-платёж за возврат залога — он был создан в /complete,
        // теперь не актуален.
        await tx
          .delete(payments)
          .where(and(eq(payments.rentalId, id), eq(payments.type, "refund")));
        // Скутер обратно в rental_pool (если ещё назначен этой аренде).
        if (rental.scooterId) {
          await tx
            .update(scooters)
            .set({ baseStatus: "rental_pool", updatedAt: sql`now()` })
            .where(eq(scooters.id, rental.scooterId));
        }
      });
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "revert_completion",
        summary: `Аренда #${id} возвращена из «завершённых» в активные`,
        diff: {
          status: {
            label: "Статус",
            from: "completed",
            to: "active",
            kind: "text",
          },
        },
      });
      const [updated] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, id));
      return updated;
    },
  );

  /**
   * v0.4.57: legacy /extend перенаправлен на inplace-логику.
   *
   * Раньше /extend создавал child rental с parentRentalId — это плодило
   * дочерние записи на каждое продление, ломало UX (одну реальную аренду
   * клиент видел как несколько разных), усложняло KPI и архивацию.
   *
   * Теперь endpoint существует ТОЛЬКО ради совместимости со старым
   * фронтом (рассылка обновления desktop-клиента ещё не дошла до всех).
   * Внутри он делает то же самое, что /extend-inplace: обновляет ту же
   * запись rentals (endPlannedAt, days, sum), создаёт rent-payment.
   * Возвращает обновлённую аренду (тот же id) — старый фронт ждёт
   * объект rental в ответе, intersection с новой моделью совместима.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/extend",
    async (req, reply) => {
      if (!assertFinancialRole(req, reply)) return;
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          extraDays: z.number().int().positive(),
          newRate: z.number().int().positive(),
          newTariffPeriod: z.enum(["short", "week", "month"]),
          newRateUnit: z.enum(["day", "week"]).optional(),
          autoMarkPaid: z.boolean().optional().default(true),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const d = parsed.data;

      const result = await db.transaction(async (tx) => {
        const [old] = await tx
          .select()
          .from(rentals)
          .where(eq(rentals.id, id));
        if (!old) throw new Error("not found");

        if (old.status !== "active") {
          throw new Error(`extend_blocked_status:${old.status}`);
        }

        // Правка 3: продление учитывает дневную стоимость платной экипировки.
        const equipmentDaily = (
          (old.equipmentJson ?? []) as Array<{
            price?: number;
            free?: boolean;
          }>
        ).reduce((s, it) => s + (it.free ? 0 : it.price ?? 0), 0);

        const baseDaily = d.newRate + equipmentDaily;
        const extraSum =
          d.newRateUnit === "week"
            ? baseDaily * Math.max(1, Math.round(d.extraDays / 7))
            : baseDaily * d.extraDays;

        const newEndPlanned = new Date(
          old.endPlannedAt.getTime() + d.extraDays * 86_400_000,
        );

        const [updated] = await tx
          .update(rentals)
          .set({
            endPlannedAt: newEndPlanned,
            days: old.days + d.extraDays,
            sum: old.sum + extraSum,
            tariffPeriod: d.newTariffPeriod,
            rate: d.newRate,
            rateUnit: d.newRateUnit ?? old.rateUnit,
            status: "active" as const,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id))
          .returning();
        if (!updated) throw new Error("update failed");

        if (extraSum > 0) {
          const equipNote =
            equipmentDaily > 0
              ? ` · вкл. экипировку ${equipmentDaily} ₽/сут`
              : "";
          await tx.insert(payments).values({
            rentalId: id,
            type: "rent",
            amount: extraSum,
            method: updated.paymentMethod,
            paid: d.autoMarkPaid,
            paidAt: d.autoMarkPaid ? new Date() : null,
            note: d.autoMarkPaid
              ? `продление на ${d.extraDays} дн (оплачено)${equipNote}`
              : `продление на ${d.extraDays} дн (ожидает оплаты)${equipNote}`,
          });
        }
        return updated;
      });

      const summary = await summaryForRental(id);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "rental_extended",
        summary: `Продление аренды ${summary} на ${d.extraDays} дн (${result.rate} ₽/${result.rateUnit === "week" ? "нед" : "сут"})`,
        meta: {
          extraDays: d.extraDays,
          newRate: d.newRate,
          newRateUnit: d.newRateUnit ?? "day",
          newEndPlannedAt: result.endPlannedAt,
          legacyAlias: true,
        },
      });
      return reply.code(201).send(result);
    },
  );

  /**
   * v0.4.49: POST /api/rentals/:id/extend-inplace — продление БЕЗ chain.
   *
   * В отличие от старого /extend (который создавал child rental с
   * parentRentalId), здесь обновляется текущая аренда:
   *   endPlannedAt += extraDays
   *   days += extraDays
   *   sum += newRate × extraDays (или × недель для weekly)
   * + одна запись payment(type='rent', paid=autoMarkPaid).
   *
   * По бизнес-правке заказчика: «продление = увеличение срока той же
   * аренды, не отдельная активная сущность». Нет «запланированных»
   * аренд, нет cha. История продлений — через activity_log.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/extend-inplace",
    async (req, reply) => {
      if (!assertFinancialRole(req, reply)) return;
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          extraDays: z.number().int().positive(),
          newRate: z.number().int().positive(),
          newTariffPeriod: z.enum(["short", "week", "month"]),
          newRateUnit: z.enum(["day", "week"]).optional(),
          autoMarkPaid: z.boolean().optional().default(true),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const d = parsed.data;

      const result = await db.transaction(async (tx) => {
        const [old] = await tx
          .select()
          .from(rentals)
          .where(eq(rentals.id, id));
        if (!old) throw new Error("not found");

        if (old.status !== "active") {
          throw new Error(`extend_blocked_status:${old.status}`);
        }

        // Правка 3: продление учитывает дневную стоимость платной экипировки.
        const equipmentDaily = (
          (old.equipmentJson ?? []) as Array<{
            price?: number;
            free?: boolean;
          }>
        ).reduce((s, it) => s + (it.free ? 0 : it.price ?? 0), 0);

        const baseDaily = d.newRate + equipmentDaily;
        const extraSum =
          d.newRateUnit === "week"
            ? baseDaily * Math.max(1, Math.round(d.extraDays / 7))
            : baseDaily * d.extraDays;

        const newEndPlanned = new Date(
          old.endPlannedAt.getTime() + d.extraDays * 86_400_000,
        );

        const [updated] = await tx
          .update(rentals)
          .set({
            endPlannedAt: newEndPlanned,
            days: old.days + d.extraDays,
            sum: old.sum + extraSum,
            // tariffPeriod / rate / rateUnit — обновляем на новые значения
            // (если оператор сменил тариф для продления, считаем что
            // продлевается уже по новому до следующего изменения).
            tariffPeriod: d.newTariffPeriod,
            rate: d.newRate,
            rateUnit: d.newRateUnit ?? old.rateUnit,
            // v0.5: статус остаётся 'active'.
            status: "active" as const,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id))
          .returning();
        if (!updated) throw new Error("update failed");

        if (extraSum > 0) {
          const equipNote =
            equipmentDaily > 0
              ? ` · вкл. экипировку ${equipmentDaily} ₽/сут`
              : "";
          await tx.insert(payments).values({
            rentalId: id,
            type: "rent",
            amount: extraSum,
            method: updated.paymentMethod,
            paid: d.autoMarkPaid,
            paidAt: d.autoMarkPaid ? new Date() : null,
            note: d.autoMarkPaid
              ? `продление на ${d.extraDays} дн (оплачено)${equipNote}`
              : `продление на ${d.extraDays} дн (ожидает оплаты)${equipNote}`,
          });
        }
        return { updated, old, extraSum };
      });

      const summary = await summaryForRental(id);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "rental_extended",
        summary: `Продление аренды ${summary} на ${d.extraDays} дн (${result.updated.rate} ₽/${result.updated.rateUnit === "week" ? "нед" : "сут"})`,
        meta: {
          extraDays: d.extraDays,
          newRate: d.newRate,
          newRateUnit: d.newRateUnit ?? "day",
          newEndPlannedAt: result.updated.endPlannedAt,
        },
        diff: {
          endPlannedAt: {
            label: "Возврат",
            from: result.old.endPlannedAt.toISOString(),
            to: result.updated.endPlannedAt.toISOString(),
            kind: "date",
          },
          days: {
            label: "Дней",
            from: result.old.days,
            to: result.updated.days,
            kind: "number",
            suffix: "дн",
          },
          sum: {
            label: "Сумма аренды",
            from: result.old.sum,
            to: result.updated.sum,
            kind: "money",
          },
        },
      });
      return result.updated;
    },
  );

  /**
   * v0.4.49: POST /api/rentals/:id/security-topup — пополнение залога.
   *
   * Доступно когда rental.deposit < rental.depositOriginal (т.е. ранее
   * было списание из залога за ущерб/просрочку). Если залог — предмет
   * (depositItem != null), пополнение запрещено (нет смысла — это не
   * деньги).
   */
  app.post<{ Params: { id: string } }>(
    "/:id/security-topup",
    async (req, reply) => {
      if (!assertFinancialRole(req, reply)) return;
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          amount: z.number().int().positive(),
          method: z.enum(["cash", "transfer"]),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });

      const [rental] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, id));
      if (!rental) return reply.code(404).send({ error: "not found" });
      if (rental.depositItem) {
        return reply.code(400).send({
          error: "deposit_is_item",
          message:
            "Залог этой аренды — предмет, а не сумма. Пополнение деньгами невозможно.",
        });
      }

      const result = await db.transaction(async (tx) => {
        await tx.insert(payments).values({
          rentalId: id,
          type: "deposit",
          amount: parsed.data.amount,
          method: parsed.data.method,
          paid: true,
          paidAt: new Date(),
          note: "пополнение залога",
        });
        const newDeposit = (rental.deposit ?? 0) + parsed.data.amount;
        const newOriginal = Math.max(
          rental.depositOriginal ?? 0,
          newDeposit,
        );
        const [r] = await tx
          .update(rentals)
          .set({
            deposit: newDeposit,
            depositOriginal: newOriginal,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id))
          .returning();
        return r;
      });

      const summary = await summaryForRental(id);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "security_topped_up",
        summary: `Пополнение залога ${summary} на ${parsed.data.amount} ₽`,
        meta: {
          amount: parsed.data.amount,
          method: parsed.data.method,
          newDeposit: result?.deposit,
          newOriginal: result?.depositOriginal,
        },
        diff: {
          deposit: {
            label: "Залог",
            from: rental.deposit ?? 0,
            to: result?.deposit ?? 0,
            kind: "money",
          },
        },
      });
      return result;
    },
  );

  /**
   * v0.4.49: POST /api/rentals/:id/equipment-change — замена/удаление
   * экипировки активной аренды.
   *
   * Body: { newEquipmentJson: EquipmentJsonItem[], payNow: bool, method? }
   *
   * Считаем delta = (Σ новых price.free=false) − (Σ старых price.free=false)
   * × оставшиеся_дни_до_endPlannedAt.
   *
   *   delta > 0 → доплата.
   *     payNow=true  → payment(type='equipment_fee', paid=true)
   *     payNow=false → debt_entry(kind='manual_charge', amount=delta)
   *   delta < 0 → возврат на clients.deposit_balance (charge endpoint
   *     пополняет deposit_balance клиента на |delta|).
   *   delta = 0 → просто обновляем equipmentJson (никаких финансовых
   *     операций, например замена шлема на шлем той же цены).
   *
   * Только active/overdue/returning. На completed нельзя.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/equipment-change",
    async (req, reply) => {
      if (!assertFinancialRole(req, reply)) return;
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          newEquipmentJson: z.array(EquipmentJsonItem).default([]),
          payNow: z.boolean().default(false),
          method: z.enum(["cash", "transfer"]).optional(),
          comment: z.string().max(300).optional(),
          // Правка 1: куда возвращать разницу при удешевлении экипировки.
          refundTo: z.enum(["cash", "deposit"]).default("deposit"),
          refundMethod: z.enum(["cash", "transfer"]).optional(),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });

      const [rental] = await db
        .select()
        .from(rentals)
        .where(eq(rentals.id, id));
      if (!rental) return reply.code(404).send({ error: "not found" });
      // Правка 2: смена экипировки разрешена на любой живой аренде.
      const allowed = ["active", "overdue", "returning"];
      if (!allowed.includes(rental.status) || rental.archivedAt) {
        return reply.code(409).send({
          error: "not_editable",
          message: `Экипировка меняется только на живой аренде. Статус: ${rental.status}.`,
        });
      }

      // ===== Расчёт delta-стоимости в день =====
      const oldItems = (rental.equipmentJson ?? []) as Array<{
        price?: number;
        free?: boolean;
      }>;
      const newItems = parsed.data.newEquipmentJson;
      const sumPerDay = (
        items: Array<{ price?: number; free?: boolean }>,
      ): number =>
        items.reduce((s, it) => s + (it.free ? 0 : it.price ?? 0), 0);
      const oldDailySum = sumPerDay(oldItems);
      const newDailySum = sumPerDay(newItems);
      const dailyDelta = newDailySum - oldDailySum;

      const now = new Date();
      const endMs = rental.endPlannedAt.getTime();
      const remainingDays = Math.max(
        0,
        Math.ceil((endMs - now.getTime()) / 86_400_000),
      );
      const totalDelta = dailyDelta * remainingDays;

      const userId = req.user?.userId ?? null;
      let userName = "система";
      if (userId) {
        const [u] = await db
          .select({ name: usersTable.name })
          .from(usersTable)
          .where(eq(usersTable.id, userId));
        userName = u?.name ?? "система";
      }

      const result = await db.transaction(async (tx) => {
        // 1. Обновляем equipmentJson + equipment (legacy text array
        //    должен быть синхронизирован, иначе UI карточки рендерит
        //    стейл-данные).
        const newEquipmentNames = newItems.map((it) => it.name);
        const [updated] = await tx
          .update(rentals)
          .set({
            equipmentJson: newItems as unknown as object,
            equipment: newEquipmentNames,
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id))
          .returning();

        // 2. Финансовая часть
        if (totalDelta > 0) {
          // Доплата
          if (parsed.data.payNow) {
            if (!parsed.data.method) {
              throw new Error("method required for immediate payment");
            }
            await tx.insert(payments).values({
              rentalId: id,
              type: "equipment_fee",
              amount: totalDelta,
              method: parsed.data.method,
              paid: true,
              paidAt: new Date(),
              note: `Доплата за изменение экипировки (${remainingDays} дн × ${dailyDelta} ₽)`,
            });
          } else {
            // Висит как ручной долг — оператор примет позже через PaymentAcceptDialog
            await tx.insert(debtEntries).values({
              rentalId: id,
              kind: "manual_charge",
              amount: totalDelta,
              comment:
                parsed.data.comment ??
                `Изменение экипировки (${remainingDays} дн × ${dailyDelta} ₽)`,
              createdByUserId: userId,
              createdByName: userName,
            });
          }
        } else if (totalDelta < 0) {
          if (parsed.data.refundTo === "cash") {
            // Возврат налом из кассы — НЕ трогаем deposit_balance.
            await tx.insert(payments).values({
              rentalId: id,
              type: "refund",
              amount: -totalDelta,
              method: parsed.data.refundMethod ?? "cash",
              paid: true,
              paidAt: new Date(),
              note: `Возврат за уменьшение экипировки (${remainingDays} дн × ${-dailyDelta} ₽) — выдан клиенту`,
            });
          } else {
            // refundTo === 'deposit' (default): возврат на депозит клиента.
            await tx.execute(sql`
              UPDATE clients SET deposit_balance = deposit_balance + ${-totalDelta}
               WHERE id = ${rental.clientId}
            `);
            // payment(type='refund') чтобы был учётный след
            await tx.insert(payments).values({
              rentalId: id,
              type: "refund",
              amount: -totalDelta,
              method: "cash",
              paid: true,
              paidAt: new Date(),
              note: `Возврат за уменьшение экипировки (${remainingDays} дн × ${-dailyDelta} ₽) → депозит клиента`,
            });
          }
        }
        return updated;
      });

      const summary = await summaryForRental(id);
      // v0.6.6: для diff собираем список названий экипировки (was/now).
      const oldNames = ((rental.equipmentJson ?? []) as Array<{ name: string }>)
        .map((i) => i.name);
      const newNames = newItems.map((i) => i.name);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "equipment_changed",
        summary:
          totalDelta === 0
            ? `Изменена экипировка по аренде ${summary} (без доплаты)`
            : totalDelta > 0
              ? `Изменена экипировка по аренде ${summary} · доплата ${totalDelta} ₽${parsed.data.payNow ? " (оплачено)" : " (в долг)"}`
              : `Изменена экипировка по аренде ${summary} · возврат ${-totalDelta} ₽ ${parsed.data.refundTo === "cash" ? "налом клиенту" : "→ депозит клиента"}`,
        meta: {
          oldItems,
          newItems,
          dailyDelta,
          remainingDays,
          totalDelta,
          payNow: parsed.data.payNow,
        },
        diff: {
          items: {
            label: "Экипировка",
            from: oldNames,
            to: newNames,
            kind: "list",
          },
          ...(totalDelta !== 0
            ? {
                fee: {
                  label: totalDelta > 0 ? "Доплата" : "Возврат",
                  from: 0,
                  to: Math.abs(totalDelta),
                  kind: "money",
                },
              }
            : {}),
        },
      });
      return result;
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
        // v0.2.91: разрешаем замену скутера и для «Проблемной» аренды —
        // это путь возобновления (resume-damage). После замены аренда
        // автоматически переводится в active (см. ниже).
        if (old.status !== "active") {
          throw new Error("rental not active");
        }
        const wasProblem = false;
        // Проверим, что новый скутер существует и в rental_pool.
        const [newScooter] = await tx
          .select()
          .from(scooters)
          .where(eq(scooters.id, d.newScooterId));
        if (!newScooter) throw new Error("new scooter not found");
        if (newScooter.baseStatus !== "rental_pool") {
          // По бизнес-логике заменить можно только на скутер «Готов к
          // аренде». Скутеры в ремонте/на продаже/разборке/выкупе и т.д.
          // отдавать в аренду нельзя.
          throw new Error("new scooter not in rental_pool");
        }
        // Дополнительная защита: даже если baseStatus='rental_pool',
        // у скутера МОЖЕТ быть открытая аренда (занят, но baseStatus
        // не меняли). Не даём наплодить дубль.
        // v0.4.44: исключаем архивные — иначе legacy-записи блокируют свап.
        const otherOpen = await tx
          .select({ id: rentals.id })
          .from(rentals)
          .where(
            and(
              eq(rentals.scooterId, d.newScooterId),
              sql`${rentals.id} <> ${id}`,
              sql`${rentals.status} = 'active'`,
              isNull(rentals.archivedAt),
            ),
          );
        if (otherOpen.length > 0) {
          throw new Error("scooter already busy");
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
          .set({
            scooterId: d.newScooterId,
            // v0.4.60: при swap обновляем mileageAtStart на пробег
            // нового скутера. Иначе акты выдачи (если оператор перевыпустит
            // после swap) показывали бы пробег старого скутера.
            mileageAtStart: newScooter.mileage ?? null,
            // Если шла замена ИЗ «Проблемной» — переводим в active.
            // Иначе статус не трогаем (active/overdue остаются как были).
            ...(wasProblem ? { status: "active" as const } : {}),
            updatedAt: sql`now()`,
          })
          .where(eq(rentals.id, id));

        // v0.4.36: при resume-damage (swap из 'problem') старый damage_report
        // больше не блокирует аренду. Если по нему всё ещё висит долг —
        // долг остаётся на клиенте (через debt_entries / payments), но
        // damage_report помечается client_agreement='agreed' чтобы
        // PaymentAcceptDialog не считал его «pending». Это формализует
        // то, что оператор уже принял ответственность клиента, заменил
        // скутер и продолжает работу. Предыдущая логика просто меняла
        // статус аренды на active — а pending-акт продолжал блокировать
        // новые операции.
        if (wasProblem) {
          await tx
            .update(damageReports)
            .set({ clientAgreement: "agreed", updatedAt: sql`now()` })
            .where(
              and(
                eq(damageReports.rentalId, id),
                eq(damageReports.clientAgreement, "pending"),
              ),
            );
        }

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

        return { rentalId: id, feeAmount, prevScooterId };
      });

      // v0.6.6: для diff достанем человекочитаемые имена скутеров.
      const swapScooterIds: number[] = [];
      if (result.prevScooterId) swapScooterIds.push(result.prevScooterId);
      swapScooterIds.push(d.newScooterId);
      const swapScootersRows = swapScooterIds.length
        ? await db
            .select({ id: scooters.id, name: scooters.name })
            .from(scooters)
            .where(inArray(scooters.id, swapScooterIds))
        : [];
      const prevScooterName =
        swapScootersRows.find((s) => s.id === result.prevScooterId)?.name ??
        (result.prevScooterId ? `#${result.prevScooterId}` : "—");
      const newScooterName =
        swapScootersRows.find((s) => s.id === d.newScooterId)?.name ??
        `#${d.newScooterId}`;

      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "scooter_swapped",
        summary: `Замена скутера в аренде #${String(id).padStart(4, "0")}${result.feeAmount > 0 ? ` (доплата ${result.feeAmount} ₽)` : ""}`,
        // v0.8.14: «ревизорские» поля — кто на кого заменён, причина и куда
        // ушёл старый скутер (в ремонт / обратно в парк) на момент замены.
        meta: {
          newScooterId: d.newScooterId,
          prevScooterId: result.prevScooterId,
          prevScooterName,
          newScooterName,
          feeAmount: result.feeAmount,
          reason: d.reason ?? null,
          oldScooterDestination: d.oldScooterStatus,
        },
        diff: {
          scooter: {
            label: "Скутер",
            from: prevScooterName,
            to: newScooterName,
            kind: "text",
          },
          ...(result.feeAmount > 0
            ? {
                fee: {
                  label: "Доплата",
                  from: 0,
                  to: result.feeAmount,
                  kind: "money",
                },
              }
            : {}),
        },
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

  /* ============================================================
   *  v0.3.8 — учёт долгов (просрочка / ущерб / ручной)
   *
   *  - GET    /api/rentals/:id/debt          — сводка + история событий
   *  - POST   /api/rentals/:id/debt/manual   — начислить ручной долг
   *  - POST   /api/rentals/:id/debt/forgive-overdue — сбросить просрочку
   *
   *  Долг по ущербу = сумма damage_reports.debt по аренде (не дублируем).
   *  Долг по просрочке = max(0, 1.5×rate×overdueDays − Σ overdue_forgive
   *                                          − Σ overdue_payment).
   *  Ручной долг        = Σ manual_charge − Σ manual_forgive.
   * ============================================================ */

  /** Считает кол-во календарных дней просрочки на момент now() для аренды. */
  function calcOverdueDays(
    endPlannedAt: Date,
    status: string,
    now: Date = new Date(),
  ): number {
    if (status !== "active") return 0;
    // v0.4.67: считаем в Europe/Moscow. Без этого на UTC-сервере
    // (где-то ~21:00 UTC = 00:00 MSK) аренда с end_planned_at сегодня
    // утром ещё «не просрочена» по UTC-дате, но по МСК уже да —
    // фронт показывал «Просрочен N дн», а бэк-долг считал 0.
    const toMsk = (d: Date) =>
      new Date(d.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
    const endMsk = toMsk(endPlannedAt);
    const nowMsk = toMsk(now);
    const endDate = new Date(
      endMsk.getFullYear(),
      endMsk.getMonth(),
      endMsk.getDate(),
    );
    const today = new Date(
      nowMsk.getFullYear(),
      nowMsk.getMonth(),
      nowMsk.getDate(),
    );
    const diff = Math.floor(
      (today.getTime() - endDate.getTime()) / 86_400_000,
    );
    return diff > 0 ? diff : 0;
  }

  /**
   * Расчёт двух компонентов просрочки (v0.4.3 / v0.4.25).
   *  • daysCharge — «долг по неоплаченным дням» = dailyRate × overdueDays
   *  • fineCharge — штраф 50% за каждый день просрочки
   *
   *  v0.4.25: учитываем rateUnit. При 'week' оператор видит «3000 ₽/нед»,
   *  но просрочка считается за каждый ДЕНЬ просрочки. Поэтому
   *  dailyRate = round(rate / 7). Округление только при расчёте просрочки
   *  (rate в БД остаётся exact).
   */
  function overdueComponents(
    rate: number,
    rateUnit: string,
    overdueDays: number,
  ): { daysCharge: number; fineCharge: number; totalCharge: number } {
    if (overdueDays <= 0 || rate <= 0) {
      return { daysCharge: 0, fineCharge: 0, totalCharge: 0 };
    }
    const dailyRate =
      rateUnit === "week" ? Math.round(rate / 7) : rate;
    const daysCharge = dailyRate * overdueDays;
    const fineCharge = Math.round(dailyRate * 0.5) * overdueDays;
    return { daysCharge, fineCharge, totalCharge: daysCharge + fineCharge };
  }

  /**
   * v0.4.51: GET /api/rentals/debt-aggregate
   *
   * Возвращает агрегированный долг по ВСЕМ live-арендам одним
   * запросом. Используется на дашборде и в clientStore — раньше
   * фронт вычислял долг локально по формуле «1.5 × rate × overdueDays»
   * без учёта debt_entries (forgive/payment) → KPI «С долгом» и
   * OverdueTable показывали устаревшие суммы после оплаты просрочки.
   *
   * Формат ответа:
   *   { items: [{
   *       rentalId, clientId, status,
   *       overdueDays, overdueDaysCharge, overdueDaysBalance,
   *       overdueFineCharge, overdueFineBalance,
   *       damageBalance, manualBalance, pendingRent, totalDebt
   *     }] }
   *
   * Идентичен формуле /:id/debt но для всех live-аренд сразу.
   */
  app.get("/debt-aggregate", async () => {
    const liveRentals = await db
      .select({
        id: rentals.id,
        clientId: rentals.clientId,
        status: rentals.status,
        rate: rentals.rate,
        rateUnit: rentals.rateUnit,
        endPlannedAt: rentals.endPlannedAt,
      })
      .from(rentals)
      .where(
        and(
          isNull(rentals.archivedAt),
          sql`${rentals.status} = 'active'`,
        ),
      );

    if (liveRentals.length === 0) {
      return { items: [] };
    }

    const rentalIds = liveRentals.map((r) => r.id);
    const idsList = sql.join(
      rentalIds.map((x) => sql`${x}`),
      sql`, `,
    );

    // Все debt_entries по live-арендам
    const entries = await db
      .select()
      .from(debtEntries)
      .where(sql`${debtEntries.rentalId} IN (${idsList})`);

    // Все damage_reports по live-арендам
    const damageRows = await db
      .select({
        id: damageReports.id,
        rentalId: damageReports.rentalId,
        total: damageReports.total,
        depositCovered: damageReports.depositCovered,
      })
      .from(damageReports)
      .where(sql`${damageReports.rentalId} IN (${idsList})`);

    // Все damage payments
    const damagePays = await db
      .select({
        rentalId: payments.rentalId,
        amount: payments.amount,
        damageReportId: payments.damageReportId,
      })
      .from(payments)
      .where(
        sql`${payments.rentalId} IN (${idsList}) AND ${payments.type} = 'damage' AND ${payments.paid} = true`,
      );

    // Все unpaid rent payments
    const unpaidRent = await db
      .select({
        rentalId: payments.rentalId,
        amount: payments.amount,
      })
      .from(payments)
      .where(
        sql`${payments.rentalId} IN (${idsList}) AND ${payments.type} = 'rent' AND ${payments.paid} = false`,
      );

    // Паркинг: неоплаченный остаток (amount − paid_amount) → в долг.
    const parkingRows = await db
      .select({
        rentalId: parkingSessions.rentalId,
        amount: parkingSessions.amount,
        paidAmount: parkingSessions.paidAmount,
      })
      .from(parkingSessions)
      .where(sql`${parkingSessions.rentalId} IN (${idsList})`);

    // v0.4.67: считаем «сегодня» по МСК, не по UTC сервера. Иначе
    // вечером по МСК (когда UTC всё ещё прошлый день) overdueDays=0.
    const toMsk = (d: Date) =>
      new Date(d.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
    const nowMsk = toMsk(new Date());
    const today = new Date(
      nowMsk.getFullYear(),
      nowMsk.getMonth(),
      nowMsk.getDate(),
    );
    const items = liveRentals.map((r) => {
      // Просроченные дни — по дате (МСК), не по миллисекундам.
      const endMsk = toMsk(r.endPlannedAt);
      const endDate = new Date(
        endMsk.getFullYear(),
        endMsk.getMonth(),
        endMsk.getDate(),
      );
      const overdueDays = Math.max(
        0,
        Math.floor((today.getTime() - endDate.getTime()) / 86_400_000),
      );
      // ₽/сут — для weekly tariffs делим на 7
      const dailyRate =
        r.rateUnit === "week" ? Math.round(r.rate / 7) : r.rate;
      const daysCharge = dailyRate * overdueDays;
      const fineCharge = Math.round(dailyRate * 0.5) * overdueDays;

      // Раскладываем debt_entries
      const myEntries = entries.filter((e) => e.rentalId === r.id);
      let daysForgiveExplicit = 0;
      let fineForgiveExplicit = 0;
      let daysPayExplicit = 0;
      let finePayExplicit = 0;
      let mixedForgive = 0;
      let mixedPayment = 0;
      let manualCharged = 0;
      let manualForgiven = 0;
      for (const e of myEntries) {
        if (e.kind === "overdue_days_forgive") daysForgiveExplicit += e.amount;
        else if (e.kind === "overdue_fine_forgive")
          fineForgiveExplicit += e.amount;
        else if (e.kind === "overdue_days_payment")
          daysPayExplicit += e.amount;
        else if (e.kind === "overdue_fine_payment")
          finePayExplicit += e.amount;
        else if (e.kind === "overdue_forgive") mixedForgive += e.amount;
        else if (e.kind === "overdue_payment") mixedPayment += e.amount;
        else if (e.kind === "manual_charge") manualCharged += e.amount;
        else if (e.kind === "manual_forgive") manualForgiven += e.amount;
      }
      // v0.4.75: гибридная модель.
      // - daysBalance = overdueDays × dailyRate (без вычитания forgive_days).
      //   Forgive дней работает через сдвиг endPlanned.
      // - fineBalance = overdueDays × fineDaily − fine_forgive − fine_payment.
      //   Чтобы «прощу только штраф» имело эффект без сдвига endPlanned.
      void daysForgiveExplicit;
      void daysPayExplicit;
      void mixedForgive;
      void mixedPayment;
      const daysBalance = daysCharge;
      const fineBalance = Math.max(
        0,
        fineCharge - fineForgiveExplicit - finePayExplicit,
      );
      const manualBalance = Math.max(0, manualCharged - manualForgiven);

      // Damage по report'ам
      const myDamageRows = damageRows.filter((d) => d.rentalId === r.id);
      const paidByReport = new Map<number, number>();
      let unassignedPaid = 0;
      for (const p of damagePays.filter((p) => p.rentalId === r.id)) {
        if (p.damageReportId != null) {
          paidByReport.set(
            p.damageReportId,
            (paidByReport.get(p.damageReportId) ?? 0) + (p.amount ?? 0),
          );
        } else {
          unassignedPaid += p.amount ?? 0;
        }
      }
      if (unassignedPaid > 0) {
        for (const dr of myDamageRows) {
          if (unassignedPaid <= 0) break;
          const reportDebt = Math.max(
            0,
            (dr.total ?? 0) -
              (dr.depositCovered ?? 0) -
              (paidByReport.get(dr.id) ?? 0),
          );
          const take = Math.min(unassignedPaid, reportDebt);
          paidByReport.set(dr.id, (paidByReport.get(dr.id) ?? 0) + take);
          unassignedPaid -= take;
        }
      }
      const damageBalance = myDamageRows.reduce(
        (s, dr) =>
          s +
          Math.max(
            0,
            (dr.total ?? 0) -
              (dr.depositCovered ?? 0) -
              (paidByReport.get(dr.id) ?? 0),
          ),
        0,
      );

      // Pending rent (paid=false)
      const pendingRent = unpaidRent
        .filter((p) => p.rentalId === r.id)
        .reduce((s, p) => s + (p.amount ?? 0), 0);

      // Паркинг: неоплаченный остаток.
      const parkingBalance = parkingRows
        .filter((p) => p.rentalId === r.id)
        .reduce(
          (s, p) => s + Math.max(0, (p.amount ?? 0) - (p.paidAmount ?? 0)),
          0,
        );

      const overdueBalance = daysBalance + fineBalance;
      const totalDebt =
        overdueBalance +
        damageBalance +
        manualBalance +
        pendingRent +
        parkingBalance;

      return {
        rentalId: r.id,
        clientId: r.clientId,
        status: r.status,
        overdueDays,
        overdueDaysCharge: daysCharge,
        overdueDaysBalance: daysBalance,
        overdueFineCharge: fineCharge,
        overdueFineBalance: fineBalance,
        overdueBalance,
        damageBalance,
        manualBalance,
        pendingRent,
        parkingBalance,
        totalDebt,
      };
    });

    return { items };
  });

  app.get<{ Params: { id: string } }>("/:id/debt", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [rental] = await db
      .select()
      .from(rentals)
      .where(eq(rentals.id, id));
    if (!rental) return reply.code(404).send({ error: "not found" });

    // === Просрочка ===
    const overdueDays = calcOverdueDays(rental.endPlannedAt, rental.status);
    const { daysCharge, fineCharge, totalCharge } = overdueComponents(
      rental.rate,
      rental.rateUnit ?? "day",
      overdueDays,
    );

    // === События по долгу (manual + forgive + payments) ===
    const events = await db
      .select()
      .from(debtEntries)
      .where(eq(debtEntries.rentalId, id))
      .orderBy(desc(debtEntries.createdAt));

    // v0.4.3: раздельный учёт списаний/оплат по двум потокам.
    //  - overdue_days_forgive / overdue_days_payment → «дни»
    //  - overdue_fine_forgive / overdue_fine_payment → «штраф»
    //  - legacy overdue_forgive / overdue_payment    → «обоюдные»,
    //    при подсчёте съедают сначала дни, потом штраф (FIFO по сумме).
    let daysForgiveExplicit = 0;
    let fineForgiveExplicit = 0;
    let daysPayExplicit = 0;
    let finePayExplicit = 0;
    // v0.4.36: разделяем legacy mixed на forgive vs payment. Раньше
    // оба сваливались в один mixedReductions и payment автоматически
    // переливался из дней в штраф когда дни =0 — клиент заплативший
    // ТОЛЬКО за дни видел что и штраф погашен. Это бизнес-баг:
    // forgive — это списание (бесплатно для клиента), его допустимо
    // переливать. Payment — это деньги клиента, переливать нельзя.
    let mixedForgive = 0; // legacy overdue_forgive — допустимо переливать
    let mixedPayment = 0; // legacy overdue_payment — НЕ переливать
    let manualCharged = 0;
    let manualForgiven = 0;
    for (const e of events) {
      if (e.kind === "overdue_days_forgive") daysForgiveExplicit += e.amount;
      else if (e.kind === "overdue_fine_forgive") fineForgiveExplicit += e.amount;
      else if (e.kind === "overdue_days_payment") daysPayExplicit += e.amount;
      else if (e.kind === "overdue_fine_payment") finePayExplicit += e.amount;
      else if (e.kind === "overdue_forgive") mixedForgive += e.amount;
      else if (e.kind === "overdue_payment") mixedPayment += e.amount;
      else if (e.kind === "manual_charge") manualCharged += e.amount;
      else if (e.kind === "manual_forgive") manualForgiven += e.amount;
    }
    // v0.4.75: упрощённая модель просрочки.
    // - daysBalance = current overdueDays × dailyRate (БЕЗ вычитания
    //   forgive_days/pay_days). Forgive дней работает через сдвиг
    //   endPlanned — overdueDays уменьшается, balance тоже.
    // - fineBalance = current overdueDays × fineDaily − fine_forgive
    //   − fine_payment. Гибрид: «прощу только штраф» (target='fine')
    //   должно иметь эффект без сдвига endPlanned. Forgive дней
    //   уменьшит fineCharge через overdueDays автоматически.
    // - mixedForgive / mixedPayment (legacy overdue_forgive/payment,
    //   без указания компонента) — игнорируем в новой модели; ради
    //   обратной совместимости с старыми записями раньше пытались
    //   разносить, но это плодило двойной учёт.
    void daysForgiveExplicit;
    void daysPayExplicit;
    void mixedForgive;
    void mixedPayment;
    const daysBalance = daysCharge;
    const fineBalance = Math.max(
      0,
      fineCharge - fineForgiveExplicit - finePayExplicit,
    );
    const overdueBalance = daysBalance + fineBalance;
    // Для UI «сколько уже простили/оплатили» — суммируем всё.
    const overdueForgiven =
      daysForgiveExplicit + fineForgiveExplicit + mixedForgive;
    const overduePaid = daysPayExplicit + finePayExplicit + mixedPayment;
    const manualBalance = Math.max(0, manualCharged - manualForgiven);

    // === Ущерб — берём из damage_reports (не дублируем здесь) ===
    const damageRows = await db
      .select({
        id: damageReports.id,
        total: damageReports.total,
        depositCovered: damageReports.depositCovered,
        clientAgreement: damageReports.clientAgreement,
        createdAt: damageReports.createdAt,
      })
      .from(damageReports)
      .where(eq(damageReports.rentalId, id));
    // v0.4.6: возвращаем все платежи по аренде (paid=true), чтобы UI
    // мог отображать их как события «Оплата» в истории долгов. Раньше
    // оплаты вообще не светились в ленте — только начисления и списания.
    const allPayments = await db
      .select()
      .from(payments)
      .where(eq(payments.rentalId, id))
      .orderBy(desc(payments.id));

    // Долг по акту = total − depositCovered − Σ(payments.type=damage, paid=true)
    const damagePayments = allPayments.filter((p) => p.type === "damage");
    const paidByReport = new Map<number, number>();
    for (const p of damagePayments) {
      if (!p.paid || p.damageReportId == null) continue;
      paidByReport.set(
        p.damageReportId,
        (paidByReport.get(p.damageReportId) ?? 0) + p.amount,
      );
    }
    let damageBalance = 0;
    for (const r of damageRows) {
      const debt = Math.max(
        0,
        r.total - r.depositCovered - (paidByReport.get(r.id) ?? 0),
      );
      damageBalance += debt;
    }

    // v0.4.27: автоматическая «реабилитация» зависших аренд.
    // Корень проблемы: статус 'problem' / 'completed_damage' выставлялся
    // из-за неоплаченного УЩЕРБА. Когда ущерб погашен (damageBalance=0),
    // статус должен вернуться в нормальный. Раньше я ошибочно требовал
    // ещё и manualBalance===0 — но ручной долг это отдельная сущность,
    // не связанная с тем что вызвало 'problem'. Если оператор начислил
    // 100 ₽ ручного долга, это не повод держать аренду в «проблемной».
    //
    // Также оборачиваем в try/catch — если update падает (например
    // по race condition), endpoint не должен возвращать 500: лучше
    // отдать debt-данные клиенту, чем сломать всю карточку.
    // v0.5: автонормализация статуса убрана — модель статусов плоская
    // (active/completed), просрочка и проблемность — computed на фронте.

    // === Паркинг — неоплаченный остаток (amount − paid_amount) ===
    const parkingRows = await db
      .select({
        amount: parkingSessions.amount,
        paidAmount: parkingSessions.paidAmount,
      })
      .from(parkingSessions)
      .where(eq(parkingSessions.rentalId, id));
    const parkingBalance = parkingRows.reduce(
      (s, p) => s + Math.max(0, (p.amount ?? 0) - (p.paidAmount ?? 0)),
      0,
    );

    return {
      overdueDays,
      overdueRate: rental.rate,
      // v0.4.3: разбивка просрочки на компоненты для UI/Истории долгов
      overdueDaysCharge: daysCharge,
      overdueFineCharge: fineCharge,
      overdueDaysBalance: daysBalance,
      overdueFineBalance: fineBalance,
      // Совместимость со старым клиентом — сумма обоих компонентов
      overdueCharge: totalCharge,
      overdueForgiven,
      overduePaid,
      overdueBalance,
      manualBalance,
      damageBalance,
      parkingBalance,
      total: overdueBalance + manualBalance + damageBalance + parkingBalance,
      events,
      damageReports: damageRows,
      payments: allPayments,
    };
  });

  /**
   * v0.4.26: запись «оплаты» по компонентам долга. Используется
   * PaymentAcceptDialog при распределении принятых средств:
   *   • overdue_days_payment / overdue_fine_payment — гасит просрочку
   *   • manual_payment — гасит ручной долг (alias для manual_forgive
   *     с тегом «оплата от клиента»)
   * Damage и rent имеют свои потоки через /api/payments.
   */
  app.post<{
    Params: { id: string };
    Body: {
      kind: "overdue_days_payment" | "overdue_fine_payment" | "manual_payment";
      amount: number;
      comment?: string;
    };
  }>("/:id/debt/payment", async (req, reply) => {
    if (!assertFinancialRole(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z.object({
      kind: z.enum([
        "overdue_days_payment",
        "overdue_fine_payment",
        "manual_payment",
      ]),
      amount: z.number().int().positive(),
      comment: z.string().max(500).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const userId = req.user?.userId ?? null;
    let userName = "система";
    if (userId) {
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      userName = u?.name ?? "система";
    }
    const dbKind =
      parsed.data.kind === "manual_payment"
        ? "manual_forgive"
        : parsed.data.kind;
    const [row] = await db
      .insert(debtEntries)
      .values({
        rentalId: id,
        kind: dbKind,
        amount: parsed.data.amount,
        comment: parsed.data.comment ?? "Оплата клиента",
        createdByUserId: userId,
        createdByName: userName,
        // v0.4.56: запись считается применённой к endPlanned сразу,
        // если это компонент дней просрочки (бэк ниже сделает сдвиг
        // и нормализацию статуса в той же транзакции).
        appliedToEndPlanned: parsed.data.kind === "overdue_days_payment",
      })
      .returning();

    // v0.4.55: оплата просроченных дней СДВИГАЕТ end_planned_at — клиент
    // фактически «купил» эти дни задним числом, аренда продлевается на
    // них. daysAdded = floor(amount / dailyRate), не больше текущих
    // overdueDays. Штраф (overdue_fine_payment) — только финансовый, на
    // время не влияет. manual_payment — тоже не сдвигает.
    let endPlannedShift = 0;
    let newStatus: string | null = null;
    let residualToDeposit = 0;
    if (parsed.data.kind === "overdue_days_payment") {
      const [r] = await db
        .select({
          rate: rentals.rate,
          rateUnit: rentals.rateUnit,
          endPlannedAt: rentals.endPlannedAt,
          status: rentals.status,
          days: rentals.days,
          sum: rentals.sum,
          clientId: rentals.clientId,
        })
        .from(rentals)
        .where(eq(rentals.id, id));
      if (r) {
        const dailyRate =
          r.rateUnit === "week" ? Math.round(r.rate / 7) : r.rate;
        if (dailyRate > 0) {
          const overdueDays = calcOverdueDays(r.endPlannedAt, r.status);
          const daysAdded = Math.min(
            overdueDays,
            Math.floor(parsed.data.amount / dailyRate),
          );
          // v0.4.81: остаток (amount > daysAdded × dailyRate) уходит в депозит
          // клиента — иначе деньги «терялись». Например, оплачено 600 при
          // dailyRate=500 — 1 день shift (500 ₽), 100 ₽ уходило в воздух.
          residualToDeposit = parsed.data.amount - daysAdded * dailyRate;
          if (daysAdded > 0) {
            endPlannedShift = daysAdded;
            const newEnd = new Date(
              r.endPlannedAt.getTime() + daysAdded * 86_400_000,
            );
            const todayMsk = new Date(
              new Date().toLocaleString("en-US", {
                timeZone: "Europe/Moscow",
              }),
            );
            todayMsk.setHours(0, 0, 0, 0);
            // v0.5: status всегда 'active' для live-аренд — overdue
            // computed на фронте.
            void todayMsk;
            // v0.4.81: при сдвиге endPlanned обновляем также days и sum —
            // фактически клиент «купил» эти дни задним числом, и стоимость
            // этих дней входит в сумму аренды.
            await db
              .update(rentals)
              .set({
                endPlannedAt: newEnd,
                days: r.days + daysAdded,
                sum: r.sum + daysAdded * dailyRate,
                updatedAt: sql`now()`,
              })
              .where(eq(rentals.id, id));
            // v0.4.89: создаём payment(type='rent', paid=true) для тех
            // дней которые клиент «купил». Без этого деньги клиента
            // не учитывались в paidIn ("За всё время аренды") и
            // в выручке. Сумма = daysAdded × dailyRate (целое × ставку),
            // остаток amount → в депозит отдельно.
            const dayCoverAmount = daysAdded * dailyRate;
            if (dayCoverAmount > 0) {
              await db.insert(payments).values({
                rentalId: id,
                type: "rent",
                amount: dayCoverAmount,
                method: "cash",
                paid: true,
                paidAt: new Date(),
                note: `Оплата ${daysAdded} дн просрочки (продление endPlanned)`,
              });
            }
          }
          // Зачисляем остаток в депозит клиента
          if (residualToDeposit > 0 && r.clientId) {
            await db.execute(sql`
              UPDATE clients
                 SET deposit_balance = deposit_balance + ${residualToDeposit}
               WHERE id = ${r.clientId}
            `);
          }
        }
      }
    } else if (parsed.data.kind === "overdue_fine_payment") {
      // v0.4.89: оплата штрафа просрочки = выручка. Создаём
      // payment(type='fine') чтобы попало в paidIn.
      await db.insert(payments).values({
        rentalId: id,
        type: "fine",
        amount: parsed.data.amount,
        method: "cash",
        paid: true,
        paidAt: new Date(),
        note: "Оплата штрафа просрочки",
      });
    } else if (parsed.data.kind === "manual_payment") {
      // v0.5.1: оплата ручного долга = выручка по аренде. Раньше
      // создавался только debt_entry(kind='manual_forgive'), но
      // payment row не было — KPI «За всё время аренды» не рос,
      // в выручке деньги не отражались. Теперь пишем payment(type='rent')
      // чтобы доход попал в paidIn и в общую выручку.
      await db.insert(payments).values({
        rentalId: id,
        type: "rent",
        amount: parsed.data.amount,
        method: "cash",
        paid: true,
        paidAt: new Date(),
        note: `Оплата ручного долга${parsed.data.comment ? ": " + parsed.data.comment : ""}`,
      });
    }

    await logActivity(req, {
      entity: "rental",
      entityId: id,
      action: "debt_payment",
      summary:
        endPlannedShift > 0
          ? `Оплата ${parsed.data.amount} ₽ по аренде #${id} (${parsed.data.kind}) — endPlanned сдвинут на ${endPlannedShift} дн${newStatus ? ", статус → active" : ""}${residualToDeposit > 0 ? `, остаток ${residualToDeposit} ₽ → депозит клиента` : ""}`
          : `Оплата ${parsed.data.amount} ₽ по аренде #${id} (${parsed.data.kind})`,
      meta: { endPlannedShift, newStatus, residualToDeposit },
      diff: {
        payment: {
          label: "Принято",
          from: 0,
          to: parsed.data.amount,
          kind: "money",
        },
      },
    });
    return row;
  });

  app.post<{
    Params: { id: string };
    Body: { amount: number; comment: string };
  }>("/:id/debt/manual", async (req, reply) => {
    if (!assertFinancialRole(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z.object({
      amount: z.number().int().positive(),
      comment: z.string().min(1).max(500),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const [rental] = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(eq(rentals.id, id));
    if (!rental) return reply.code(404).send({ error: "not found" });
    const userId = req.user?.userId ?? null;
    let userName = "система";
    if (userId) {
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      userName = u?.name ?? "система";
    }
    const [row] = await db
      .insert(debtEntries)
      .values({
        rentalId: id,
        kind: "manual_charge",
        amount: parsed.data.amount,
        comment: parsed.data.comment,
        createdByUserId: userId,
        createdByName: userName,
      })
      .returning();
    await logActivity(req, {
      entity: "rental",
      entityId: id,
      action: "debt_manual",
      summary: `Начислен долг ${parsed.data.amount} ₽ по аренде #${id}: ${parsed.data.comment}`,
      diff: {
        debt: {
          label: "Долг",
          from: 0,
          to: parsed.data.amount,
          kind: "money",
        },
      },
    });
    return row;
  });

  /**
   * v0.4.3 / v0.4.4: списание просрочки с возможностью выбрать что списываем.
   *  body.target:
   *   • 'days' — только «неоплаченные дни» (rate × days), штраф остаётся
   *   • 'fine' — только штраф 50%, дни остаются
   *   • 'all'  — и дни, и штраф
   *   • undefined — обратная совместимость, считаем как 'all'
   */
  app.post<{
    Params: { id: string };
    Body: {
      comment?: string;
      target?: "all" | "fine" | "days";
      daysCount?: number;
    };
  }>("/:id/debt/forgive-overdue", async (req, reply) => {
    if (!assertFinancialRole(req, reply)) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z.object({
      comment: z.string().max(500).optional(),
      target: z.enum(["all", "fine", "days"]).optional(),
      // v0.4.55: частичное прощение дней. Если задан — прощается ровно
      // N дней (по сумме N × dailyRate). Применяется только при
      // target='days'. Если undefined — прощается всё (старое поведение).
      daysCount: z.number().int().positive().optional(),
    });
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const target = parsed.data.target ?? "all";
    const [rental] = await db
      .select()
      .from(rentals)
      .where(eq(rentals.id, id));
    if (!rental) return reply.code(404).send({ error: "not found" });
    const overdueDays = calcOverdueDays(rental.endPlannedAt, rental.status);
    const { daysCharge, fineCharge, totalCharge } = overdueComponents(
      rental.rate,
      rental.rateUnit ?? "day",
      overdueDays,
    );
    if (totalCharge <= 0) {
      return reply
        .code(400)
        .send({ error: "no_overdue", message: "Нет начисленной просрочки." });
    }
    // Подсчитаем уже списанное по компонентам, чтобы не списать дважды.
    const events = await db
      .select()
      .from(debtEntries)
      .where(eq(debtEntries.rentalId, id));
    let daysForgiven = 0;
    let fineForgiven = 0;
    // v0.4.37: разделяем legacy на forgive vs payment (как в /debt
    // v0.4.36). mixedForgive — переливается дни→штраф (это списание,
    // допустимо), mixedPayment — только дни (это деньги клиента,
    // переливать в штраф нельзя).
    let mixedForgive = 0;
    let mixedPayment = 0;
    for (const e of events) {
      if (e.kind === "overdue_days_forgive") daysForgiven += e.amount;
      else if (e.kind === "overdue_fine_forgive") fineForgiven += e.amount;
      else if (e.kind === "overdue_days_payment") daysForgiven += e.amount;
      else if (e.kind === "overdue_fine_payment") fineForgiven += e.amount;
      else if (e.kind === "overdue_forgive") mixedForgive += e.amount;
      else if (e.kind === "overdue_payment") mixedPayment += e.amount;
    }
    let daysRemaining = Math.max(0, daysCharge - daysForgiven);
    let fineRemaining = Math.max(0, fineCharge - fineForgiven);
    // mixedForgive (legacy «сброс») — съедает сначала дни, потом штраф.
    if (mixedForgive > 0) {
      const cutDays = Math.min(daysRemaining, mixedForgive);
      daysRemaining -= cutDays;
      const leftover = mixedForgive - cutDays;
      if (leftover > 0) {
        fineRemaining = Math.max(0, fineRemaining - leftover);
      }
    }
    // mixedPayment (legacy «оплата») — только дни. Остаток НЕ переливаем.
    if (mixedPayment > 0) {
      const cutDays = Math.min(daysRemaining, mixedPayment);
      daysRemaining -= cutDays;
    }

    const userId = req.user?.userId ?? null;
    let userName = "система";
    if (userId) {
      const [u] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, userId));
      userName = u?.name ?? "система";
    }

    // v0.4.55/v0.4.68: helper — сдвинуть endPlannedAt на N дней +
    // нормализовать status (overdue → active если новый endPlanned >=
    // сегодня). Возвращает {shift, newStatus} для лога.
    const dailyRate =
      rental.rateUnit === "week"
        ? Math.round(rental.rate / 7)
        : rental.rate;
    const todayMsk = (() => {
      const t = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }),
      );
      t.setHours(0, 0, 0, 0);
      return t;
    })();
    // v0.5: status больше не зависит от просрочки. shiftEndPlanned
    // только двигает endPlannedAt; normalizeIfFullyResolved — no-op
    // (просрочка computed на фронте).
    void todayMsk;
    const shiftEndPlanned = async (
      daysToAdd: number,
    ): Promise<{ shift: number; newStatus: string | null }> => {
      if (daysToAdd <= 0) return { shift: 0, newStatus: null };
      const newEnd = new Date(
        rental.endPlannedAt.getTime() + daysToAdd * 86_400_000,
      );
      await db
        .update(rentals)
        .set({
          endPlannedAt: newEnd,
          updatedAt: sql`now()`,
        })
        .where(eq(rentals.id, id));
      return { shift: daysToAdd, newStatus: null };
    };
    const normalizeIfFullyResolved = async (
      _newDaysRemaining: number,
      _newFineRemaining: number,
    ): Promise<{ shift: number; newStatus: string | null }> => {
      void _newDaysRemaining;
      void _newFineRemaining;
      return { shift: 0, newStatus: null };
    };

    if (target === "fine") {
      if (fineRemaining <= 0) {
        return reply.code(400).send({
          error: "already_zero",
          message: "Штраф просрочки уже списан/оплачен.",
        });
      }
      // v0.6.13: частичное прощение штрафа — daysCount × fineDailyRate.
      // Если daysCount задан → прощаем только эту часть. Иначе — весь
      // остаток (старое поведение). endPlanned НЕ сдвигаем (дни остаются
      // в долге, мы прощаем только их штраф).
      const fineDailyRateLocal = Math.round(dailyRate * 0.5);
      const fineAmount =
        parsed.data.daysCount && parsed.data.daysCount > 0
          ? Math.min(
              fineRemaining,
              parsed.data.daysCount * Math.max(1, fineDailyRateLocal),
            )
          : fineRemaining;
      const [row] = await db
        .insert(debtEntries)
        .values({
          rentalId: id,
          kind: "overdue_fine_forgive",
          amount: fineAmount,
          comment: parsed.data.comment ?? null,
          createdByUserId: userId,
          createdByName: userName,
        })
        .returning();
      // v0.4.68: после прощения штрафа — нормализуем status, если
      // суммарная просрочка обнулилась.
      const fineLeftAfter = Math.max(0, fineRemaining - fineAmount);
      const norm = await normalizeIfFullyResolved(daysRemaining, fineLeftAfter);
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "debt_overdue_fine_forgiven",
        summary: `Списан штраф просрочки ${fineAmount} ₽${parsed.data.daysCount ? ` (за ${parsed.data.daysCount} дн)` : ""} по аренде #${id}${parsed.data.comment ? `: ${parsed.data.comment}` : ""}${norm.newStatus ? " · статус → active" : ""}`,
        meta: {
          daysShift: norm.shift,
          newStatus: norm.newStatus,
          daysCount: parsed.data.daysCount ?? null,
        },
        diff: {
          fine: {
            label: "Штраф",
            from: fineAmount,
            to: 0,
            kind: "money",
          },
        },
      });
      return {
        row,
        mode: "fine",
        amount: fineAmount,
        daysShift: norm.shift,
        newStatus: norm.newStatus,
      };
    }

    if (target === "days") {
      if (daysRemaining <= 0) {
        return reply.code(400).send({
          error: "already_zero",
          message: "Долг по неоплаченным дням уже списан/оплачен.",
        });
      }
      // v0.4.55: частичное прощение. Если daysCount задан, прощаем
      // ровно N дней (capped до фактического остатка). Иначе — всё.
      const requestedAmount =
        parsed.data.daysCount && parsed.data.daysCount > 0
          ? Math.min(
              daysRemaining,
              parsed.data.daysCount * Math.max(1, dailyRate),
            )
          : daysRemaining;
      const [row] = await db
        .insert(debtEntries)
        .values({
          rentalId: id,
          kind: "overdue_days_forgive",
          amount: requestedAmount,
          comment: parsed.data.comment ?? null,
          createdByUserId: userId,
          createdByName: userName,
          appliedToEndPlanned: true, // v0.4.56: применяем сразу
        })
        .returning();
      // Сдвигаем endPlanned пропорционально прощённой части.
      const daysToShift = Math.floor(requestedAmount / Math.max(1, dailyRate));
      // v0.4.73: при прощении дней автоматически прощаем штраф за эти
      // же дни. Бизнес-логика: «снять день» = «этот день не считать»,
      // включая и штраф. Иначе абсурд: оператор «снял 1 день», а в долге
      // остаётся штраф 250₽ за этот день — оператор ожидал что день
      // полностью убран. fineToForgive = K дней × 0.5 × dailyRate, но
      // не больше реального остатка fine.
      const fineDailyRate = Math.round(dailyRate * 0.5);
      const fineToForgive = Math.min(
        fineRemaining,
        daysToShift * fineDailyRate,
      );
      if (fineToForgive > 0) {
        await db.insert(debtEntries).values({
          rentalId: id,
          kind: "overdue_fine_forgive",
          amount: fineToForgive,
          comment: `Авто-списание штрафа за прощённые ${daysToShift} дн`,
          createdByUserId: userId,
          createdByName: userName,
          appliedToEndPlanned: true,
        });
      }
      const shiftRes = await shiftEndPlanned(daysToShift);
      // v0.4.68: страховка — если status всё ещё overdue (например shift=0
      // из-за дробной суммы или legacy-payment частично разобрал дни),
      // но просрочка по дням+штрафу обнулилась → нормализуем.
      const remainAfter = Math.max(0, daysRemaining - requestedAmount);
      const fineAfter = Math.max(0, fineRemaining - fineToForgive);
      const norm =
        shiftRes.newStatus == null
          ? await normalizeIfFullyResolved(remainAfter, fineAfter)
          : { shift: 0, newStatus: null };
      const finalShift = shiftRes.shift + norm.shift;
      const finalStatus = shiftRes.newStatus ?? norm.newStatus;
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "debt_overdue_days_forgiven",
        summary: `Списан долг по дням просрочки ${requestedAmount} ₽ (${daysToShift} дн) по аренде #${id}${parsed.data.comment ? `: ${parsed.data.comment}` : ""}${finalStatus ? " · статус → active" : ""}`,
        meta: {
          daysToShift,
          newStatus: finalStatus,
        },
        diff: {
          debt: {
            label: "Долг по дням",
            from: requestedAmount,
            to: 0,
            kind: "money",
          },
          overdueDays: {
            label: "Дней просрочки",
            from: daysToShift,
            to: 0,
            kind: "number",
            suffix: "дн",
          },
        },
      });
      return {
        row,
        mode: "days",
        amount: requestedAmount,
        daysShift: finalShift,
        newStatus: finalStatus,
      };
    }

    // target === 'all' — списываем и дни, и штраф двумя записями.
    if (daysRemaining <= 0 && fineRemaining <= 0) {
      return reply
        .code(400)
        .send({ error: "already_zero", message: "Долг по просрочке уже 0." });
    }
    const inserted: typeof events = [];
    if (daysRemaining > 0) {
      const [row] = await db
        .insert(debtEntries)
        .values({
          rentalId: id,
          kind: "overdue_days_forgive",
          amount: daysRemaining,
          comment: parsed.data.comment ?? null,
          createdByUserId: userId,
          createdByName: userName,
          appliedToEndPlanned: true, // v0.4.56
        })
        .returning();
      if (row) inserted.push(row);
    }
    if (fineRemaining > 0) {
      const [row] = await db
        .insert(debtEntries)
        .values({
          rentalId: id,
          kind: "overdue_fine_forgive",
          amount: fineRemaining,
          comment: parsed.data.comment ?? null,
          createdByUserId: userId,
          createdByName: userName,
          appliedToEndPlanned: true, // v0.4.56
        })
        .returning();
      if (row) inserted.push(row);
    }
    // v0.4.55: при target='all' сдвигаем endPlanned на дни-часть.
    const daysToShiftAll = Math.floor(daysRemaining / Math.max(1, dailyRate));
    const shiftResAll = await shiftEndPlanned(daysToShiftAll);
    // v0.4.68: после всех списаний остатки = 0 (мы только что списали
    // daysRemaining + fineRemaining). Если shift не сбросил status
    // (было shift=0 из-за нулевого daysRemaining перед операцией) —
    // принудительно нормализуем status и подвинем endPlanned до today.
    const norm =
      shiftResAll.newStatus == null
        ? await normalizeIfFullyResolved(0, 0)
        : { shift: 0, newStatus: null };
    const finalShiftAll = shiftResAll.shift + norm.shift;
    const finalStatusAll = shiftResAll.newStatus ?? norm.newStatus;
    const total = daysRemaining + fineRemaining;
    await logActivity(req, {
      entity: "rental",
      entityId: id,
      action: "debt_overdue_forgiven",
      summary: `Сброшена просрочка ${total} ₽ (дни ${daysRemaining} + штраф ${fineRemaining}) по аренде #${id}${parsed.data.comment ? `: ${parsed.data.comment}` : ""}${finalShiftAll > 0 ? ` · endPlanned +${finalShiftAll} дн` : ""}${finalStatusAll ? ", статус → active" : ""}`,
      meta: {
        daysShift: finalShiftAll,
        newStatus: finalStatusAll,
      },
      diff: {
        debt: {
          label: "Просрочка",
          from: total,
          to: 0,
          kind: "money",
        },
      },
    });
    return {
      entries: inserted,
      mode: "all",
      amount: total,
      daysShift: finalShiftAll,
      newStatus: finalStatusAll,
    };
  });

  /** Удаление события долга — для случаев когда оператор ошибся
   *  при ручном начислении. Доступно только директору / создателю. */
  app.delete<{
    Params: { id: string; entryId: string };
  }>("/:id/debt/:entryId", async (req, reply) => {
    const id = Number(req.params.id);
    const entryId = Number(req.params.entryId);
    if (!Number.isFinite(id) || !Number.isFinite(entryId))
      return reply.code(400).send({ error: "bad id" });
    if (req.user?.role !== "director" && req.user?.role !== "creator") {
      return reply.code(403).send({ error: "forbidden" });
    }
    const [row] = await db
      .delete(debtEntries)
      .where(
        and(
          eq(debtEntries.id, entryId),
          eq(debtEntries.rentalId, id),
        ),
      )
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    await logActivity(req, {
      entity: "rental",
      entityId: id,
      action: "debt_entry_deleted",
      summary: `Удалена запись долга #${entryId} по аренде #${id} (${row.kind} ${row.amount} ₽)`,
    });
    return { ok: true };
  });
}
