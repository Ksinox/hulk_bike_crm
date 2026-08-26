import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { appSettings, rentals, scooters, users } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";
import { requireDirectorApproval } from "./approvals.js";
import { scooterStatusLabel } from "../services/activityMessages.js";
import { ensureRepairJobForScooter } from "./repair-jobs.js";

const ScooterModelEnum = z.enum(["jog", "gear", "honda", "tank"]);
const ScooterBaseStatusEnum = z.enum([
  "ready",
  "rental_pool",
  "repair",
  "buyout",
  "for_sale",
  "sold",
  "disassembly",
  "dtp",
]);

const CreateScooterBody = z
  .object({
    name: z.string().min(1).max(50),
    model: ScooterModelEnum,
    modelId: z.number().int().positive().optional().nullable(),
    vin: z.string().max(20).optional().nullable(),
    engineNo: z.string().max(50).optional().nullable(),
    frameNumber: z.string().max(50).optional().nullable(),
    year: z.number().int().min(1980).max(2100).optional().nullable(),
    color: z.string().max(50).optional().nullable(),
    mileage: z.number().int().min(0).optional(),
    baseStatus: ScooterBaseStatusEnum.optional(),
    purchaseDate: z.string().optional().nullable(),
    purchasePrice: z.number().int().min(0).optional().nullable(),
    marketValue: z.number().int().min(0).optional().nullable(),
    lastOilChangeMileage: z.number().int().min(0).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    /** Пункт 15: желаемое место в арендном парке (из свободных). */
    rentalSlot: z.number().int().min(1).optional().nullable(),
    /** Пункт 11: партнёрская техника (свойство единицы, не модели). */
    isPartner: z.boolean().optional(),
    /** Процент инвестора по единице; null → общий процент из настроек. */
    partnerShare: z.number().int().min(0).max(100).optional().nullable(),
    /**
     * Правки 2.0, п.7: инвестор партнёрской техники. Задан → единица
     * автоматически считается партнёрской (isPartner=true).
     */
    investorId: z.number().int().positive().optional().nullable(),
  })
  .strict();

const PatchScooterBody = CreateScooterBody.partial();

const directorOnly = requireRole("director");

/**
 * Имя техники для журнала/сообщений без исторической «решётки».
 * Правка заказчика 24.08: формата «Jog #03» в CRM быть не должно —
 * номер заведения оператору ничего не говорит, значим арендный номер.
 */
function scooterLabel(name: string, slot?: number | null): string {
  const model = name.replace(/\s*#\s*\d+\s*$/, "").trim() || name;
  return slot != null ? `${model} №${slot}` : model;
}

/* ───────────── Пункт 15: арендные места (порядковые номера) ─────────────
 * Место занято, пока скутер числится в арендном парке (rental_pool /
 * repair / dtp). Уход в продажу/выкуп/разборку освобождает место, номер
 * запоминается в exRentalSlot (пункт 16 — ярлык «был в аренде»).
 */

/** Статусы, в которых скутер занимает арендное место. */
const SLOT_STATUSES = ["rental_pool", "repair", "dtp"] as const;

function holdsSlot(status: string): boolean {
  return (SLOT_STATUSES as readonly string[]).includes(status);
}

/**
 * Уникальный ID техники — 6 последних цифр VIN (правка заказчика 24.08:
 * было 4, но при 4 цифрах реален риск совпадения со старым скутером).
 * VIN и номер рамы в CRM — одно и то же поле, берём что заполнено.
 */
function uidFromVin(...sources: (string | null | undefined)[]): string | null {
  for (const src of sources) {
    const digits = (src ?? "").replace(/\D/g, "");
    if (digits) return digits.slice(-6);
  }
  return null;
}

async function getSlotsTotal(): Promise<number> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "rental_slots_total"));
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function getUsedSlots(): Promise<
  { slot: number; id: number; name: string }[]
