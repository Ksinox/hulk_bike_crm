import type { FastifyInstance } from "fastify";
import { eq, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { priceGroups, priceItems, scooterModels } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { requireRole } from "../auth/plugin.js";

/**
 * Справочник цен (прейскурант).
 *   GET    /api/price-list                 — все группы + позиции
 *   POST   /api/price-list/groups          — создать группу
 *   PATCH  /api/price-list/groups/:id      — изменить группу
 *   DELETE /api/price-list/groups/:id      — удалить группу (cascade на позиции)
 *   POST   /api/price-list/items           — создать позицию
 *   PATCH  /api/price-list/items/:id       — изменить позицию
 *   DELETE /api/price-list/items/:id       — удалить позицию
 *
 * Чтение — для всех аутентифицированных. Изменения — director/creator.
 */
const staffOnly = requireRole("director");

const GroupBody = z.object({
  name: z.string().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
  hasTwoPrices: z.boolean().optional(),
  priceALabel: z.string().min(1).max(50).optional(),
  priceBLabel: z.string().max(50).nullable().optional(),
  scooterModelId: z.number().int().positive().nullable().optional(),
  /** При создании группы — опционально скопировать позиции из другой группы. */
  copyItemsFromGroupId: z.number().int().positive().nullable().optional(),
  /** Копировать с ценами или только названия (цены = 0). */
  copyWithPrices: z.boolean().optional(),
});

const ItemBody = z.object({
  groupId: z.number().int().positive(),
  name: z.string().min(1).max(200),
  priceA: z.number().int().min(0).nullable().optional(),
  priceB: z.number().int().min(0).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function priceListRoutes(app: FastifyInstance) {
  app.get("/", async () => {
    const groups = await db
      .select()
      .from(priceGroups)
      .orderBy(asc(priceGroups.sortOrder), asc(priceGroups.id));
    const items = await db
      .select()
      .from(priceItems)
      .orderBy(asc(priceItems.sortOrder), asc(priceItems.id));
    return {
      groups: groups.map((g) => ({
        ...g,
        items: items.filter((i) => i.groupId === g.id),
      })),
    };
  });

  app.post("/groups", { preHandler: staffOnly }, async (req, reply) => {
    const parsed = GroupBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const [row] = await db
      .insert(priceGroups)
      .values({
        name: parsed.data.name,
        sortOrder: parsed.data.sortOrder ?? 0,
        hasTwoPrices: parsed.data.hasTwoPrices ?? false,
        priceALabel: parsed.data.priceALabel ?? "Цена",
        priceBLabel: parsed.data.priceBLabel ?? null,
        scooterModelId: parsed.data.scooterModelId ?? null,
      })
      .returning();
    // Опционально копируем позиции из другой группы.
    if (parsed.data.copyItemsFromGroupId) {
      const src = await db
        .select()
        .from(priceItems)
        .where(eq(priceItems.groupId, parsed.data.copyItemsFromGroupId))
        .orderBy(asc(priceItems.sortOrder), asc(priceItems.id));
      if (src.length > 0) {
        const withPrices = parsed.data.copyWithPrices !== false;
        await db.insert(priceItems).values(
          src.map((s, i) => ({
            groupId: row!.id,
            name: s.name,
            priceA: withPrices ? s.priceA : null,
            priceB: withPrices ? s.priceB : null,
            sortOrder: i,
            note: s.note,
          })),
        );
      }
    }
    await logActivity(req, {
      entity: "price_group",
      entityId: row!.id,
      action: "created",
      summary: `Прейскурант: создана группа «${row!.name}»`,
    });
    return row;
  });

  app.patch<{ Params: { id: string } }>(
    "/groups/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const parsed = GroupBody.partial().safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      // copyItemsFromGroupId / copyWithPrices не идут в апдейт — это служебные поля для POST.
      const { copyItemsFromGroupId: _x, copyWithPrices: _y, ...patch } = parsed.data;
      void _x;
      void _y;
      const [row] = await db
        .update(priceGroups)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(priceGroups.id, id))
        .returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/groups/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(priceGroups)
        .where(eq(priceGroups.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });
      await db.delete(priceGroups).where(eq(priceGroups.id, id));
      await logActivity(req, {
        entity: "price_group",
        entityId: id,
        action: "deleted",
        summary: `Прейскурант: удалена группа «${row.name}»`,
      });
      return reply.code(204).send();
    },
  );

  app.post("/items", { preHandler: staffOnly }, async (req, reply) => {
    const parsed = ItemBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const [row] = await db
      .insert(priceItems)
      .values({
        groupId: parsed.data.groupId,
        name: parsed.data.name,
        priceA: parsed.data.priceA ?? null,
        priceB: parsed.data.priceB ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
        note: parsed.data.note ?? null,
      })
      .returning();
    return row;
  });

  app.patch<{ Params: { id: string } }>(
    "/items/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const parsed = ItemBody.partial().safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const [row] = await db
        .update(priceItems)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(priceItems.id, id))
        .returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/items/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      await db.delete(priceItems).where(eq(priceItems.id, id));
      return reply.code(204).send();
    },
  );

  /**
   * POST /api/price-list/_seed — заполнить дефолтным прейскурантом
   * (если ещё пусто). Идемпотентно: повторный вызов ничего не делает.
   * Список взят из прейскуранта заказчика на 27.04.2026.
   */
  app.post("/_seed", { preHandler: staffOnly }, async () => {
    const existing = await db.select({ id: priceGroups.id }).from(priceGroups);
    if (existing.length > 0) {
      return { ok: true, skipped: true, message: "Прейскурант уже заполнен" };
    }
    await seedDefaults();
    return { ok: true, skipped: false };
  });

  /**
   * POST /api/price-list/_reseed — снести всё и пересоздать дефолтный
   * прейскурант v2 (одна группа = одна модель). Деструктивно — все
   * правки в прейскуранте потеряются. UI показывает confirm перед вызовом.
   */
  app.post("/_reseed", { preHandler: staffOnly }, async (req) => {
    await db.delete(priceGroups);
    await seedDefaults();
    await logActivity(req, {
      entity: "price_group",
      entityId: null,
      action: "reseeded",
      summary: "Прейскурант пересоздан из шаблона (v2)",
    });
    return { ok: true };
  });
}

