import type { FastifyInstance } from "fastify";
import { and, eq, ilike, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { activityLog, appSettings, buyoutDeals, rentals, scooterModels, scooters, users } from "../db/schema.js";
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
    /** Блок «Продажи» (31.08): цена продажи и партия закупа — редактируются
     *  в карточке техники, читаются и в «Скутерах», и в «Продажах». */
    salePrice: z.number().int().min(0).optional().nullable(),
    purchaseBatch: z.string().max(120).optional().nullable(),
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

/**
 * Релиз 2.0.1: добавление техники партией. Общее (модель, категория,
 * партия, дата и цена закупа) — один раз, уникальное (рама, двигатель,
 * пробег, номер) — строкой на каждую единицу.
 */
const BatchUnit = z
  .object({
    vin: z.string().trim().max(20).optional().nullable(),
    engineNo: z.string().trim().max(50).optional().nullable(),
    year: z.number().int().min(1980).max(2100).optional().nullable(),
    color: z.string().trim().max(50).optional().nullable(),
    mileage: z.number().int().min(0).max(1_000_000).optional(),
    rentalSlot: z.number().int().min(1).optional().nullable(),
    marketValue: z.number().int().min(0).optional().nullable(),
    salePrice: z.number().int().min(0).optional().nullable(),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

const BatchBody = z
  .object({
    modelId: z.number().int().positive(),
    baseStatus: ScooterBaseStatusEnum,
    purchaseBatch: z.string().trim().max(120).optional().nullable(),
    purchaseDate: z.string().optional().nullable(),
    /** Цена закупа ЗА ЕДИНИЦУ — только с правом на прибыль. */
    purchasePrice: z.number().int().min(0).optional().nullable(),
    isPartner: z.boolean().optional(),
    investorId: z.number().int().positive().optional().nullable(),
    /**
     * Модель ещё не отмечена под эту категорию (например, продаём модель,
     * которую раньше только сдавали) — отметить её заодно.
     */
    enableModelPurpose: z.boolean().optional(),
    units: z.array(BatchUnit).min(1).max(50),
  })
  .strict();

/**
 * 2.0.3: правка партии после создания. `ids` — все единицы партии, как их
 * видит окно (сверяем, что партию не меняли параллельно); `batch` — её
 * текущее название. Поля, которых нет в запросе, не трогаем.
 */
const BatchMove = z.object({
  to: z.enum(["rental_pool", "for_sale", "buyout", "ready"]),
  ids: z.array(z.number().int().positive()).min(1).max(200),
});
type BatchMoveTo = z.infer<typeof BatchMove>["to"];

const BatchEditBody = z
  .object({
    ids: z.array(z.number().int().positive()).min(1).max(200),
    batch: z.string().trim().min(1).max(120),
    rename: z.string().trim().min(1).max(120).optional(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    /** Закуп за единицу — только с правом на прибыль. */
    purchasePrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
    /**
     * Правки 7.0 (п.15): свой закуп по каждой модели партии. modelId=null —
     * единицы без модели в каталоге. Важнее общего purchasePrice.
     */
    purchaseByModel: z
      .array(
        z.object({
          modelId: z.number().int().positive().nullable(),
          price: z.number().int().min(0).max(100_000_000).nullable(),
        }),
      )
      .max(30)
      .optional(),
    /** Цена продажи — тем, кто после правки на витрине. */
    salePrice: z.number().int().min(0).max(100_000_000).nullable().optional(),
    /**
     * Раскладка по статусам (18.09, заказчик: «двое в аренду, пятеро на
     * продажу, двое в выкуп» — за одно сохранение). Единица — в одном
     * направлении.
     */
    moves: z.array(BatchMove).max(4).optional(),
    /** Одно направление — как было в первой версии окна. */
    status: BatchMove.optional(),
    enableModelPurpose: z.boolean().optional(),
  })
  .strict();

/** Ключ партии — как на фронте (suggestKey): регистр, пробелы по краям, «ё». */
function batchKey(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase().replace(/ё/g, "е");
}

/** Статусы арендного контура: модель должна быть «сдаём». */
const RENT_CONTOUR = ["rental_pool", "repair", "dtp", "disassembly"];
/** Служебные номера в названии техники без арендного номера — отсюда. */
const SERVICE_NAME_FROM = 1001;

/** Как на фронте (ModelPicker): enum — для старых мест, префикс — для имени. */
function legacyModelEnum(name: string): "jog" | "gear" | "honda" | "tank" {
  const l = name.toLowerCase();
  if (l.includes("jog")) return "jog";
  if (l.includes("gear")) return "gear";
  if (l.includes("honda")) return "honda";
  if (l.includes("tank")) return "tank";
  return "jog";
}
/**
 * Номер рамы для сравнения: заглавные, без пробелов, кириллица-двойник →
 * латиница. В проде есть рама Gear с русской «А» (UА06J…) — без этого та же
 * рама латиницей прошла бы проверку на дубль.
 */
const VIN_CYR = "АВЕКМНОРСТУХ";
const VIN_LAT = "ABEKMHOPCTYX";
function normVin(v: string): string {
  return v
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[АВЕКМНОРСТУХ]/g, (ch) => VIN_LAT[VIN_CYR.indexOf(ch)] ?? ch);
}
const vinKeySql = sql`translate(upper(${scooters.vin}), ${VIN_CYR}, ${VIN_LAT})`;
const HAS_CYRILLIC = /[А-Яа-яЁё]/;
/**
 * Рама и номер рамы в запросе на создание/правку — латиницей (16.09):
 * двойники заменяем, прочие русские буквы — ошибка.
 */
function latinVinFields<T extends { vin?: string | null; frameNumber?: string | null }>(
  data: T,
): { ok: true; data: T } | { ok: false; message: string } {
  const out = { ...data };
  for (const k of ["vin", "frameNumber"] as const) {
    const v = out[k];
    if (typeof v !== "string") continue;
    const fixed = normVin(v);
    if (HAS_CYRILLIC.test(fixed)) {
      return { ok: false, message: "Номер рамы пишется только латиницей." };
    }
    (out as Record<string, unknown>)[k] = fixed || null;
  }
  return { ok: true, data: out };
}

/** Сколько минут после добавления партию можно отменить целиком. */
const UNDO_MINUTES = 10;
/** Таблицы, где техника уже «пошла в работу», — тогда отменять нельзя. */
const SCOOTER_LINKS: { table: string; column: string; label: string }[] = [
  { table: "rentals", column: "scooter_id", label: "аренда" },
  { table: "sale_deals", column: "scooter_id", label: "сделка продажи" },
  { table: "buyout_deals", column: "scooter_id", label: "выкуп" },
  { table: "scooter_documents", column: "scooter_id", label: "документы" },
  { table: "scooter_maintenance", column: "scooter_id", label: "обслуживание" },
  { table: "repair_jobs", column: "scooter_id", label: "ремонт" },
  { table: "rental_incidents", column: "scooter_id", label: "инцидент" },
  { table: "scooter_swaps", column: "new_scooter_id", label: "замена" },
  { table: "scooter_swaps", column: "prev_scooter_id", label: "замена" },
];

function namePrefix(modelName: string): string {
  const parts = modelName.trim().split(/\s+/);
  return parts[parts.length - 1] || "Scooter";
}

const directorOnly = requireRole("director");

/**
 * Имя техники для журнала/сообщений без исторической «решётки».
 * Правка заказчика 24.08: формата «Jog #03» в CRM быть не должно —
 * номер заведения оператору ничего не говорит, значим арендный номер.
 */
export function scooterLabel(name: string, slot?: number | null): string {
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

/**
 * Правки 7.0 (п.5): два ряда номеров — бензин и электро. У каждого своё
 * количество номеров и своя нумерация с 1; номер уникален внутри ряда.
 * Ряд определяет модель (флаг «электро» в каталоге).
 */
export type SlotPool = "petrol" | "electric";
const POOL_TOTAL_KEY: Record<SlotPool, string> = {
  petrol: "rental_slots_total",
  electric: "rental_slots_total_electric",
};
const POOL_RU: Record<SlotPool, string> = { petrol: "бензин", electric: "электро" };
type SlotTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function poolOfModel(
  modelId: number | null | undefined,
  ex: SlotTx | typeof db = db,
): Promise<SlotPool> {
  if (modelId == null) return "petrol";
  const [m] = await ex
    .select({ electric: scooterModels.isElectric })
    .from(scooterModels)
    .where(eq(scooterModels.id, modelId));
  return m?.electric ? "electric" : "petrol";
}

async function getSlotsTotal(
  pool: SlotPool = "petrol",
  ex: SlotTx | typeof db = db,
): Promise<number> {
  const [row] = await ex
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, POOL_TOTAL_KEY[pool]));
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

async function getUsedSlots(
  pool: SlotPool = "petrol",
  ex: SlotTx | typeof db = db,
): Promise<
  { slot: number; id: number; name: string }[]
> {
  const rows = await ex
    .select({
      slot: scooters.rentalSlot,
      id: scooters.id,
      name: scooters.name,
    })
    .from(scooters)
    .where(
      and(
        isNotNull(scooters.rentalSlot),
        eq(scooters.slotPool, pool),
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
    const [total, used, eTotal, eUsed] = await Promise.all([
      getSlotsTotal("petrol"),
      getUsedSlots("petrol"),
      getSlotsTotal("electric"),
      getUsedSlots("electric"),
    ]);
    // Верхний уровень — бензин (как раньше); электро — своим рядом (правки 7.0).
    return {
      total,
      used,
      free: freeSlotList(total, used),
      electric: { total: eTotal, used: eUsed, free: freeSlotList(eTotal, eUsed) },
    };
  });

  /**
   * Пункт 15: изменить общее количество мест в арендном парке (вручную).
   * Нельзя опустить ниже максимального занятого номера — сначала
   * освободите места (переведите технику из аренды).
   */
  app.post<{ Body: { total?: number; pool?: SlotPool } }>("/slots-total", async (req, reply) => {
    const total = Number(req.body?.total);
    const pool: SlotPool = req.body?.pool === "electric" ? "electric" : "petrol";
    if (!Number.isFinite(total) || total < 0 || total > 999) {
      return reply.code(400).send({ error: "bad total" });
    }
    const used = await getUsedSlots(pool);
    const maxUsed = used.length ? used[used.length - 1]!.slot : 0;
    if (total < maxUsed) {
      return reply.code(409).send({
        error: "slots_in_use",
        message: `Занят номер ${maxUsed}${pool === "electric" ? " у электро" : ""} — сначала освободите номера выше ${total} (переведите технику из аренды).`,
      });
    }
    const prev = await getSlotsTotal(pool);
    await db
      .insert(appSettings)
      .values({ key: POOL_TOTAL_KEY[pool], value: String(total) })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: String(total) },
      });
    const what = pool === "electric" ? "номеров электро" : "мест в арендном парке";
    await logActivity(req, {
      entity: "scooter",
      entityId: null,
      action: "rental_slots_total_changed",
      summary: `Изменено количество ${what}: ${prev} → ${total}`,
      diff: {
        total: {
          label: pool === "electric" ? "Номеров электро" : "Мест в арендном парке",
          from: prev,
          to: total,
          kind: "number",
        },
      },
    });
    return { total, pool };
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
    const parsed0 = CreateScooterBody.safeParse(req.body);
    if (!parsed0.success) {
      return reply.code(400).send({ error: "validation", issues: parsed0.error.issues });
    }
    const latin = latinVinFields(parsed0.data);
    if (!latin.ok) return reply.code(400).send({ error: "vin_not_latin", message: latin.message });
    const parsed = { ...parsed0, data: latin.data };
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
    // Правки 7.0 (п.5): у электро свой ряд номеров.
    const pool = await poolOfModel(parsed.data.modelId);
    if (holdsSlot(status)) {
      const [total, used] = await Promise.all([getSlotsTotal(pool), getUsedSlots(pool)]);
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
            message: `Все ${total} номеров ${pool === "electric" ? "электро" : "арендного парка"} заняты. Увеличьте количество номеров или освободите один.`,
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
          slotPool: pool,
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

  /**
   * POST /api/scooters/batch — партия техники одной транзакцией
   * (релиз 2.0.1). Либо добавляются все единицы, либо ни одной: ошибки
   * возвращаются по строкам, чтобы форма подсветила конкретную ячейку.
   */
  app.post("/batch", async (req, reply) => {
    const parsed = BatchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const body = parsed.data;
    const units = body.units.map((u) => ({
      ...u,
      vin: u.vin ? normVin(u.vin) || null : null,
      engineNo: u.engineNo || null,
      color: u.color || null,
      note: u.note || null,
    }));
    const status = body.baseStatus;
    const role = req.user!.role as string;
    const canProfit = !!req.perms?.["data.profit"];

    const [model] = await db
      .select()
      .from(scooterModels)
      .where(eq(scooterModels.id, body.modelId));
    if (!model) {
      return reply.code(404).send({ error: "model_not_found", message: "Модель не найдена." });
    }

    // Назначение модели: продажную модель в аренду не заводим и наоборот.
    const needRent = RENT_CONTOUR.includes(status);
    const needSale = status === "for_sale" || status === "sold";
    const missingPurpose =
      (needRent && !model.forRent) || (needSale && !model.forSale);
    if (missingPurpose) {
      const canEditModel = role === "director" || role === "admin" || role === "creator";
      if (!body.enableModelPurpose || !canEditModel) {
        return reply.code(409).send({
          error: needRent ? "model_not_for_rent" : "model_not_for_sale",
          message: needRent
            ? `Модель «${model.name}» не отмечена для аренды. Отметьте «Сдаём в аренду» в «Модели».`
            : `Модель «${model.name}» не отмечена для продажи. Отметьте «Продаём» в «Модели».`,
        });
      }
    }

    type RowError = { index: number; field: string; message: string };
    const rowsMessage = (errs: RowError[]) =>
      errs.length === 1
        ? `Строка ${errs[0]!.index + 1}: ${errs[0]!.message}`
        : `Исправьте строки: ${[...new Set(errs.map((e) => e.index + 1))].join(", ")} — они подсвечены.`;
    const rowErrors: RowError[] = [];

    units.forEach((u, i) => {
      if (u.vin && HAS_CYRILLIC.test(u.vin)) {
        rowErrors.push({ index: i, field: "vin", message: "Рама пишется только латиницей." });
      }
    });
    // Рама: без дублей внутри партии и с уже заведённой техникой. В базе
    // номер рамы уникален и среди архива — говорим об этом прямо.
    const vins = units.map((u) => u.vin).filter((v): v is string => !!v);
    const seen = new Map<string, number>();
    units.forEach((u, i) => {
      if (!u.vin) return;
      const first = seen.get(u.vin);
      if (first != null) {
        rowErrors.push({
          index: i,
          field: "vin",
          message: `Такой номер рамы уже в строке ${first + 1}.`,
        });
      } else seen.set(u.vin, i);
    });
    if (vins.length) {
      const dups = await db
        .select({
          vin: scooters.vin,
          name: scooters.name,
          slot: scooters.rentalSlot,
          uid: scooters.uid,
          archivedAt: scooters.archivedAt,
          deletedAt: scooters.deletedAt,
        })
        .from(scooters)
        .where(inArray(vinKeySql, vins));
      for (const d of dups) {
        units.forEach((u, i) => {
          if (u.vin !== normVin(d.vin ?? "")) return;
          const where = d.deletedAt
            ? " (удалена, ждёт очистки)"
            : d.archivedAt
              ? " (в архиве)"
              : "";
          rowErrors.push({
            index: i,
            field: "vin",
            message: `Такая рама уже есть: «${scooterLabel(d.name, d.slot)}»${d.slot == null && d.uid ? ` · ID ${d.uid}` : ""}${where}.`,
          });
        });
      }
    }

    // Явные номера — без повторов внутри партии.
    const holds = holdsSlot(status);
    if (holds) {
      const firstBySlot = new Map<number, number>();
      units.forEach((u, i) => {
        if (u.rentalSlot == null) return;
        const first = firstBySlot.get(u.rentalSlot);
        if (first != null) {
          rowErrors.push({
            index: i,
            field: "rentalSlot",
            message: `Номер ${u.rentalSlot} уже выбран в строке ${first + 1}.`,
          });
        } else firstBySlot.set(u.rentalSlot, i);
      });
    }
    if (rowErrors.length) {
      return reply.code(409).send({
        error: "rows",
        message: rowsMessage(rowErrors),
        rows: rowErrors,
      });
    }

    const prefix = namePrefix(model.name);
    const legacy = legacyModelEnum(model.name);
    const purchasePrice =
      canProfit && body.purchasePrice != null ? body.purchasePrice : null;
    const investorId = body.investorId ?? null;
    const isPartner = investorId ? true : (body.isPartner ?? false);
    // Правки 7.0 (п.5): ряд номеров — по модели.
    const pool: SlotPool = model.isElectric ? "electric" : "petrol";

    type Inserted = typeof scooters.$inferSelect;
    type Result =
      | { ok: true; rows: Inserted[] }
      | { ok: false; code: number; payload: Record<string, unknown> };

    const result: Result = await db.transaction(async (tx) => {
      // Одна партия за раз: номера аренды и служебные имена раздаются
      // без гонки с соседним добавлением.
      await tx.execute(sql`select pg_advisory_xact_lock(815001)`);

      let slots: (number | null)[] = units.map(() => null);
      if (holds) {
        const total = await getSlotsTotal(pool, tx);
        const usedRows = await getUsedSlots(pool, tx);
        const busy = new Set(usedRows.map((r) => r.slot!));
        const errs: RowError[] = [];
        units.forEach((u, i) => {
          if (u.rentalSlot == null) return;
          if (u.rentalSlot > total) {
            errs.push({
              index: i,
              field: "rentalSlot",
              message: `Номер ${u.rentalSlot} больше общего количества номеров (${total}).`,
            });
          } else if (busy.has(u.rentalSlot)) {
            errs.push({
              index: i,
              field: "rentalSlot",
              message: `Номер ${u.rentalSlot} уже занят.`,
            });
          }
        });
        if (errs.length) {
          return {
            ok: false,
            code: 409,
            payload: { error: "rows", message: rowsMessage(errs), rows: errs },
          };
        }
        const explicit = new Set(
          units.map((u) => u.rentalSlot).filter((x): x is number => x != null),
        );
        const free: number[] = [];
        for (let n = 1; n <= total; n++) {
          if (!busy.has(n) && !explicit.has(n)) free.push(n);
        }
        const autoNeeded = units.filter((u) => u.rentalSlot == null).length;
        if (autoNeeded > free.length) {
          return {
            ok: false,
            code: 409,
            payload: {
              error: "no_free_slots",
              message: `Свободных номеров${pool === "electric" ? " электро" : ""}: ${free.length}, а в партии без номера: ${autoNeeded}. Увеличьте количество номеров или заведите часть партии в «Пока не решили».`,
              free: free.length,
              needed: autoNeeded,
            },
          };
        }
        let k = 0;
        slots = units.map((u) => u.rentalSlot ?? free[k++]!);
      }

      // Служебные имена «Jog #N» уникальны по всей базе, включая архив.
      const nameRows = await tx
        .select({ name: scooters.name })
        .from(scooters)
        .where(ilike(scooters.name, `${prefix} #%`));
      const usedNums = new Set<number>();
      for (const r of nameRows) {
        const m = r.name.match(/^(.*?)\s*#\s*0*(\d+)\s*$/);
        if (m && m[1]!.trim().toLowerCase() === prefix.toLowerCase()) {
          usedNums.add(Number(m[2]));
        }
      }
      let next = SERVICE_NAME_FROM;
      const names = slots.map((slot) => {
        // В аренде служебный номер совпадает с арендным, если свободен.
        if (slot != null && !usedNums.has(slot)) {
          usedNums.add(slot);
          return `${prefix} #${String(slot).padStart(2, "0")}`;
        }
        while (usedNums.has(next)) next++;
        usedNums.add(next);
        return `${prefix} #${next}`;
      });

      if (missingPurpose) {
        await tx
          .update(scooterModels)
          .set(
            needRent
              ? { forRent: true, updatedAt: new Date() }
              : { forSale: true, updatedAt: new Date() },
          )
          .where(eq(scooterModels.id, model.id));
      }

      const rows = await tx
        .insert(scooters)
        .values(
          units.map((u, i) => ({
            name: names[i]!,
            model: legacy,
            modelId: model.id,
            vin: u.vin,
            frameNumber: u.vin,
            engineNo: u.engineNo,
            uid: uidFromVin(u.vin),
            year: u.year ?? null,
            color: u.color,
            mileage: u.mileage ?? 0,
            baseStatus: status,
            rentalSlot: slots[i] ?? null,
            slotPool: pool,
            purchaseDate: body.purchaseDate || null,
            purchasePrice,
            purchaseBatch: body.purchaseBatch || null,
            marketValue: u.marketValue ?? null,
            salePrice: u.salePrice ?? null,
            note: u.note,
            isPartner,
            investorId,
          })),
        )
        .returning();
      // Порядок строк ответа = порядок строк формы.
      rows.sort((a, b) => a.id - b.id);
      return { ok: true, rows };
    });

    if (!result.ok) return reply.code(result.code).send(result.payload);

    if (missingPurpose) {
      await logActivity(req, {
        entity: "model",
        entityId: model.id,
        action: "updated",
        summary: `Модель «${model.name}» отмечена: ${needRent ? "сдаём в аренду" : "продаём"} — при добавлении техники`,
      });
    }
    const n = result.rows.length;
    const where =
      status === "rental_pool"
        ? "в арендный парк"
        : status === "for_sale"
          ? "на продажу"
          : status === "buyout"
            ? "в выкуп"
            : `со статусом «${scooterStatusLabel(status)}»`;
    for (const [i, row] of result.rows.entries()) {
      const bits = [
        `Добавлена техника «${scooterLabel(row.name, row.rentalSlot)}» ${where}`,
        body.purchaseBatch ? `партия «${body.purchaseBatch}»` : null,
        n > 1 ? `${i + 1} из ${n}` : null,
        row.vin ? `рама ${row.vin}` : null,
        row.salePrice != null
          ? `цена продажи ${row.salePrice.toLocaleString("ru-RU")} ₽`
          : null,
      ].filter(Boolean);
      await logActivity(req, {
        entity: "scooter",
        entityId: row.id,
        action: "created",
        summary: bits.join(" · "),
        meta: {
          batch: body.purchaseBatch ?? null,
          batchSize: n,
          batchIndex: i + 1,
          ...(purchasePrice != null ? { purchasePrice } : {}),
        },
      });
    }
    return reply.code(201).send({ items: result.rows });
  });

  /**
   * POST /api/scooters/batch/undo — «Отменить» в тосте после добавления
   * партии (2.0.1). Узкое окно: только своя техника, не старше 10 минут и
   * без аренд, сделок, документов и ремонтов. Иначе — архив из карточки
   * с ключом директора, как раньше.
   */
  app.post("/batch/undo", async (req, reply) => {
    const parsed = z
      .object({ ids: z.array(z.number().int().positive()).min(1).max(50) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const ids = [...new Set(parsed.data.ids)];
    const userId = req.user!.userId;

    const rows = await db
      .select({
        id: scooters.id,
        name: scooters.name,
        slot: scooters.rentalSlot,
        batch: scooters.purchaseBatch,
        createdAt: scooters.createdAt,
        archivedAt: scooters.archivedAt,
        deletedAt: scooters.deletedAt,
      })
      .from(scooters)
      .where(inArray(scooters.id, ids));
    if (rows.length !== ids.length || rows.some((r) => r.archivedAt || r.deletedAt)) {
      return reply.code(409).send({
        error: "undo_gone",
        message: "Часть техники уже в архиве или удалена — отменить добавление нельзя.",
      });
    }
    const oldest = Math.min(...rows.map((r) => new Date(r.createdAt).getTime()));
    if (Date.now() - oldest > UNDO_MINUTES * 60_000) {
      return reply.code(409).send({
        error: "undo_expired",
        message: `Отменить можно в течение ${UNDO_MINUTES} минут после добавления. Уберите технику в архив из карточки.`,
      });
    }
    const mine = await db
      .select({ id: activityLog.entityId })
      .from(activityLog)
      .where(
        and(
          eq(activityLog.entity, "scooter"),
          eq(activityLog.action, "created"),
          eq(activityLog.userId, userId),
          inArray(activityLog.entityId, ids),
        ),
      );
    const mineSet = new Set(mine.map((m) => m.id));
    if (ids.some((id) => !mineSet.has(id))) {
      return reply.code(403).send({
        error: "undo_not_owner",
        message: "Отменить добавление может только тот, кто добавил технику.",
      });
    }
    const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    const busy = new Set<string>();
    for (const l of SCOOTER_LINKS) {
      const res = await db.execute(
        sql`select 1 from ${sql.identifier(l.table)} where ${sql.identifier(l.column)} in (${idList}) limit 1`,
      );
      if ((res as unknown as unknown[]).length > 0) busy.add(l.label);
    }
    if (busy.size) {
      return reply.code(409).send({
        error: "undo_linked",
        message: `С техникой уже работали (${[...busy].join(", ")}) — отменить добавление нельзя.`,
      });
    }

    await db.delete(scooters).where(inArray(scooters.id, ids));

    const n = rows.length;
    for (const r of rows.sort((a, b) => a.id - b.id)) {
      await logActivity(req, {
        entity: "scooter",
        entityId: r.id,
        action: "creation_undone",
        summary: [
          `Отменено добавление «${scooterLabel(r.name, r.slot)}»`,
          r.batch ? `партия «${r.batch}»` : null,
          n > 1 ? `вся партия — ${n} шт.` : null,
          r.slot != null ? `номер ${r.slot} снова свободен` : null,
        ]
          .filter(Boolean)
          .join(" · "),
        meta: { batch: r.batch ?? null, batchSize: n },
      });
    }
    return { deleted: n };
  });

  /**
   * POST /api/scooters/batch/edit — правка партии после создания (2.0.3).
   *
   * Заказчик 18.09: «возможность редактирования партии после её создания:
   * статус, партию». Номер партии, дата и закуп меняются у всех единиц
   * сразу, статус — у выбранных. Смена статуса — один ключ директора на
   * всю партию, а не по разу на каждую карточку. Правила те же, что в
   * карточке: техника в аренде, в выкупе по договору, проданная и в
   * архиве статус здесь не меняет; в аренду — со свободным номером.
   */
  app.post("/batch/edit", async (req, reply) => {
    const parsed = BatchEditBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const body = parsed.data;
    const role = req.user!.role as string;
    const canProfit = !!req.perms?.["data.profit"];
    const key = batchKey(body.batch);
    const ids = [...new Set(body.ids)];

    const changedMsg = {
      error: "batch_changed",
      message: "Партию изменили, пока окно было открыто. Закройте окно и откройте партию снова.",
    };
    const units = await db.select().from(scooters).where(inArray(scooters.id, ids));
    if (units.length !== ids.length || units.some((u) => u.deletedAt || batchKey(u.purchaseBatch) !== key)) {
      return reply.code(409).send(changedMsg);
    }
    // В партию могли добавить технику — тогда окно видит не всю партию.
    const [{ n: inBatch } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(scooters)
      .where(
        and(
          isNull(scooters.deletedAt),
          sql`replace(lower(trim(${scooters.purchaseBatch})), 'ё', 'е') = ${key}`,
        ),
      );
    if (inBatch !== ids.length) return reply.code(409).send(changedMsg);

    const rename = body.rename && body.rename !== body.batch.trim() ? body.rename : null;
    // Куда переводим: партия может разойтись по нескольким статусам сразу.
    const targetOf = new Map<number, BatchMoveTo>();
    for (const m of [...(body.moves ?? []), ...(body.status ? [body.status] : [])]) {
      for (const id of m.ids) {
        if (!ids.includes(id) || targetOf.has(id)) {
          return reply.code(400).send({
            error: "validation",
            message: "Статус меняется только у техники этой партии, у каждой единицы — одно направление.",
          });
        }
        targetOf.set(id, m.to);
      }
    }
    const moving = units.filter((u) => targetOf.has(u.id));

    // ── Кому статус здесь менять нельзя — и почему ──
    type RowError = { id: number; message: string };
    const rowErrors: RowError[] = [];
    if (moving.length) {
      const movingIds = moving.map((u) => u.id);
      const liveRentals = await db
        .select({ id: rentals.id, scooterId: rentals.scooterId })
        .from(rentals)
        .where(and(inArray(rentals.scooterId, movingIds), eq(rentals.status, "active")));
      const liveBuyouts = await db
        .select({ id: buyoutDeals.id, scooterId: buyoutDeals.scooterId })
        .from(buyoutDeals)
        .where(
          and(
            inArray(buyoutDeals.scooterId, movingIds),
            inArray(buyoutDeals.status, ["contract", "active"]),
          ),
        );
      const IN_CARD: Record<string, string> = {
        repair: "на ремонте — статус меняется в карточке",
        dtp: "после ДТП — статус меняется в карточке",
        disassembly: "в разборке — статус меняется в карточке",
      };
      for (const u of moving) {
        const target = targetOf.get(u.id)!;
        const rent = liveRentals.find((r) => r.scooterId === u.id);
        const buy = liveBuyouts.find((b) => b.scooterId === u.id);
        const msg = u.archivedAt
          ? "в архиве"
          : u.baseStatus === "sold"
            ? "продана"
            : u.baseStatus === target
              ? `уже «${scooterStatusLabel(target)}»`
              : rent
                ? `в аренде по договору #${String(rent.id).padStart(4, "0")} — сначала завершите аренду`
                : buy
                  ? "в выкупе по договору — статус меняется в «Выкупе»"
                  : IN_CARD[u.baseStatus]
                    ? IN_CARD[u.baseStatus]
                    : target === "buyout" && u.isPartner
                      ? "партнёрская — в выкуп нельзя"
                      : null;
        if (msg) {
          // Без номера и рамы «Gear» не отличить от соседних — добавляем ID или цвет.
          const who = [scooterLabel(u.name, u.rentalSlot), u.uid ? `ID ${u.uid}` : u.color].filter(Boolean).join(" · ");
          rowErrors.push({ id: u.id, message: `${who}: ${msg}` });
        }
      }
    }
    if (rowErrors.length) {
      return reply.code(409).send({
        error: "rows",
        message:
          rowErrors.length === 1
            ? `Статус не меняется — ${rowErrors[0]!.message}.`
            : `Статус не меняется у ${rowErrors.length} единиц — они подсвечены.`,
        rows: rowErrors,
      });
    }

    // ── Модель должна подходить под категорию (как при добавлении) ──
    const modelsOf = (to: BatchMoveTo) =>
      new Set(
        moving
          .filter((u) => targetOf.get(u.id) === to)
          .map((u) => u.modelId)
          .filter((x): x is number => x != null),
      );
    const rentModelIds = modelsOf("rental_pool");
    const saleModelIds = modelsOf("for_sale");
    const modelIds = [...new Set([...rentModelIds, ...saleModelIds])];
    const models = modelIds.length
      ? await db.select().from(scooterModels).where(inArray(scooterModels.id, modelIds))
      : [];
    const missingRent = models.filter((m) => rentModelIds.has(m.id) && !m.forRent);
    const missingSale = models.filter((m) => saleModelIds.has(m.id) && !m.forSale);
    if (missingRent.length || missingSale.length) {
      const canEditModel = role === "director" || role === "admin" || role === "creator";
      if (!body.enableModelPurpose || !canEditModel) {
        const rent = missingRent.length > 0;
        const names = (rent ? missingRent : missingSale).map((m) => `«${m.name}»`).join(", ");
        return reply.code(409).send({
          error: rent ? "model_not_for_rent" : "model_not_for_sale",
          message: rent
            ? `Модель ${names} не отмечена для аренды. Отметьте «Сдаём в аренду» в «Модели».`
            : `Модель ${names} не отмечена для продажи. Отметьте «Продаём» в «Модели».`,
        });
      }
    }

    // ── Ключ директора: один на всю партию ──
    if (moving.length) {
      if (!(await requireDirectorApproval(app, req, reply, "scooter_status_change"))) return;
    }

    type Row = typeof scooters.$inferSelect;
    type Result =
      | { ok: true; changed: { before: Row; after: Row }[] }
      | { ok: false; code: number; payload: Record<string, unknown> };

    const result: Result = await db.transaction(async (tx) => {
      // Номера аренды раздаются без гонки с добавлением техники.
      await tx.execute(sql`select pg_advisory_xact_lock(815001)`);

      const slotFor = new Map<number, number>();
      /** Правки 7.0 (п.5): ряд номеров единицы — по модели. */
      const poolFor = new Map<number, SlotPool>();
      {
        const entering = moving
          .filter((u) => holdsSlot(targetOf.get(u.id)!) && !holdsSlot(u.baseStatus))
          .sort((a, b) => a.id - b.id);
        if (entering.length) {
          const modelIds = [...new Set(entering.map((u) => u.modelId).filter((x): x is number => x != null))];
          const electricIds = new Set(
            modelIds.length
              ? (
                  await tx
                    .select({ id: scooterModels.id })
                    .from(scooterModels)
                    .where(and(inArray(scooterModels.id, modelIds), eq(scooterModels.isElectric, true)))
                ).map((m) => m.id)
              : [],
          );
          for (const pool of ["petrol", "electric"] as SlotPool[]) {
            const group = entering.filter(
              (u) => (u.modelId != null && electricIds.has(u.modelId) ? "electric" : "petrol") === pool,
            );
            if (!group.length) continue;
            const total = await getSlotsTotal(pool, tx);
            const free = freeSlotList(total, await getUsedSlots(pool, tx));
            if (group.length > free.length) {
              return {
                ok: false,
                code: 409,
                payload: {
                  error: "no_free_slots",
                  pool,
                  message: `Свободных номеров ${pool === "electric" ? "электро" : "бензина"}: ${free.length}, а в аренду переводим ${group.length}. Увеличьте количество номеров или выберите меньше единиц.`,
                  free: free.length,
                  needed: group.length,
                },
              };
            }
            group.forEach((u, i) => {
              slotFor.set(u.id, free[i]!);
              poolFor.set(u.id, pool);
            });
          }
        }
      }

      if (missingRent.length) {
        await tx
          .update(scooterModels)
          .set({ forRent: true, updatedAt: new Date() })
          .where(inArray(scooterModels.id, missingRent.map((m) => m.id)));
      }
      if (missingSale.length) {
        await tx
          .update(scooterModels)
          .set({ forSale: true, updatedAt: new Date() })
          .where(inArray(scooterModels.id, missingSale.map((m) => m.id)));
      }

      const changed: { before: Row; after: Row }[] = [];
      for (const u of [...units].sort((a, b) => a.id - b.id)) {
        const set: Partial<Row> = {};
        if (rename && u.purchaseBatch !== rename) set.purchaseBatch = rename;
        if (body.purchaseDate !== undefined && (u.purchaseDate ?? null) !== body.purchaseDate) {
          set.purchaseDate = body.purchaseDate;
        }
        // Закуп: своя цена модели (правки 7.0) важнее общей.
        const byModel = body.purchaseByModel?.find((p) => (p.modelId ?? null) === (u.modelId ?? null));
        const newCost = byModel ? byModel.price : body.purchasePrice;
        if (canProfit && (byModel || body.purchasePrice !== undefined) && u.purchasePrice !== newCost) {
          set.purchasePrice = newCost ?? null;
        }
        const target = targetOf.get(u.id);
        if (target) {
          set.baseStatus = target;
          const was = holdsSlot(u.baseStatus);
          const will = holdsSlot(target);
          if (will && !was) {
            set.rentalSlot = slotFor.get(u.id) ?? null;
            set.slotPool = poolFor.get(u.id) ?? "petrol";
          }
          if (was && !will) {
            set.rentalSlot = null;
            if (u.rentalSlot != null) set.exRentalSlot = u.rentalSlot;
          }
        }
        const finalStatus = set.baseStatus ?? u.baseStatus;
        if (
          body.salePrice !== undefined &&
          finalStatus === "for_sale" &&
          !u.archivedAt &&
          u.salePrice !== body.salePrice
        ) {
          set.salePrice = body.salePrice;
        }
        if (Object.keys(set).length === 0) continue;
        const [after] = await tx
          .update(scooters)
          .set({ ...set, updatedAt: sql`now()` })
          .where(eq(scooters.id, u.id))
          .returning();
        if (after) changed.push({ before: u, after });
      }
      return { ok: true, changed };
    });

    if (!result.ok) return reply.code(result.code).send(result.payload);

    for (const [list, what] of [
      [missingRent, "сдаём в аренду"],
      [missingSale, "продаём"],
    ] as const) {
      for (const m of list) {
        await logActivity(req, {
          entity: "model",
          entityId: m.id,
          action: "updated",
          summary: `Модель «${m.name}» отмечена: ${what} — при правке партии`,
        });
      }
    }

    // ── Журнал: у каждой единицы — своя запись «было → стало» ──
    const label = rename ?? body.batch.trim();
    const n = units.length;
    const rub = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("ru-RU")} ₽`);
    const day = (v: string | null) => (v ? v.split("-").reverse().join(".") : "—");
    for (const { before, after } of result.changed) {
      const bits: string[] = [];
      const fieldChanges: { field: string; label: string; from: string; to: string }[] = [];
      if (before.purchaseBatch !== after.purchaseBatch) {
        bits.push(`партия «${before.purchaseBatch ?? "—"}» → «${after.purchaseBatch ?? "—"}»`);
        fieldChanges.push({ field: "purchaseBatch", label: "партия закупа", from: before.purchaseBatch ?? "—", to: after.purchaseBatch ?? "—" });
      }
      if ((before.purchaseDate ?? null) !== (after.purchaseDate ?? null)) {
        bits.push(`дата закупа ${day(before.purchaseDate)} → ${day(after.purchaseDate)}`);
        fieldChanges.push({ field: "purchaseDate", label: "дата закупа", from: day(before.purchaseDate), to: day(after.purchaseDate) });
      }
      if (before.baseStatus !== after.baseStatus) {
        bits.push(`статус «${scooterStatusLabel(before.baseStatus)}» → «${scooterStatusLabel(after.baseStatus)}»`);
        if (after.rentalSlot != null && before.rentalSlot == null) bits.push(`арендный номер ${after.rentalSlot}`);
        if (before.rentalSlot != null && after.rentalSlot == null) bits.push(`номер ${before.rentalSlot} освободился`);
      }
      if (before.salePrice !== after.salePrice) {
        bits.push(`цена продажи ${rub(before.salePrice)} → ${rub(after.salePrice)}`);
        fieldChanges.push({ field: "salePrice", label: "цена продажи", from: rub(before.salePrice), to: rub(after.salePrice) });
      }
      // Закуп — отдельным фрагментом: без права на прибыль он вырезается.
      if (before.purchasePrice !== after.purchasePrice) {
        bits.push(`закуп ${rub(before.purchasePrice)} → ${rub(after.purchasePrice)}`);
      }
      const statusChanged = before.baseStatus !== after.baseStatus;
      await logActivity(req, {
        entity: "scooter",
        entityId: after.id,
        action: statusChanged ? "status_changed" : "updated",
        summary: [`${scooterLabel(after.name, after.rentalSlot)} — правка партии «${label}»`, ...bits].join(" · "),
        meta: {
          scooterId: after.id,
          scooterName: after.name,
          source: "batch_edit",
          batch: label,
          batchSize: n,
          fieldChanges,
          ...(statusChanged ? { statusFrom: before.baseStatus, statusTo: after.baseStatus } : {}),
          ...(before.purchasePrice !== after.purchasePrice
            ? { purchasePrice: { from: before.purchasePrice, to: after.purchasePrice } }
            : {}),
        },
      });
    }

    return {
      items: result.changed.map((c) => c.after),
      changed: result.changed.length,
      statusChanged: result.changed.filter((c) => c.before.baseStatus !== c.after.baseStatus).length,
      slots: result.changed
        .filter((c) => c.after.rentalSlot != null && c.before.rentalSlot == null)
        .map((c) => c.after.rentalSlot),
    };
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed0 = PatchScooterBody.safeParse(req.body);
    if (!parsed0.success) {
      return reply.code(400).send({ error: "validation", issues: parsed0.error.issues });
    }
    const latin = latinVinFields(parsed0.data);
    if (!latin.ok) return reply.code(400).send({ error: "vin_not_latin", message: latin.message });
    const parsed = { ...parsed0, data: latin.data };
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

    // Правка 27.08: партнёрская техника — не наша, передать её в выкуп
    // нельзя (выкуп = переход права собственности от нас к клиенту).
    if (
      parsed.data.baseStatus === "buyout" &&
      (parsed.data.isPartner ?? before.isPartner)
    ) {
      return reply.code(409).send({
        error: "partner_no_buyout",
        message:
          "Партнёрская техника принадлежит инвестору — передать её в выкуп нельзя.",
      });
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
    // Правки 7.0 (п.5): ряд номеров — по модели. Сменили модель на модель
    // другого ряда (бензин ↔ электро) — номер выдаётся заново в новом ряду.
    const pool = await poolOfModel(parsed.data.modelId !== undefined ? parsed.data.modelId : before.modelId);
    const poolChanged = willHold && before.rentalSlot != null && before.slotPool !== pool;
    if (wantedSlot !== undefined || (willHold && !heldBefore) || poolChanged) {
      const [total, used] = await Promise.all([getSlotsTotal(pool), getUsedSlots(pool)]);
      const free = freeSlotList(
        total,
        used.filter((u) => u.id !== id),
      );
      patch.slotPool = pool;
      if (willHold) {
        if (wantedSlot != null) {
          if (wantedSlot > total)
            return reply.code(409).send({
              error: "slot_out_of_range",
              message: `Номер ${wantedSlot} больше общего количества номеров (${total}).`,
            });
          // Занятый номер взять нельзя: номер физически наклеен на скутер
          // (заказчик 06.09). Освобождается, когда техника уходит из аренды.
          if (!free.includes(wantedSlot))
            return reply.code(409).send({
              error: "slot_taken",
              message: `Номер ${wantedSlot} уже занят другой техникой.`,
            });
          patch.rentalSlot = wantedSlot;
        } else if (before.rentalSlot == null || wantedSlot === null || poolChanged) {
          // вход в парк без указания места (или явный сброс, или другой ряд) → авто
          if (free.length === 0)
            return reply.code(409).send({
              error: "no_free_slots",
              message: `Все ${total} номеров ${pool === "electric" ? "электро" : "арендного парка"} заняты. Увеличьте количество номеров или освободите один.`,
            });
          if (poolChanged && before.rentalSlot != null) patch.exRentalSlot = before.rentalSlot;
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
/**
     * Смена статуса техники пишется ПОДРОБНО (правка 31.08).
     *
     * Причина: у заказчика в парке «исчез» скутер, и по журналу нельзя было
     * понять, что именно произошло — строка «Статус X: A → B» не отвечала на
     * вопросы «а это точно та машина?», «где она физически?», «кто и когда».
     * Теперь в записи есть опознавательные данные (ID/VIN, номер в аренде,
     * пробег), последствие для парка и явный источник действия, а meta несёт
     * scooterId для клика — карточка открывается прямо из журнала.
     */
    /**
     * Правка 31.08: правки паспортных данных техники пишутся ПОИМЁННО.
     * Раньше любая правка давала одну строку «Отредактированы данные
     * техники» — по журналу нельзя было увидеть, что кто-то поменял номер
     * рамы или двигателя, а это как раз то, по чему технику опознают.
     * Теперь каждое поле — своей строкой «было → стало», и такие записи
     * ищутся в журнале по фильтру «Техника».
     */
    const TRACKED_FIELDS: {
      key: keyof typeof row & keyof typeof before;
      label: string;
    }[] = [
      { key: "frameNumber", label: "номер рамы" },
      { key: "vin", label: "VIN" },
      { key: "engineNo", label: "номер двигателя" },
      { key: "name", label: "название" },
      { key: "mileage", label: "пробег" },
      { key: "rentalSlot", label: "номер в аренде" },
      { key: "purchasePrice", label: "цена закупа" },
      { key: "salePrice", label: "цена продажи" },
      { key: "purchaseBatch", label: "партия закупа" },
      { key: "marketValue", label: "рыночная стоимость" },
      { key: "year", label: "год выпуска" },
      { key: "color", label: "цвет" },
    ];
    const fieldChanges = TRACKED_FIELDS.flatMap((f) => {
      const from = before[f.key];
      const to = row[f.key];
      if (from === to) return [];
      const fmtVal = (v: unknown) =>
        v == null || v === "" ? "—" : String(v);
      return [
        {
          field: String(f.key),
          label: f.label,
          from: fmtVal(from),
          to: fmtVal(to),
          text: `${f.label} ${fmtVal(from)} → ${fmtVal(to)}`,
        },
      ];
    });
    /** Смена паспортных номеров — повод присмотреться, помечаем отдельно. */
    const identityChanged = fieldChanges.some((c) =>
      ["frameNumber", "vin", "engineNo"].includes(c.field),
    );

    /**
     * «Выбыл из парка аренды» считаем по ДОСТУПНОСТИ К СДАЧЕ, а не по
     * занятому месту: ремонт и ДТП место держат, но сдавать такую технику
     * нельзя — и именно она пропадает из счётчика «N в парке». Ровно так у
     * заказчика «исчез» скутер, уехавший в ремонт.
     */
    const rentable = (st: string) => st === "rental_pool";
    const outOfPark = rentable(before.baseStatus) && !rentable(row.baseStatus);
    const backToPark = !rentable(before.baseStatus) && rentable(row.baseStatus);
    const ident = [
      row.uid ? `ID ${row.uid}` : null,
      row.frameNumber ? `рама ${row.frameNumber}` : null,
      row.mileage != null ? `пробег ${row.mileage.toLocaleString("ru-RU")} км` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    const consequence = outOfPark
      ? " · выбыл из парка аренды (сдавать нельзя)"
      : backToPark
        ? " · вернулся в парк аренды"
        : "";

    await logActivity(req, {
      entity: "scooter",
      entityId: id,
      action: statusChanged
        ? "status_changed"
        : identityChanged
          ? "identity_changed"
          : "updated",
      summary: statusChanged
        ? `Статус ${scooterLabel(row.name, row.rentalSlot)}: «${scooterStatusLabel(before.baseStatus)}» → «${scooterStatusLabel(row.baseStatus)}»${consequence}${ident ? ` · ${ident}` : ""} · вручную в карточке техники`
        : fieldChanges.length > 0
          ? `${scooterLabel(row.name, row.rentalSlot)}: ${fieldChanges.map((c) => c.text).join(" · ")}`
          : `Отредактированы данные техники ${scooterLabel(row.name, row.rentalSlot)}`,
      meta: {
        before,
        after: row,
        // Для клика по записи в журнале → карточка техники.
        scooterId: id,
        scooterName: row.name,
        statusFrom: before.baseStatus,
        statusTo: row.baseStatus,
        outOfPark,
        fieldChanges,
        identityChanged,
        source: "scooter_card",
      },
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
      /**
       * Правка 31.08: удаление НАВСЕГДА требует ключа директора.
       * Раньше ключ спрашивали при отправке в архив, а сам «стереть
       * навсегда» шёл без подтверждения — и техника исчезала из базы одним
       * кликом. Именно так на проде пропал скутер: архив и удаление прошли
       * в одну минуту.
       */
      if (!(await requireDirectorApproval(app, req, reply, "scooter_purge")))
        return;

      const name = sc.name;
      await db.delete(scooters).where(eq(scooters.id, id));
      /**
       * Правка 31.08 (по следам инцидента на проде): удаление навсегда —
       * единственная операция, после которой данных о технике в базе НЕ
       * остаётся. Раньше в журнал шла только строка с именем, и понять,
       * какую именно машину стёрли (VIN, рама, двигатель, пробег, статус),
       * было невозможно. Теперь в записи — полный опознавательный набор, а
       * в meta лежит СНИМОК всей строки: по нему технику можно опознать и
       * при необходимости завести заново.
       */
      const ident = [
        sc.uid ? `ID ${sc.uid}` : null,
        sc.frameNumber ? `рама ${sc.frameNumber}` : null,
        sc.engineNo ? `двигатель ${sc.engineNo}` : null,
        sc.mileage != null
          ? `пробег ${sc.mileage.toLocaleString("ru-RU")} км`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      await logActivity(req, {
        entity: "scooter",
        entityId: id,
        action: "deleted",
        summary:
          `УДАЛЁН НАВСЕГДА: ${scooterLabel(sc.name, sc.rentalSlot)}` +
          ` · статус на момент удаления «${scooterStatusLabel(sc.baseStatus)}»` +
          (sc.archivedReason ? ` · причина архивации: ${sc.archivedReason}` : "") +
          (ident ? ` · ${ident}` : "") +
          " · восстановить нельзя",
        meta: {
          snapshot: sc,
          scooterName: sc.name,
          statusFrom: sc.baseStatus,
          irreversible: true,
        },
      });
      return reply.code(204).send();
    },
  );
}