> {
  const rows = await db
    .select({
      slot: scooters.rentalSlot,
      id: scooters.id,
      name: scooters.name,
    })
    .from(scooters)
    .where(
      and(
        isNotNull(scooters.rentalSlot),
        isNull(scooters.archivedAt),
        isNull(scooters.deletedAt),
      ),
    );
  return rows
    .filter((r): r is { slot: number; id: number; name: string } => r.slot != null)
    .sort((a, b) => a.slot - b.slot);
}

/** Свободные места в диапазоне 1..total. */
function freeSlotList(total: number, used: { slot: number }[]): number[] {
  const busy = new Set(used.map((u) => u.slot));
  const free: number[] = [];
  for (let i = 1; i <= total; i++) if (!busy.has(i)) free.push(i);
  return free;
}

async function currentUserName(userId: number | undefined): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return u?.name ?? null;
}

export async function scootersRoutes(app: FastifyInstance) {
  /**
   * GET /api/scooters
   * По умолчанию возвращает активные (archived_at IS NULL).
   * ?includeArchived=1 вернёт всё.
   */
  app.get<{ Querystring: { includeArchived?: string } }>("/", async (req) => {
    const includeArchived = req.query.includeArchived === "1";
    const rows = includeArchived
      ? await db.select().from(scooters).orderBy(scooters.name)
      : await db
          .select()
          .from(scooters)
          .where(isNull(scooters.archivedAt))
          .orderBy(scooters.name);
    return { items: rows };
  });

  /**
   * Пункт 15: состояние арендных мест — общее количество (настройка),
   * занятые (кем) и свободные номера. Для формы добавления/смены места.
   */
  app.get("/slots", async () => {
    const [total, used] = await Promise.all([getSlotsTotal(), getUsedSlots()]);
    return { total, used, free: freeSlotList(total, used) };
  });

  /**
   * Пункт 15: изменить общее количество мест в арендном парке (вручную).
   * Нельзя опустить ниже максимального занятого номера — сначала
   * освободите места (переведите технику из аренды).
   */
  app.post<{ Body: { total?: number } }>("/slots-total", async (req, reply) => {
    const total = Number(req.body?.total);
    if (!Number.isFinite(total) || total < 0 || total > 999) {
      return reply.code(400).send({ error: "bad total" });
    }
    const used = await getUsedSlots();
    const maxUsed = used.length ? used[used.length - 1]!.slot : 0;
    if (total < maxUsed) {
      return reply.code(409).send({
        error: "slots_in_use",
        message: `Занят номер ${maxUsed} — сначала освободите номера выше ${total} (переведите технику из аренды).`,
      });
    }
    const prev = await getSlotsTotal();
    await db
      .insert(appSettings)
      .values({ key: "rental_slots_total", value: String(total) })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(total) },
      });
    await logActivity(req, {
      entity: "scooter",
      entityId: null,
      action: "rental_slots_total_changed",
      summary: `Изменено количество мест в арендном парке: ${prev} → ${total}`,
      diff: {
        total: {
          label: "Мест в арендном парке",
          from: prev,
          to: total,
          kind: "number",
        },
      },
    });
    return { total };
  });

  /**
   * Пункт 11 (правка 24.08): общий процент инвестора по партнёрской
   * технике. Применяется ко всем единицам, где не выставлен свой.
   */
  app.get("/partner-share", async () => {
    const [row] = await db
      .select({ value: appSettings.value })
      .from(appSettings)
      .where(eq(appSettings.key, "partner_share_default"));
    const n = Number(row?.value);
    const custom = await db
      .select({ id: scooters.id, name: scooters.name, share: scooters.partnerShare })
      .from(scooters)
      .where(
        and(
          eq(scooters.isPartner, true),
          isNotNull(scooters.partnerShare),
          isNull(scooters.archivedAt),
          isNull(scooters.deletedAt),
        ),
      );
    return {
      value: Number.isFinite(n) ? n : 50,
      /** Техника с персональным процентом — о ней предупреждаем при «применить ко всем». */
      custom: custom.map((c) => ({ id: c.id, name: c.name, share: c.share })),
    };
  });

  /**
   * Изменить общий процент. mode:
   *   'default'   — только значение по умолчанию (персональные не трогаем);
   *   'apply_all' — сбросить персональные проценты (всё по общему).
   */
  app.post<{ Body: { value?: number; mode?: "default" | "apply_all" } }>(
    "/partner-share",
    async (req, reply) => {
      const value = Number(req.body?.value);
      if (!Number.isFinite(value) || value < 0 || value > 100) {
        return reply.code(400).send({ error: "bad value" });
      }
      const mode = req.body?.mode === "apply_all" ? "apply_all" : "default";
      await db
        .insert(appSettings)
        .values({ key: "partner_share_default", value: String(value) })
        .onConflictDoUpdate({
          target: appSettings.key,
          set: { value: String(value) },
        });
      let reset = 0;
      if (mode === "apply_all") {
        const rows = await db
          .update(scooters)
          .set({ partnerShare: null, updatedAt: sql`now()` })
          .where(
            and(
              eq(scooters.isPartner, true),
              isNotNull(scooters.partnerShare),
              isNull(scooters.archivedAt),
            ),
          )
          .returning({ id: scooters.id });
        reset = rows.length;
      }
      await logActivity(req, {
        entity: "scooter",
        entityId: null,
        action: "partner_share_changed",
        summary:
          mode === "apply_all"
            ? `Процент инвестора ${value} % применён ко всей партнёрской технике (персональные сброшены: ${reset})`
            : `Общий процент инвестора: ${value} %`,
      });
      return { value, reset };
    },
  );

  /** GET /api/scooters/archived — список в архиве */
  app.get("/archived", async () => {
    const rows = await db
      .select()
      .from(scooters)
      .where(isNotNull(scooters.archivedAt))
      .orderBy(scooters.archivedAt);
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db.select().from(scooters).where(eq(scooters.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const parsed = CreateScooterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    // Запрет дубля VIN: если VIN указан, нельзя создать ещё один НЕархивный
    // скутер с тем же VIN. Пустой VIN (его может не быть) не проверяем.
    const newVin = parsed.data.vin?.trim();
    if (newVin) {
      const [dup] = await db
        .select({ id: scooters.id, name: scooters.name })
        .from(scooters)
        .where(
          and(
            eq(scooters.vin, newVin),
            isNull(scooters.archivedAt),
            isNull(scooters.deletedAt),
          ),
        );
      if (dup) {
        return reply.code(409).send({
          error: "duplicate_vin",
          message: `Скутер с таким VIN уже есть: «${dup.name}». VIN должен быть уникальным.`,
        });
      }
    }
    // Пункт 15: скутер, попадающий в арендный парк, занимает место.
    // Место можно указать явно (из свободных) или получить автоматически
    // (наименьшее свободное). Мест нет → 409, увеличьте общее количество.
    const status = parsed.data.baseStatus ?? "ready";
    let slotToUse: number | null = null;
    if (holdsSlot(status)) {
      const [total, used] = await Promise.all([getSlotsTotal(), getUsedSlots()]);
      const free = freeSlotList(total, used);
      const wanted = (parsed.data as { rentalSlot?: number | null }).rentalSlot;
      if (wanted != null) {
        if (wanted > total)
          return reply.code(409).send({
            error: "slot_out_of_range",
            message: `Номер ${wanted} больше общего количества номеров (${total}).`,
          });
        if (!free.includes(wanted))
          return reply.code(409).send({
            error: "slot_taken",
            message: `Номер ${wanted} уже занят.`,
          });
        slotToUse = wanted;
      } else {
        if (free.length === 0)
          return reply.code(409).send({
            error: "no_free_slots",
            message: `Все ${total} номеров арендного парка заняты. Увеличьте общее количество или освободите один.`,
          });
        slotToUse = free[0]!;
      }
    }
    try {
      const [row] = await db
        .insert(scooters)
        .values({
          ...parsed.data,
          mileage: parsed.data.mileage ?? 0,
          baseStatus: status,
          rentalSlot: slotToUse,
          uid: uidFromVin(parsed.data.vin, parsed.data.frameNumber),
          // Правки 2.0, п.7: техника заведена под инвестора → она
          // партнёрская по определению.
          isPartner: parsed.data.investorId
            ? true
            : (parsed.data.isPartner ?? false),
        })
        .returning();
      if (!row) return reply.code(500).send({ error: "insert failed" });

      await logActivity(req, {
        entity: "scooter",
        entityId: row.id,
        action: "created",
        summary:
          slotToUse != null
            ? `Добавлена техника «${scooterLabel(row.name, slotToUse)}» в арендный парк`
            : `Добавлена техника «${scooterLabel(row.name)}»`,
      });
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
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed = PatchScooterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const [before] = await db.select().from(scooters).where(eq(scooters.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });

    // Правка 2.2 (26.08): смена номера РАМЫ (VIN) или ДВИГАТЕЛЯ у уже
    // существующего скутера — только с ключом директора. Идентификаторы
    // техники завязаны на договоры и акты; тихая правка = риск подмены.
    // Первичное ЗАПОЛНЕНИЕ пустого поля ключом не защищаем — это
    // до-внесение данных, а не изменение.
    {
      const identityChanged = (
        [
          [before.vin, parsed.data.vin],
          [before.frameNumber, parsed.data.frameNumber],
          [before.engineNo, parsed.data.engineNo],
        ] as const
      ).some(
        ([oldV, newV]) =>
          newV !== undefined &&
          (oldV ?? "").trim() !== "" &&
          (newV ?? "").trim() !== (oldV ?? "").trim(),
      );
      if (
        identityChanged &&
        !(await requireDirectorApproval(app, req, reply, "scooter_identity_change"))
      )
        return;
    }

    // Запрет дубля VIN при редактировании: если меняем VIN на уже занятый
    // другим НЕархивным скутером — отклоняем (пустой VIN не проверяем).
    if (parsed.data.vin !== undefined) {
      const editVin = parsed.data.vin?.trim();
      if (editVin) {
        const [dup] = await db
          .select({ id: scooters.id, name: scooters.name })
          .from(scooters)
          .where(
            and(
              eq(scooters.vin, editVin),
              ne(scooters.id, id),
              isNull(scooters.archivedAt),
              isNull(scooters.deletedAt),
            ),
          );
        if (dup) {
          return reply.code(409).send({
            error: "duplicate_vin",
            message: `Скутер с таким VIN уже есть: «${dup.name}». VIN должен быть уникальным.`,
          });
        }
      }
    }

    // Пункт 1: перенос техники из одной категории в другую — защищённое
    // действие, требует подтверждения ключом директора.
    if (
      parsed.data.baseStatus &&
      parsed.data.baseStatus !== before.baseStatus
    ) {
      if (
        !(await requireDirectorApproval(
          app,
          req,
          reply,
          "scooter_status_change",
        ))
      )
        return;
    }

    // Нельзя менять baseStatus у скутера, находящегося в активной аренде.
    // Сначала нужно закрыть аренду (завершить / отменить).
    if (
      parsed.data.baseStatus &&
      parsed.data.baseStatus !== before.baseStatus
    ) {
      const active = await db
        .select({ id: rentals.id })
        .from(rentals)
        .where(
          and(
            eq(rentals.scooterId, id),
            // v0.7.1: enum rental_status = только active|completed.
            // overdue/returning вычисляются на фронте (effectiveRentalStatus),
            // в БД все живые аренды = 'active'. Старое IN(...) с
            // несуществующими значениями enum роняло запрос:
            // "invalid input value for enum rental_status: overdue".
            eq(rentals.status, "active"),
          ),
        );
      if (active.length > 0) {
        return reply.code(409).send({
          error: "scooter_has_active_rental",
          message:
            "Сначала завершите активную аренду, затем меняйте статус скутера",
          rentalIds: active.map((r) => r.id),
        });
      }
    }

    // ── Пункт 15: арендные места ──
    const patch: Record<string, unknown> = { ...parsed.data };
    const nextStatus = parsed.data.baseStatus ?? before.baseStatus;
    const willHold = holdsSlot(nextStatus);
    const heldBefore = holdsSlot(before.baseStatus);

    // Пересчёт uid при смене VIN / номера рамы.
    if (parsed.data.vin !== undefined || parsed.data.frameNumber !== undefined) {
      patch.uid = uidFromVin(
        parsed.data.vin ?? before.vin,
        parsed.data.frameNumber ?? before.frameNumber,
      );
    }

    // Ручная смена места (или назначение при входе в арендный парк) —
    // только на свободное и в пределах общего количества.
    const wantedSlot = parsed.data.rentalSlot;
    if (wantedSlot !== undefined || (willHold && !heldBefore)) {
      const [total, used] = await Promise.all([getSlotsTotal(), getUsedSlots()]);
      const free = freeSlotList(
        total,
        used.filter((u) => u.id !== id),
      );
      if (willHold) {
        if (wantedSlot != null) {
          if (wantedSlot > total)
            return reply.code(409).send({
              error: "slot_out_of_range",
              message: `Номер ${wantedSlot} больше общего количества номеров (${total}).`,
            });
          if (!free.includes(wantedSlot))
            return reply.code(409).send({
              error: "slot_taken",
              message: `Номер ${wantedSlot} уже занят другой техникой.`,
            });
          patch.rentalSlot = wantedSlot;
        } else if (before.rentalSlot == null || wantedSlot === null) {
          // вход в парк без указания места (или явный сброс) → авто
          if (free.length === 0)
            return reply.code(409).send({
              error: "no_free_slots",
              message: `Все ${total} номеров арендного парка заняты. Увеличьте общее количество или освободите один.`,
            });
          patch.rentalSlot = free[0]!;
        }
      } else {
        // скутер вне арендного парка место занимать не может
        patch.rentalSlot = null;
      }
    }

    // Уход из арендного парка: место освобождается, номер остаётся ярлыком
    // «был в аренде» (пункт 16).
    if (heldBefore && !willHold) {
      patch.rentalSlot = null;
      if (before.rentalSlot != null) patch.exRentalSlot = before.rentalSlot;
    }

    // Правки 2.0, п.7: привязали инвестора → техника партнёрская;
    // отвязали (investorId=null) → снова наша.
    if (patch.investorId !== undefined) {
      patch.isPartner = patch.investorId != null;
    }

    const [row] = await db
      .update(scooters)
      .set({ ...patch, updatedAt: sql`now()` })
      .where(eq(scooters.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    // Пункт 15: смена места — отдельная запись в журнал с diff.
    if (
      before.rentalSlot !== row.rentalSlot &&
      row.rentalSlot != null &&
      before.rentalSlot != null
    ) {
      await logActivity(req, {
        entity: "scooter",
        entityId: id,
        action: "rental_slot_changed",
        summary: `Номер техники ${scooterLabel(row.name)} в арендном парке: ${before.rentalSlot} → ${row.rentalSlot}`,
        diff: {
          slot: {
            label: "Место в арендном парке",
            from: `№${before.rentalSlot}`,
            to: `№${row.rentalSlot}`,
            kind: "text",
          },
        },
      });
    }

    // Если сменился статус — отдельным summary с русскими лейблами
    const statusChanged =
      parsed.data.baseStatus && parsed.data.baseStatus !== before.baseStatus;
    // v0.2.94: при ручном переводе скутера в repair (через карточку
    // скутера) автоматически открываем repair_job — пустой, без чек-листа
    // от акта. Оператор может добавлять пункты вручную в разделе Ремонты.
    if (statusChanged && parsed.data.baseStatus === "repair") {
      try {
        await ensureRepairJobForScooter({
          scooterId: id,
          createdByUserId:
            (req as unknown as { user?: { userId?: number } }).user?.userId ??
            null,
        });
      } catch (e) {
        req.log?.warn?.({ err: e }, "ensureRepairJobForScooter failed");
      }
    }
    await logActivity(req, {
      entity: "scooter",
      entityId: id,
      action: statusChanged ? "status_changed" : "updated",
      summary: statusChanged
        ? `Статус ${scooterLabel(row.name, row.rentalSlot)}: «${scooterStatusLabel(before.baseStatus)}» → «${scooterStatusLabel(row.baseStatus)}»`
        : `Отредактированы данные техники ${scooterLabel(row.name, row.rentalSlot)}`,
      meta: { before, after: row },
    });
    return row;
  });

  /**
   * DELETE /api/scooters/:id → переместить в архив (soft).
   * Разрешено директору/создателю. Если у скутера активная аренда — 409.
   */
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: directorOnly }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    // Пункты 1/17: скутер покидает парк — только с ключом директора.
    if (!(await requireDirectorApproval(app, req, reply, "scooter_remove")))
      return;

    // Причина переноса в архив (опционально). Тело может быть пустым —
    // тогда reason = null. Обрезаем до 300 символов, чтобы не раздувать.
    const delBody = (req.body ?? {}) as { reason?: unknown };
    const archiveReason =
      typeof delBody.reason === "string" && delBody.reason.trim()
        ? delBody.reason.trim().slice(0, 300)
        : null;

    const [sc] = await db.select().from(scooters).where(eq(scooters.id, id));
    if (!sc) return reply.code(404).send({ error: "not found" });
    if (sc.archivedAt) return reply.code(400).send({ error: "already archived" });

    // Проверяем активные аренды. ВАЖНО: enum rental_status = только
    // ('active','completed'). Просрочка/возврат («overdue»/«returning») —
    // computed на фронте, в БД их НЕТ. Раньше тут было
    // IN ('active','overdue','returning') → Postgres падал с 22P02
    // (invalid enum value) и архивация НЕ РАБОТАЛА ни для одного скутера.
    const activeRentals = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(and(eq(rentals.scooterId, id), eq(rentals.status, "active")));
    if (activeRentals.length > 0) {
      return reply
        .code(409)
        .send({ error: "scooter has active rentals", rentalIds: activeRentals.map((r) => r.id) });
    }

    const by = (await currentUserName(req.user?.userId)) ?? "система";
    const [row] = await db
      .update(scooters)
      .set({ archivedAt: sql`now()`, archivedBy: by, archivedReason: archiveReason })
      .where(eq(scooters.id, id))
      .returning();

    await logActivity(req, {
      entity: "scooter",
      entityId: id,
      action: "archived",
      summary: archiveReason
        ? `Техника «${scooterLabel(sc.name)}» отправлена в архив · причина: ${archiveReason}`
        : `Техника «${scooterLabel(sc.name)}» отправлена в архив`,
    });

    return row;
  });

  /** POST /api/scooters/:id/restore — вернуть из архива/отменить удаление */
  app.post<{ Params: { id: string } }>(
    "/:id/restore",
    { preHandler: directorOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [sc] = await db.select().from(scooters).where(eq(scooters.id, id));
      if (!sc) return reply.code(404).send({ error: "not found" });
      if (!sc.archivedAt && !sc.deletedAt)
        return reply.code(400).send({ error: "not archived or deleted" });

      const [row] = await db
        .update(scooters)
        .set({
          archivedAt: null,
          archivedBy: null,
          archivedReason: null,
          deletedAt: null,
          deletedBy: null,
        })
        .where(eq(scooters.id, id))
        .returning();
      await logActivity(req, {
        entity: "scooter",
        entityId: id,
        action: "restored",
        summary: `Техника «${scooterLabel(sc.name)}» восстановлена из архива`,
      });
      return row;
    },
  );

  /**
   * POST /api/scooters/:id/purge — немедленное физическое удаление.
   * По решению заказчика: архив бессрочный, но директор может в любой
   * момент удалить позицию вручную сразу, без grace-периода 7 дней.
   * Восстановление невозможно — операция необратимая.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/purge",
    { preHandler: directorOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [sc] = await db.select().from(scooters).where(eq(scooters.id, id));
      if (!sc) return reply.code(404).send({ error: "not found" });
      if (!sc.archivedAt)
        return reply.code(400).send({ error: "must be archived first" });

      const name = sc.name;
      await db.delete(scooters).where(eq(scooters.id, id));
      await logActivity(req, {
        entity: "scooter",
        entityId: id,
        action: "deleted",
        summary: `Скутер «${name}» удалён из архива навсегда`,
      });
      return reply.code(204).send();
    },
  );
}