async function seedDefaults(): Promise<void> {
  // Ищем модели Yamaha Gear / Yamaha Jog в каталоге, чтобы привязать к ним
  // соответствующие группы «Детали». Если моделей нет — создаём общую группу
  // деталей без привязки (на случай свежей БД до настройки моделей).
  const models = await db.select().from(scooterModels);
  const findModel = (needle: string) =>
    models.find((m) => m.name.toLowerCase().includes(needle.toLowerCase()));
  const gearModel = findModel("gear");
  const jogModel = findModel("jog");

  // Полный список деталей: имя, цена для Gear, цена для Jog.
  // null — позиция не применяется к этой модели.
  const detailRows: ReadonlyArray<readonly [string, number | null, number | null]> = [
    ["Приборная панель", 5000, 4500],
    ["Передний обтекатель", 5500, 5500],
    ["Лыжа короткая", null, 2500],
    ["Лыжа длинная", null, 3500],
    ["Карман", 8500, 7500],
    ["Лючок аккумулятора", null, 1500],
    ["Боковые обтекатели (шт)", 5000, 4000],
    ["Фара", 4000, 2500],
    ["Передние поворотники", 2000, 2000],
    ["Ручка тормоза", 2000, 2000],
    ["Стоп сигнал в сборе", 4500, 4000],
    ["Задние поворотники", 2000, 2000],
    ["Сиденье", 3000, 3000],
    ["Крыло перед", 3500, 2500],
    ["Крыло зад", 3500, 2500],
    ["Зеркала комплект", 2000, 1500],
    ["Корзина", 2500, null],
    ["Багажник", 3000, 3000],
    ["Установленный багажник", 2000, 2000],
    ["Пластик пол", 5000, 5500],
    ["Защита радиатора", 1500, 1500],
    ["Колесный диск перед", 4000, 2500],
    ["Колесный диск зад", 4000, 2500],
    ["Глушитель", 5000, 4500],
    ["Подклювник", null, 3500],
    ["Резина", 3500, 2500],
  ];

  // Группа «Детали Yamaha Gear» — только позиции с ценой Gear.
  if (gearModel) {
    const [g] = await db
      .insert(priceGroups)
      .values({
        name: `Детали ${gearModel.name}`,
        sortOrder: 10,
        hasTwoPrices: false,
        priceALabel: "Цена",
        scooterModelId: gearModel.id,
      })
      .returning();
    const items = detailRows
      .filter(([, a]) => a != null)
      .map(([name, a], i) => ({
        groupId: g!.id,
        name,
        priceA: a as number,
        sortOrder: i,
      }));
    if (items.length > 0) await db.insert(priceItems).values(items);
  }

  // Группа «Детали Yamaha Jog» — только позиции с ценой Jog.
  if (jogModel) {
    const [g] = await db
      .insert(priceGroups)
      .values({
        name: `Детали ${jogModel.name}`,
        sortOrder: 11,
        hasTwoPrices: false,
        priceALabel: "Цена",
        scooterModelId: jogModel.id,
      })
      .returning();
    const items = detailRows
      .filter(([, , b]) => b != null)
      .map(([name, , b], i) => ({
        groupId: g!.id,
        name,
        priceA: b as number,
        sortOrder: i,
      }));
    if (items.length > 0) await db.insert(priceItems).values(items);
  }

  // Если моделей в БД нет — fallback: одна группа «Детали» без привязки,
  // с двумя колонками (legacy формат), чтобы прейскурант не остался пустым.
  if (!gearModel && !jogModel) {
    const [g] = await db
      .insert(priceGroups)
      .values({
        name: "Детали",
        sortOrder: 10,
        hasTwoPrices: true,
        priceALabel: "Gear 4t",
        priceBLabel: "Jog 36-39",
      })
      .returning();
    await db.insert(priceItems).values(
      detailRows.map(([name, a, b], i) => ({
        groupId: g!.id,
        name,
        priceA: a,
        priceB: b,
        sortOrder: i,
      })),
    );
  }

  // Общие группы (без привязки к модели — применимы ко всем).

  const [fines] = await db
    .insert(priceGroups)
    .values({
      name: "Штрафы и другое",
      sortOrder: 20,
      hasTwoPrices: false,
      priceALabel: "Цена",
    })
    .returning();
  await db.insert(priceItems).values(
    [
      ["Возврат мопеда со штраф-стоянки", 10000],
      ["Грязный мопед", 500],
      ["Перепробег", 1000],
      ["Езда на перегретом двигателе", 5000],
      ["Порча наклеек", 1500],
    ].map(([name, a], i) => ({
      groupId: fines!.id,
      name: name as string,
      priceA: a as number,
      sortOrder: i,
    })),
  );

  const [damages] = await db
    .insert(priceGroups)
    .values({
      name: "Повреждения",
      sortOrder: 30,
      hasTwoPrices: false,
      priceALabel: "Цена",
    })
    .returning();
  await db.insert(priceItems).values(
    [
      ["Прокол колеса", 1000],
      ["Согнутая подножка", 2500],
      ["Погнутая вилка", 4500],
    ].map(([name, a], i) => ({
      groupId: damages!.id,
      name: name as string,
      priceA: a as number,
      sortOrder: i,
    })),
  );

  const [gear] = await db
    .insert(priceGroups)
    .values({
      name: "Экипировка",
      sortOrder: 40,
      hasTwoPrices: false,
      priceALabel: "Цена",
    })
    .returning();
  await db.insert(priceItems).values(
    [
      ["Шлем", 1500],
      ["Шлем VIP", 3700],
      ["Держатель", 500],
      ["Цепь", 2500],
      ["Держатель (дополнительный)", 750],
      ["Термокороб", 2000],
      ["Резинка для термокороба", 200],
    ].map(([name, a], i) => ({
      groupId: gear!.id,
      name: name as string,
      priceA: a as number,
      sortOrder: i,
    })),
  );
}
