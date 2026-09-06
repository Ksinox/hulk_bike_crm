import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  priceItems,
  serviceOrderItems,
  serviceOrders,
  users,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { requireRole } from "../auth/plugin.js";

/**
 * Сторонние ремонты (задание 06.09).
 *
 * Заказ-наряд на ЧУЖУЮ технику: приняли — набрали работы из прайса —
 * дописали запчасти — посчитали выручку и прибыль — подтвердили оплату.
 * Своей техники здесь нет вовсе: марка и номер записаны текстом, потому
 * что скутер клиента в нашем парке не заведён.
 *
 * Деньги считаем на сервере, чтобы цифра была одна и та же везде:
 *   выручка      = Σ(цена × количество) по работам и запчастям
 *   себестоимость= Σ(закуп × количество) по запчастям
 *   прибыль      = выручка − себестоимость
 * Работы себестоимости не имеют — это наш труд.
 */

const directorOnly = requireRole("director");

const OrderBody = z.object({
  customerName: z.string().min(1).max(200),
  customerPhone: z.string().max(50).nullable().optional(),
  clientId: z.number().int().positive().nullable().optional(),
  vehicle: z.string().min(1).max(200),
  vehicleNumber: z.string().max(100).nullable().optional(),
  complaint: z.string().max(2000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  masterUserId: z.number().int().positive().nullable().optional(),
  acceptedAt: z.string().datetime().optional(),
});

const ItemBody = z.object({
  kind: z.enum(["work", "part"]),
  priceItemId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(300),
  qty: z.number().int().min(1).max(999).optional(),
  price: z.number().int().min(0).max(10_000_000).optional(),
  cost: z.number().int().min(0).max(10_000_000).optional(),
});

export type OrderTotals = {
  works: number;
  parts: number;
  revenue: number;
  cost: number;
  profit: number;
};

export function totalsOf(
  items: { kind: string; qty: number; price: number; cost: number }[],
): OrderTotals {
  let works = 0;
  let parts = 0;
  let cost = 0;
  for (const i of items) {
    const sum = i.price * i.qty;
    if (i.kind === "work") works += sum;
    else {
      parts += sum;
      cost += i.cost * i.qty;
    }
  }
  const revenue = works + parts;
  return { works, parts, revenue, cost, profit: revenue - cost };
}

async function loadOrders(where?: ReturnType<typeof and>) {
  const rows = await db
    .select()
    .from(serviceOrders)
    .where(where as never)
    .orderBy(desc(serviceOrders.acceptedAt), desc(serviceOrders.id));
  if (rows.length === 0) return [];
  const items = await db
    .select()
    .from(serviceOrderItems)
    .orderBy(asc(serviceOrderItems.sortOrder), asc(serviceOrderItems.id));
  return rows.map((o) => {
    const own = items.filter((i) => i.orderId === o.id);
    return { ...o, items: own, totals: totalsOf(own) };
  });
}

async function nextNumber(): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${serviceOrders.number}), 0)` })
    .from(serviceOrders);
  return Number(row?.max ?? 0) + 1;
}

export async function serviceOrderRoutes(app: FastifyInstance) {
  /** Список заказ-нарядов. ?status=in_work|done|paid|cancelled, ?from/?to (ISO). */
  app.get("/", async (req) => {
    const q = req.query as { status?: string; from?: string; to?: string };
    const conds = [];
    if (q.status) conds.push(eq(serviceOrders.status, q.status));
    if (q.from) conds.push(gte(serviceOrders.acceptedAt, new Date(q.from)));
    if (q.to) conds.push(lte(serviceOrders.acceptedAt, new Date(q.to)));
    const orders = await loadOrders(conds.length ? and(...conds) : undefined);
    return { orders };
  });

  app.get("/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const list = await loadOrders(eq(serviceOrders.id, id));
    if (!list[0]) return reply.code(404).send({ error: "not_found" });
    return { order: list[0] };
  });

  /** Создать заказ-наряд. */
  app.post("/", async (req, reply) => {
    const body = OrderBody.parse(req.body);
    const number = await nextNumber();
    const [row] = await db
      .insert(serviceOrders)
      .values({
        number,
        customerName: body.customerName.trim(),
        customerPhone: body.customerPhone ?? null,
        clientId: body.clientId ?? null,
        vehicle: body.vehicle.trim(),
        vehicleNumber: body.vehicleNumber ?? null,
        complaint: body.complaint ?? null,
        note: body.note ?? null,
        masterUserId: body.masterUserId ?? null,
        acceptedAt: body.acceptedAt ? new Date(body.acceptedAt) : new Date(),
        createdByUserId: req.user?.userId ?? null,
      })
      .returning();
    await logActivity(req, {
      action: "service_order_created",
      summary: `Принят сторонний ремонт №${number}: ${body.vehicle}, ${body.customerName}`,
      entity: "service_order",
      entityId: row!.id,
    });
    return reply.code(201).send({ order: { ...row!, items: [], totals: totalsOf([]) } });
  });

  /** Изменить шапку заказ-наряда. */
  app.patch("/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = OrderBody.partial().parse(req.body);
    const [before] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    await db
      .update(serviceOrders)
      .set({
        ...(body.customerName !== undefined ? { customerName: body.customerName } : {}),
        ...(body.customerPhone !== undefined ? { customerPhone: body.customerPhone } : {}),
        ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
        ...(body.vehicle !== undefined ? { vehicle: body.vehicle } : {}),
        ...(body.vehicleNumber !== undefined ? { vehicleNumber: body.vehicleNumber } : {}),
        ...(body.complaint !== undefined ? { complaint: body.complaint } : {}),
        ...(body.note !== undefined ? { note: body.note } : {}),
        ...(body.masterUserId !== undefined ? { masterUserId: body.masterUserId } : {}),
        ...(body.acceptedAt !== undefined ? { acceptedAt: new Date(body.acceptedAt) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(serviceOrders.id, id));
    const list = await loadOrders(eq(serviceOrders.id, id));
    await logActivity(req, {
      action: "service_order_updated",
      summary: `Изменён сторонний ремонт №${before.number}`,
      entity: "service_order",
      entityId: id,
    });
    return { order: list[0] };
  });

  /** Работа закончена — ремонт готов к выдаче. */
  app.post("/:id/complete", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [row] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, id));
    if (!row) return reply.code(404).send({ error: "not_found" });
    if (row.status === "paid") return reply.code(409).send({ error: "already_paid" });
    await db
      .update(serviceOrders)
      .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(serviceOrders.id, id));
    await logActivity(req, {
      action: "service_order_completed",
      summary: `Сторонний ремонт №${row.number} готов к выдаче`,
      entity: "service_order",
      entityId: id,
    });
    const list = await loadOrders(eq(serviceOrders.id, id));
    return { order: list[0] };
  });

  /**
   * Подтвердить оплату. Заказчик: «Как человек оплачивает, нужно будет
   * подтвердить, что прошла оплата за этот ремонт».
   */
  app.post("/:id/pay", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z
      .object({
        amount: z.number().int().min(0).optional(),
        method: z.enum(["cash", "transfer"]).default("cash"),
        paidAt: z.string().datetime().optional(),
      })
      .parse(req.body ?? {});
    const list = await loadOrders(eq(serviceOrders.id, id));
    const order = list[0];
    if (!order) return reply.code(404).send({ error: "not_found" });
    if (order.status === "cancelled")
      return reply.code(409).send({ error: "cancelled" });
    const amount = body.amount ?? order.totals.revenue;
    const paidAt = body.paidAt ? new Date(body.paidAt) : new Date();
    await db
      .update(serviceOrders)
      .set({
        status: "paid",
        paidAmount: amount,
        paymentMethod: body.method,
        paidAt,
        completedAt: order.completedAt ?? paidAt,
        updatedAt: new Date(),
      })
      .where(eq(serviceOrders.id, id));
    await logActivity(req, {
      action: "service_order_paid",
      summary: `Оплачен сторонний ремонт №${order.number}: ${amount.toLocaleString("ru-RU")} ₽ (${
        body.method === "cash" ? "наличные" : "перевод"
      })`,
      entity: "service_order",
      entityId: id,
    });
    const after = await loadOrders(eq(serviceOrders.id, id));
    return { order: after[0] };
  });

  /** Отменить заказ-наряд (деньги в статистику не идут). */
  app.post("/:id/cancel", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [row] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, id));
    if (!row) return reply.code(404).send({ error: "not_found" });
    await db
      .update(serviceOrders)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(serviceOrders.id, id));
    await logActivity(req, {
      action: "service_order_cancelled",
      summary: `Отменён сторонний ремонт №${row.number}`,
      entity: "service_order",
      entityId: id,
    });
    const list = await loadOrders(eq(serviceOrders.id, id));
    return { order: list[0] };
  });

  /** Удалить совсем — только директор. */
  app.delete("/:id", { preHandler: directorOnly }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [row] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, id));
    if (!row) return reply.code(404).send({ error: "not_found" });
    await db.delete(serviceOrders).where(eq(serviceOrders.id, id));
    await logActivity(req, {
      action: "service_order_deleted",
      summary: `Удалён сторонний ремонт №${row.number}`,
      entity: "service_order",
      entityId: id,
    });
    return { ok: true };
  });

  /* ---------------- позиции заказ-наряда ---------------- */

  app.post("/:id/items", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = ItemBody.parse(req.body);
    const [order] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, id));
    if (!order) return reply.code(404).send({ error: "not_found" });
    if (order.status === "paid")
      return reply.code(409).send({ error: "already_paid" });

    // Цена из прайса — значение по умолчанию: в наряде её можно поменять.
    let price = body.price ?? 0;
    if (body.priceItemId && body.price === undefined) {
      const [pi] = await db
        .select()
        .from(priceItems)
        .where(eq(priceItems.id, body.priceItemId));
      price = pi?.priceA ?? 0;
    }
    const [maxRow] = await db
      .select({ max: sql<number>`coalesce(max(${serviceOrderItems.sortOrder}), 0)` })
      .from(serviceOrderItems)
      .where(eq(serviceOrderItems.orderId, id));
    const [row] = await db
      .insert(serviceOrderItems)
      .values({
        orderId: id,
        kind: body.kind,
        priceItemId: body.priceItemId ?? null,
        name: body.name.trim(),
        qty: body.qty ?? 1,
        price,
        cost: body.kind === "part" ? (body.cost ?? 0) : 0,
        sortOrder: Number(maxRow?.max ?? 0) + 1,
      })
      .returning();
    await logActivity(req, {
      action: "service_order_item_added",
      summary: `Ремонт №${order.number}: ${
        body.kind === "work" ? "работа" : "запчасть"
      } «${body.name}» — ${(price * (body.qty ?? 1)).toLocaleString("ru-RU")} ₽`,
      entity: "service_order",
      entityId: id,
    });
    const list = await loadOrders(eq(serviceOrders.id, id));
    return reply.code(201).send({ item: row!, order: list[0] });
  });

  app.patch("/items/:itemId", async (req, reply) => {
    const itemId = Number((req.params as { itemId: string }).itemId);
    const body = ItemBody.partial().parse(req.body);
    const [item] = await db
      .select()
      .from(serviceOrderItems)
      .where(eq(serviceOrderItems.id, itemId));
    if (!item) return reply.code(404).send({ error: "not_found" });
    await db
      .update(serviceOrderItems)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.qty !== undefined ? { qty: body.qty } : {}),
        ...(body.price !== undefined ? { price: body.price } : {}),
        ...(body.cost !== undefined ? { cost: body.cost } : {}),
      })
      .where(eq(serviceOrderItems.id, itemId));
    const list = await loadOrders(eq(serviceOrders.id, item.orderId));
    return { order: list[0] };
  });

  app.delete("/items/:itemId", async (req, reply) => {
    const itemId = Number((req.params as { itemId: string }).itemId);
    const [item] = await db
      .select()
      .from(serviceOrderItems)
      .where(eq(serviceOrderItems.id, itemId));
    if (!item) return reply.code(404).send({ error: "not_found" });
    await db.delete(serviceOrderItems).where(eq(serviceOrderItems.id, itemId));
    const list = await loadOrders(eq(serviceOrders.id, item.orderId));
    return { order: list[0] };
  });

  /** Мастера — для выпадающего списка «кто делал». */
  app.get("/masters", async () => {
    const rows = await db
      .select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .orderBy(asc(users.name));
    return { masters: rows };
  });

  /** Клиенты для подсказки при вводе имени. */
  app.get("/clients", async () => {
    const rows = await db
      .select({ id: clients.id, name: clients.name, phone: clients.phone })
      .from(clients)
      .orderBy(asc(clients.name))
      .limit(500);
    return { clients: rows };
  });
}
