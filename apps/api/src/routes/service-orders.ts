import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  priceItems,
  serviceOrderItems,
  serviceOrderPayments,
  serviceOrders,
  users,
} from "../db/schema.js";
import { logActivity, type DiffPayload } from "../services/activityLog.js";
import { requireRole } from "../auth/plugin.js";

/**
 * Сторонние ремонты (задание 06.09, деньги переделаны в 2.0.2).
 *
 * Заказ-наряд на ЧУЖУЮ технику: приняли — набрали работы из прайса —
 * дописали запчасти — взяли аванс — выдали и рассчитались.
 * Своей техники здесь нет вовсе: марка и номер записаны текстом, потому
 * что скутер клиента в нашем парке не заведён.
 *
 * Деньги считаем на сервере, чтобы цифра была одна и та же везде:
 *   работы + запчасти = Σ(цена × количество)
 *   к оплате          = работы + запчасти − скидка
 *   себестоимость     = Σ(закуп × количество) по запчастям
 *   прибыль           = к оплате − себестоимость
 *   внесено           = Σ платежей (аванс, расчёт, возврат со знаком минус)
 *   остаток           = к оплате − внесено
 * Выручка блока (2.0.2, заказчик) — это ПЛАТЕЖИ по дате оплаты: пока ремонт
 * в работе и денег не брали, в выручке его нет.
 */

const directorOnly = requireRole("director");

const ItemBody = z.object({
  kind: z.enum(["work", "part"]),
  priceItemId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).max(300),
  qty: z.number().int().min(1).max(999).optional(),
  price: z.number().int().min(0).max(10_000_000).optional(),
  cost: z.number().int().min(0).max(10_000_000).optional(),
});

const PayBody = z.object({
  amount: z.number().int().min(0).max(10_000_000),
  method: z.enum(["cash", "transfer", "mixed"]).default("cash"),
  /** Наличная часть при смешанной оплате; перевод — остаток. */
  cashAmount: z.number().int().min(0).optional(),
});

const OrderBody = z.object({
  customerName: z.string().trim().min(1).max(200),
  customerPhone: z.string().trim().max(50).nullable().optional(),
  clientId: z.number().int().positive().nullable().optional(),
  vehicle: z.string().trim().min(1).max(200),
  vehicleNumber: z.string().trim().max(100).nullable().optional(),
  complaint: z.string().max(2000).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
  masterUserId: z.number().int().positive().nullable().optional(),
  acceptedAt: z.string().datetime().optional(),
});

/** Новый ремонт можно сохранить сразу с работами, запчастями и авансом. */
const CreateBody = OrderBody.extend({
  items: z.array(ItemBody).max(200).optional(),
  advance: PayBody.optional(),
});

type Item = typeof serviceOrderItems.$inferSelect;
type Payment = typeof serviceOrderPayments.$inferSelect;
type OrderRow = typeof serviceOrders.$inferSelect;

export type OrderTotals = {
  works: number;
  parts: number;
  /** Работы + запчасти (до скидки). */
  revenue: number;
  discount: number;
  /** К оплате = работы + запчасти − скидка. */
  due: number;
  cost: number;
  profit: number;
  /** Внесено всего (возвраты вычтены). */
  paid: number;
  /** Остаток к оплате (не меньше нуля). */
  left: number;
  /** Внесли больше, чем к оплате (после правки позиций). */
  overpaid: number;
};

export function totalsOf(
  items: { kind: string; qty: number; price: number; cost: number }[],
  discount = 0,
  payments: { amount: number }[] = [],
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
  const due = Math.max(0, revenue - discount);
  const paid = payments.reduce((s, p) => s + p.amount, 0);
  return {
    works,
    parts,
    revenue,
    discount,
    due,
    cost,
    profit: due - cost,
    paid,
    left: Math.max(0, due - paid),
    overpaid: Math.max(0, paid - due),
  };
}

const money = (n: number) => `${Math.round(n).toLocaleString("ru-RU")} ₽`;
const num = (n: number) => `№${String(n).padStart(4, "0")}`;

const STATUS_RU: Record<string, string> = {
  in_work: "в работе",
  done: "готов к выдаче",
  paid: "оплачен",
  cancelled: "отменён",
};

function methodRu(method: string, cash: number, transfer: number): string {
  if (method === "transfer") return "перевод";
  if (method === "mixed") return `наличные ${money(cash)} + перевод ${money(transfer)}`;
  return "наличные";
}

/** Доли нал/перевод — та же формула, что у выкупов и продаж. */
function splitMoney(amount: number, method: string, cashInput?: number) {
  const cash =
    method === "cash"
      ? amount
      : method === "transfer"
        ? 0
        : Math.min(amount, Math.max(0, cashInput ?? 0));
  return { cash, transfer: amount - cash };
}

/** Календарный день по Москве — отмена платежа только в день приёма. */
function mskDay(d: Date): string {
  return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
}

async function loadOrders(where?: ReturnType<typeof and>) {
  const rows = await db
    .select()
    .from(serviceOrders)
    .where(where as never)
    .orderBy(desc(serviceOrders.acceptedAt), desc(serviceOrders.id));
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [items, pays] = await Promise.all([
    db
      .select()
      .from(serviceOrderItems)
      .where(inArray(serviceOrderItems.orderId, ids))
      .orderBy(asc(serviceOrderItems.sortOrder), asc(serviceOrderItems.id)),
    db
      .select()
      .from(serviceOrderPayments)
      .where(inArray(serviceOrderPayments.orderId, ids))
      .orderBy(asc(serviceOrderPayments.paidAt), asc(serviceOrderPayments.id)),
  ]);
  return rows.map((o) => shape(o, items, pays));
}

function shape(o: OrderRow, items: Item[], pays: Payment[]) {
  const own = items.filter((i) => i.orderId === o.id);
  const ownPays = pays.filter((p) => p.orderId === o.id);
  return {
    ...o,
    items: own,
    payments: ownPays,
    totals: totalsOf(own, o.discount, ownPays),
  };
}

async function loadOne(id: number) {
  const list = await loadOrders(eq(serviceOrders.id, id));
  return list[0] ?? null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Сводные поля наряда (paidAmount, доли, способ) — из платежей. Их читают
 * старые экраны и аналитика; источник правды — service_order_payments.
 */
async function syncPaidAggregate(tx: Tx, orderId: number) {
  const pays = await tx
    .select()
    .from(serviceOrderPayments)
    .where(eq(serviceOrderPayments.orderId, orderId));
  const paid = pays.reduce((s, p) => s + p.amount, 0);
  const cash = pays.reduce((s, p) => s + p.cashAmount, 0);
  const transfer = pays.reduce((s, p) => s + p.transferAmount, 0);
  const methods = new Set(pays.filter((p) => p.amount !== 0).map((p) => p.method));
  const method =
    pays.length === 0 || methods.size === 0
      ? null
      : methods.size === 1
        ? [...methods][0]!
        : "mixed";
  await tx
    .update(serviceOrders)
    .set({
      paidAmount: pays.length ? paid : null,
      cashAmount: cash,
      transferAmount: transfer,
      paymentMethod: method,
      updatedAt: new Date(),
    })
    .where(eq(serviceOrders.id, orderId));
}

function notFound(reply: FastifyReply) {
  return reply.code(404).send({ error: "not_found", message: "Ремонт не найден." });
}

function conflict(reply: FastifyReply, error: string, message: string) {
  return reply.code(409).send({ error, message });
}

const ACTIVE = new Set(["in_work", "done"]);

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
    const order = await loadOne(id);
    if (!order) return notFound(reply);
    return { order };
  });

  /**
   * Накладная по ремонту (2.0.2): HTML для печати из CRM или Word-копия.
   * Закупочных цен в документе нет — он для клиента.
   */
  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/:id/document",
    async (req, reply) => {
      const id = Number(req.params.id);
      const order = await loadOne(id);
      if (!order) return notFound(reply);
      const { renderServiceInvoiceHtml, serviceInvoiceForWord } = await import(
        "../documents/service-document.js"
      );
      const html = renderServiceInvoiceHtml(order);
      if (req.query.format === "docx") {
        await logActivity(req, {
          entity: "service_order",
          entityId: id,
          action: "document_downloaded",
          summary: `Скачана накладная (Word) по ремонту ${num(order.number)}`,
        });
        const filename = `Накладная по ремонту ${String(order.number).padStart(4, "0")}.doc`;
        return reply
          .header("Content-Type", "application/msword; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          )
          .send(serviceInvoiceForWord(html));
      }
      return reply
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-store")
        .removeHeader("X-Frame-Options")
        .header(
          "Content-Security-Policy",
          "frame-ancestors 'self' https://crm.hulkbike.ru https://crm-preview.104-128-128-96.sslip.io https://crm.104-128-128-96.sslip.io",
        )
        .send(html);
    },
  );

  /**
   * Создать заказ-наряд. С 2.0.2 можно сразу с работами, запчастями и
   * авансом — одной операцией: либо сохранилось всё, либо ничего.
   */
  app.post("/", async (req, reply) => {
    const body = CreateBody.parse(req.body);
    const items = body.items ?? [];

    // Цены из прайса — значение по умолчанию, если в строке цену не задали.
    const priceIds = items
      .filter((i) => i.priceItemId && i.price === undefined)
      .map((i) => i.priceItemId!);
    const priceMap = new Map<number, number>();
    if (priceIds.length) {
      const rows = await db
        .select({ id: priceItems.id, priceA: priceItems.priceA })
        .from(priceItems)
        .where(inArray(priceItems.id, priceIds));
      for (const r of rows) priceMap.set(r.id, r.priceA ?? 0);
    }
    const prepared = items.map((i, idx) => ({
      kind: i.kind,
      priceItemId: i.priceItemId ?? null,
      name: i.name,
      qty: i.qty ?? 1,
      price: i.price ?? (i.priceItemId ? priceMap.get(i.priceItemId) ?? 0 : 0),
      cost: i.kind === "part" ? (i.cost ?? 0) : 0,
      sortOrder: idx + 1,
    }));
    const t = totalsOf(prepared);
    const adv = body.advance && body.advance.amount > 0 ? body.advance : null;
    if (adv && adv.amount >= t.due) {
      return reply.code(400).send({
        error: "advance_too_big",
        message:
          t.due === 0
            ? "Аванс берут, когда в ремонте есть работы или запчасти."
            : `Аванс должен быть меньше суммы ремонта (${money(t.due)}). Полную оплату принимают при выдаче.`,
      });
    }

    const created = await db.transaction(async (tx) => {
      // Номер — под замком, чтобы два одновременных приёма не взяли один.
      await tx.execute(sql`select pg_advisory_xact_lock(815002)`);
      const [mx] = await tx
        .select({ max: sql<number>`coalesce(max(${serviceOrders.number}), 0)` })
        .from(serviceOrders);
      const number = Number(mx?.max ?? 0) + 1;
      const [row] = await tx
        .insert(serviceOrders)
        .values({
          number,
          customerName: body.customerName,
          customerPhone: body.customerPhone || null,
          clientId: body.clientId ?? null,
          vehicle: body.vehicle,
          vehicleNumber: body.vehicleNumber || null,
          complaint: body.complaint?.trim() || null,
          note: body.note?.trim() || null,
          masterUserId: body.masterUserId ?? null,
          acceptedAt: body.acceptedAt ? new Date(body.acceptedAt) : new Date(),
          createdByUserId: req.user?.userId ?? null,
        })
        .returning();
      if (prepared.length) {
        await tx
          .insert(serviceOrderItems)
          .values(prepared.map((p) => ({ ...p, orderId: row!.id })));
      }
      let advPart: { cash: number; transfer: number } | null = null;
      if (adv) {
        advPart = splitMoney(adv.amount, adv.method, adv.cashAmount);
        await tx.insert(serviceOrderPayments).values({
          orderId: row!.id,
          kind: "advance",
          amount: adv.amount,
          method: adv.method,
          cashAmount: advPart.cash,
          transferAmount: advPart.transfer,
          prevStatus: "in_work",
          note: "аванс при приёме",
          createdByUserId: req.user?.userId ?? null,
        });
        await syncPaidAggregate(tx, row!.id);
      }
      return { row: row!, advPart };
    });

    const parts = [
      `${body.vehicle}, ${body.customerName}`,
      prepared.length ? `позиций ${prepared.length} на ${money(t.due)}` : null,
      adv && created.advPart
        ? `аванс ${money(adv.amount)} (${methodRu(adv.method, created.advPart.cash, created.advPart.transfer)})`
        : null,
    ].filter(Boolean);
    await logActivity(req, {
      action: "service_order_created",
      summary: `Принят сторонний ремонт ${num(created.row.number)}: ${parts.join(" · ")}`,
      entity: "service_order",
      entityId: created.row.id,
      meta: adv
        ? { method: adv.method === "mixed" ? undefined : adv.method, advance: adv.amount }
        : undefined,
    });
    const order = await loadOne(created.row.id);
    return reply.code(201).send({ order });
  });

  /** Изменить шапку: клиента, телефон, технику, жалобу. */
  app.patch("/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = OrderBody.partial().parse(req.body);
    const [before] = await db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.id, id));
    if (!before) return notFound(reply);
    if (before.status === "cancelled")
      return conflict(reply, "cancelled", "Ремонт отменён — сначала верните его в работу.");

    const next = {
      customerName: body.customerName,
      customerPhone: body.customerPhone === undefined ? undefined : body.customerPhone || null,
      clientId: body.clientId,
      vehicle: body.vehicle,
      vehicleNumber: body.vehicleNumber === undefined ? undefined : body.vehicleNumber || null,
      complaint: body.complaint === undefined ? undefined : body.complaint?.trim() || null,
      note: body.note === undefined ? undefined : body.note?.trim() || null,
      masterUserId: body.masterUserId,
      acceptedAt: body.acceptedAt ? new Date(body.acceptedAt) : undefined,
    };
    const LABELS: Record<string, string> = {
      customerName: "Клиент",
      customerPhone: "Телефон",
      vehicle: "Техника",
      vehicleNumber: "Номер или VIN",
      complaint: "С чем приехали",
      note: "Заметка",
    };
    const diff: DiffPayload = {};
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) continue;
      const prev = (before as Record<string, unknown>)[k];
      const same =
        v instanceof Date && prev instanceof Date
          ? v.getTime() === prev.getTime()
          : (prev ?? null) === (v ?? null);
      if (same) continue;
      set[k] = v;
      if (LABELS[k]) diff[k] = { label: LABELS[k], from: prev ?? "—", to: v ?? "—", kind: "text" };
    }
    if (Object.keys(set).length === 0) return { order: await loadOne(id) };
    await db
      .update(serviceOrders)
      .set({ ...set, updatedAt: new Date() })
      .where(eq(serviceOrders.id, id));
    const what = Object.values(diff).map((d) => d.label.toLowerCase());
    await logActivity(req, {
      action: "service_order_updated",
      summary: `Ремонт ${num(before.number)}: изменено — ${what.join(", ") || "данные"}`,
      entity: "service_order",
      entityId: id,
      diff,
    });
    return { order: await loadOne(id) };
  });

  /** Работа закончена — ремонт готов к выдаче. */
  app.post("/:id/complete", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [row] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, id));
    if (!row) return notFound(reply);
    if (row.status !== "in_work")
      return conflict(reply, "bad_status", `Ремонт уже ${STATUS_RU[row.status] ?? row.status}.`);
    await db
      .update(serviceOrders)
      .set({ status: "done", completedAt: new Date(), updatedAt: new Date() })
      .where(eq(serviceOrders.id, id));
    await logActivity(req, {
      action: "service_order_completed",
      summary: `Сторонний ремонт ${num(row.number)} готов к выдаче`,
      entity: "service_order",
      entityId: id,
      diff: { status: { label: "Статус", from: "в работе", to: "готов к выдаче", kind: "text" } },
    });
    return { order: await loadOne(id) };
  });

  /**
   * Аванс (2.0.2): клиент платит часть — остаток считается сам.
   * Аванс меньше остатка: всю сумму принимают расчётом при выдаче.
   */
  app.post("/:id/advance", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = PayBody.parse(req.body ?? {});
    const order = await loadOne(id);
    if (!order) return notFound(reply);
    if (!ACTIVE.has(order.status))
      return conflict(reply, "bad_status", `Ремонт ${STATUS_RU[order.status]} — аванс не принять.`);
    if (body.amount < 1)
      return reply.code(400).send({ error: "amount", message: "Укажите сумму аванса." });
    if (body.amount >= order.totals.left)
      return reply.code(400).send({
        error: "advance_too_big",
        message: `Аванс должен быть меньше остатка (${money(order.totals.left)}). Всю сумму принимают кнопкой «Принять оплату».`,
      });
    const part = splitMoney(body.amount, body.method, body.cashAmount);
    const payment = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(serviceOrderPayments)
        .values({
          orderId: id,
          kind: "advance",
          amount: body.amount,
          method: body.method,
          cashAmount: part.cash,
          transferAmount: part.transfer,
          prevStatus: order.status,
          note: "аванс",
          createdByUserId: req.user?.userId ?? null,
        })
        .returning();
      await syncPaidAggregate(tx, id);
      return p!;
    });
    const left = order.totals.left - body.amount;
    await logActivity(req, {
      action: "service_order_advance",
      summary: `Ремонт ${num(order.number)}: аванс ${money(body.amount)} (${methodRu(body.method, part.cash, part.transfer)}) · остаток ${money(left)}`,
      entity: "service_order",
      entityId: id,
      meta: { method: body.method === "mixed" ? undefined : body.method, paymentId: payment.id },
      diff: {
        paid: { label: "Внесено", from: order.totals.paid, to: order.totals.paid + body.amount, kind: "money" },
        left: { label: "Остаток", from: order.totals.left, to: left, kind: "money" },
      },
    });
    return { order: await loadOne(id), paymentId: payment.id };
  });

  /**
   * Расчёт при выдаче: принимаем остаток (можно со скидкой) — ремонт оплачен.
   * expected — остаток, который видел оператор: если позиции за это время
   * поменяли, не закрываем наряд на старую сумму.
   */
  async function settle(
    req: FastifyRequest,
    reply: FastifyReply,
    id: number,
    input: { method: string; cashAmount?: number; discount: number; expected?: number },
  ) {
    const order = await loadOne(id);
    if (!order) return notFound(reply);
    if (!ACTIVE.has(order.status))
      return conflict(reply, "bad_status", `Ремонт ${STATUS_RU[order.status]} — оплату не принять.`);
    const { left, due, overpaid } = order.totals;
    if (overpaid > 0)
      return conflict(
        reply,
        "overpaid",
        `Внесено больше суммы ремонта на ${money(overpaid)}. Сначала отметьте возврат разницы.`,
      );
    if (input.expected !== undefined && input.expected !== left)
      return conflict(reply, "total_changed", `Сумма ремонта изменилась: остаток теперь ${money(left)}.`);
    if (due === 0 && order.totals.revenue === 0)
      return reply.code(400).send({ error: "empty", message: "В ремонте нет ни работ, ни запчастей." });
    const discount = Math.min(Math.max(0, input.discount), left);
    const amount = left - discount;
    const part = splitMoney(amount, input.method, input.cashAmount);
    const now = new Date();
    const payment = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(serviceOrderPayments)
        .values({
          orderId: id,
          kind: "payment",
          amount,
          method: input.method,
          cashAmount: part.cash,
          transferAmount: part.transfer,
          discount,
          prevStatus: order.status,
          note: discount > 0 ? `расчёт при выдаче, скидка ${money(discount)}` : "расчёт при выдаче",
          createdByUserId: req.user?.userId ?? null,
        })
        .returning();
      await tx
        .update(serviceOrders)
        .set({
          status: "paid",
          discount: order.discount + discount,
          paidAt: now,
          completedAt: order.completedAt ?? now,
          updatedAt: now,
        })
        .where(eq(serviceOrders.id, id));
      await syncPaidAggregate(tx, id);
      return p!;
    });
    const total = order.totals.paid + amount;
    await logActivity(req, {
      action: "service_order_paid",
      summary: `Оплачен сторонний ремонт ${num(order.number)}: ${money(amount)} (${methodRu(input.method, part.cash, part.transfer)})${
        order.totals.paid > 0 ? ` + аванс ${money(order.totals.paid)} = ${money(total)}` : ""
      }${discount > 0 ? ` · скидка ${money(discount)}` : ""}`,
      entity: "service_order",
      entityId: id,
      meta: { method: input.method === "mixed" ? undefined : input.method, paymentId: payment.id },
      diff: {
        status: { label: "Статус", from: STATUS_RU[order.status] ?? order.status, to: "оплачен", kind: "text" },
        left: { label: "Остаток", from: left, to: 0, kind: "money" },
        ...(discount > 0
          ? { discount: { label: "Скидка", from: order.discount, to: order.discount + discount, kind: "money" as const } }
          : {}),
      },
    });
    return { order: await loadOne(id), paymentId: payment.id };
  }

  app.post("/:id/settle", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z
      .object({
        method: z.enum(["cash", "transfer", "mixed"]).default("cash"),
        cashAmount: z.number().int().min(0).optional(),
        discount: z.number().int().min(0).max(10_000_000).default(0),
        expected: z.number().int().min(0).optional(),
      })
      .parse(req.body ?? {});
    return settle(req, reply, id, body);
  });

  /**
   * Прежний вызов «Подтвердить оплату» (до 2.0.2 его слал экран со старой
   * сборкой): сумма меньше остатка — это скидка, как и было.
   */
  app.post("/:id/pay", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z
      .object({
        amount: z.number().int().min(0).optional(),
        method: z.enum(["cash", "transfer", "mixed"]).default("cash"),
        cashAmount: z.number().int().min(0).optional(),
      })
      .parse(req.body ?? {});
    const order = await loadOne(id);
    if (!order) return notFound(reply);
    const discount = body.amount === undefined ? 0 : Math.max(0, order.totals.left - body.amount);
    return settle(req, reply, id, { method: body.method, cashAmount: body.cashAmount, discount });
  });

  /**
   * Возврат денег клиенту: разница после правки позиций (переплата).
   * Сумма уходит из выручки днём возврата.
   */
  app.post("/:id/refund", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = PayBody.parse(req.body ?? {});
    const order = await loadOne(id);
    if (!order) return notFound(reply);
    if (!ACTIVE.has(order.status))
      return conflict(reply, "bad_status", `Ремонт ${STATUS_RU[order.status]}.`);
    if (body.amount < 1 || body.amount > order.totals.overpaid)
      return reply.code(400).send({
        error: "amount",
        message: `Вернуть можно не больше переплаты (${money(order.totals.overpaid)}).`,
      });
    const part = splitMoney(body.amount, body.method, body.cashAmount);
    const payment = await db.transaction(async (tx) => {
      const [p] = await tx
        .insert(serviceOrderPayments)
        .values({
          orderId: id,
          kind: "refund",
          amount: -body.amount,
          method: body.method,
          cashAmount: -part.cash,
          transferAmount: -part.transfer,
          prevStatus: order.status,
          note: "возврат переплаты",
          createdByUserId: req.user?.userId ?? null,
        })
        .returning();
      await syncPaidAggregate(tx, id);
      return p!;
    });
    await logActivity(req, {
      action: "service_order_refund",
      summary: `Ремонт ${num(order.number)}: вернули клиенту ${money(body.amount)} (${methodRu(body.method, part.cash, part.transfer)})`,
      entity: "service_order",
      entityId: id,
      diff: {
        paid: { label: "Внесено", from: order.totals.paid, to: order.totals.paid - body.amount, kind: "money" },
      },
    });
    return { order: await loadOne(id), paymentId: payment.id };
  });

  /**
   * Отменить платёж (ошибся суммой или способом) — только последний и
   * только в день приёма; директор — в любой день. Наряд возвращается в
   * статус, который был до платежа, скидка этого расчёта снимается.
   */
  app.delete("/payments/:paymentId", async (req, reply) => {
    const paymentId = Number((req.params as { paymentId: string }).paymentId);
    const [p] = await db
      .select()
      .from(serviceOrderPayments)
      .where(eq(serviceOrderPayments.id, paymentId));
    if (!p) return reply.code(404).send({ error: "not_found", message: "Платёж не найден." });
    const order = await loadOne(p.orderId);
    if (!order) return notFound(reply);
    const last = [...order.payments].sort((a, b) => b.id - a.id)[0];
    if (!last || last.id !== p.id)
      return conflict(reply, "not_last", "Отменить можно только последний платёж по ремонту.");
    if (order.status === "cancelled")
      return conflict(reply, "cancelled", "Ремонт отменён — сначала верните его в работу.");
    const isDirector = req.user?.role === "director";
    if (!isDirector && mskDay(p.createdAt) !== mskDay(new Date()))
      return conflict(reply, "too_late", "Платёж отменяют в день приёма. Позже — только директор.");
    const closing = p.kind === "payment" && order.status === "paid";
    const backTo = closing ? p.prevStatus ?? (order.completedAt ? "done" : "in_work") : order.status;
    await db.transaction(async (tx) => {
      await tx.delete(serviceOrderPayments).where(eq(serviceOrderPayments.id, p.id));
      if (closing) {
        await tx
          .update(serviceOrders)
          .set({
            status: backTo,
            discount: Math.max(0, order.discount - p.discount),
            paidAt: null,
            completedAt: backTo === "in_work" ? null : order.completedAt,
            updatedAt: new Date(),
          })
          .where(eq(serviceOrders.id, order.id));
      }
      await syncPaidAggregate(tx, order.id);
    });
    const what =
      p.kind === "advance" ? "аванс" : p.kind === "refund" ? "возврат" : "оплата";
    await logActivity(req, {
      action: "service_order_payment_undone",
      summary: `Ремонт ${num(order.number)}: отменена запись «${what} ${money(Math.abs(p.amount))}»${
        closing ? ` — снова ${STATUS_RU[backTo]}` : ""
      }`,
      entity: "service_order",
      entityId: order.id,
      diff: closing
        ? { status: { label: "Статус", from: "оплачен", to: STATUS_RU[backTo] ?? backTo, kind: "text" } }
        : undefined,
    });
    return { order: await loadOne(order.id) };
  });

  /**
   * Отменить заказ-наряд (в статистику не идёт). Если брали аванс — при
   * отмене он считается возвращённым клиенту и уходит из выручки.
   */
  app.post("/:id/cancel", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const order = await loadOne(id);
    if (!order) return notFound(reply);
    if (!ACTIVE.has(order.status))
      return conflict(
        reply,
        "bad_status",
        order.status === "paid"
          ? "Оплаченный ремонт не отменяют. Сначала отмените оплату."
          : "Ремонт уже отменён.",
      );
    const paid = order.totals.paid;
    const cash = order.payments.reduce((s, x) => s + x.cashAmount, 0);
    const transfer = paid - cash;
    const now = new Date();
    await db.transaction(async (tx) => {
      if (paid > 0) {
        await tx.insert(serviceOrderPayments).values({
          orderId: id,
          kind: "refund",
          amount: -paid,
          method: cash > 0 && transfer > 0 ? "mixed" : transfer > 0 ? "transfer" : "cash",
          cashAmount: -cash,
          transferAmount: -transfer,
          paidAt: now,
          prevStatus: order.status,
          note: "аванс вернули при отмене",
          createdByUserId: req.user?.userId ?? null,
        });
      }
      await tx
        .update(serviceOrders)
        .set({
          status: "cancelled",
          statusBeforeCancel: order.status,
          cancelledAt: now,
          updatedAt: now,
        })
        .where(eq(serviceOrders.id, id));
      await syncPaidAggregate(tx, id);
    });
    await logActivity(req, {
      action: "service_order_cancelled",
      summary: `Отменён сторонний ремонт ${num(order.number)}${paid > 0 ? ` · аванс ${money(paid)} вернули клиенту` : ""}`,
      entity: "service_order",
      entityId: id,
      diff: {
        status: { label: "Статус", from: STATUS_RU[order.status], to: "отменён", kind: "text" },
      },
    });
    return { order: await loadOne(id) };
  });

  /**
   * Вернуть отменённый ремонт в работу (2.0.2). Статус — тот, что был до
   * отмены. Если при отмене отметили возврат аванса: keepAdvance=true —
   * деньги на самом деле у нас (отменили по ошибке), возврат снимается;
   * false — клиент деньги забрал, остаток к оплате полный.
   */
  app.post("/:id/reopen", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = z
      .object({ keepAdvance: z.boolean().optional() })
      .parse(req.body ?? {});
    const order = await loadOne(id);
    if (!order) return notFound(reply);
    if (order.status !== "cancelled")
      return conflict(reply, "bad_status", "Вернуть в работу можно только отменённый ремонт.");
    const backTo =
      order.statusBeforeCancel && ACTIVE.has(order.statusBeforeCancel)
        ? order.statusBeforeCancel
        : order.completedAt
          ? "done"
          : "in_work";
    const cancelRefunds = order.payments.filter(
      (x) =>
        x.kind === "refund" &&
        order.cancelledAt &&
        x.note === "аванс вернули при отмене" &&
        Math.abs(x.createdAt.getTime() - order.cancelledAt.getTime()) < 60_000,
    );
    const restored = body.keepAdvance ? cancelRefunds.reduce((s, x) => s - x.amount, 0) : 0;
    await db.transaction(async (tx) => {
      if (body.keepAdvance && cancelRefunds.length) {
        await tx.delete(serviceOrderPayments).where(
          inArray(
            serviceOrderPayments.id,
            cancelRefunds.map((x) => x.id),
          ),
        );
      }
      await tx
        .update(serviceOrders)
        .set({ status: backTo, statusBeforeCancel: null, cancelledAt: null, updatedAt: new Date() })
        .where(eq(serviceOrders.id, id));
      await syncPaidAggregate(tx, id);
    });
    await logActivity(req, {
      action: "service_order_reopened",
      summary: `Ремонт ${num(order.number)} снова ${STATUS_RU[backTo]}${restored > 0 ? ` · аванс ${money(restored)} остаётся в ремонте` : ""}`,
      entity: "service_order",
      entityId: id,
      diff: { status: { label: "Статус", from: "отменён", to: STATUS_RU[backTo] ?? backTo, kind: "text" } },
    });
    return { order: await loadOne(id) };
  });

  /** Удалить совсем — только директор. */
  app.delete("/:id", { preHandler: directorOnly }, async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const [row] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, id));
    if (!row) return notFound(reply);
    await db.delete(serviceOrders).where(eq(serviceOrders.id, id));
    await logActivity(req, {
      action: "service_order_deleted",
      summary: `Удалён сторонний ремонт ${num(row.number)}`,
      entity: "service_order",
      entityId: id,
    });
    return { ok: true };
  });

  /* ---------------- позиции заказ-наряда ---------------- */

  /** Позиции меняют, пока ремонт не оплачен и не отменён. */
  async function editableOrder(reply: FastifyReply, orderId: number) {
    const [order] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, orderId));
    if (!order) {
      notFound(reply);
      return null;
    }
    if (order.status === "paid") {
      conflict(reply, "already_paid", "Ремонт оплачен — позиции не меняют. Сначала отмените оплату.");
      return null;
    }
    if (order.status === "cancelled") {
      conflict(reply, "cancelled", "Ремонт отменён — сначала верните его в работу.");
      return null;
    }
    return order;
  }

  const kindRu = (k: string) => (k === "work" ? "работа" : "запчасть");

  app.post("/:id/items", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    const body = ItemBody.parse(req.body);
    const order = await editableOrder(reply, id);
    if (!order) return;

    // Цена из прайса — значение по умолчанию: в наряде её можно поменять.
    let price = body.price ?? 0;
    if (body.priceItemId && body.price === undefined) {
      const [pi] = await db.select().from(priceItems).where(eq(priceItems.id, body.priceItemId));
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
        name: body.name,
        qty: body.qty ?? 1,
        price,
        cost: body.kind === "part" ? (body.cost ?? 0) : 0,
        sortOrder: Number(maxRow?.max ?? 0) + 1,
      })
      .returning();
    await logActivity(req, {
      action: "service_order_item_added",
      summary: `Ремонт ${num(order.number)}: ${kindRu(body.kind)} «${body.name}» — ${money(price * (body.qty ?? 1))}`,
      entity: "service_order",
      entityId: id,
    });
    return reply.code(201).send({ item: row!, order: await loadOne(id) });
  });

  app.patch("/items/:itemId", async (req, reply) => {
    const itemId = Number((req.params as { itemId: string }).itemId);
    const body = ItemBody.partial().parse(req.body);
    const [item] = await db.select().from(serviceOrderItems).where(eq(serviceOrderItems.id, itemId));
    if (!item) return reply.code(404).send({ error: "not_found", message: "Позиция не найдена." });
    const order = await editableOrder(reply, item.orderId);
    if (!order) return;
    const diff: DiffPayload = {};
    if (body.name !== undefined && body.name !== item.name)
      diff.name = { label: "Название", from: item.name, to: body.name, kind: "text" };
    if (body.qty !== undefined && body.qty !== item.qty)
      diff.qty = { label: "Количество", from: item.qty, to: body.qty, kind: "number", suffix: "шт" };
    if (body.price !== undefined && body.price !== item.price)
      diff.price = { label: "Цена", from: item.price, to: body.price, kind: "money" };
    if (body.cost !== undefined && body.cost !== item.cost && item.kind === "part")
      diff.cost = { label: "Закуп", from: item.cost, to: body.cost, kind: "money" };
    if (Object.keys(diff).length === 0) return { order: await loadOne(item.orderId) };
    await db
      .update(serviceOrderItems)
      .set({
        ...(diff.name ? { name: body.name } : {}),
        ...(diff.qty ? { qty: body.qty } : {}),
        ...(diff.price ? { price: body.price } : {}),
        ...(diff.cost ? { cost: body.cost } : {}),
      })
      .where(eq(serviceOrderItems.id, itemId));
    await db.update(serviceOrders).set({ updatedAt: new Date() }).where(eq(serviceOrders.id, order.id));
    await logActivity(req, {
      action: "service_order_item_updated",
      summary: `Ремонт ${num(order.number)}: ${kindRu(item.kind)} «${item.name}» — ${Object.values(diff)
        .map((d) => d.label.toLowerCase())
        .join(", ")}`,
      entity: "service_order",
      entityId: order.id,
      // Закуп в журнал — только директору виден через права; в diff оставляем.
      diff,
    });
    return { order: await loadOne(item.orderId) };
  });

  app.delete("/items/:itemId", async (req, reply) => {
    const itemId = Number((req.params as { itemId: string }).itemId);
    const [item] = await db.select().from(serviceOrderItems).where(eq(serviceOrderItems.id, itemId));
    if (!item) return reply.code(404).send({ error: "not_found", message: "Позиция не найдена." });
    const order = await editableOrder(reply, item.orderId);
    if (!order) return;
    await db.delete(serviceOrderItems).where(eq(serviceOrderItems.id, itemId));
    await db.update(serviceOrders).set({ updatedAt: new Date() }).where(eq(serviceOrders.id, order.id));
    await logActivity(req, {
      action: "service_order_item_removed",
      summary: `Ремонт ${num(order.number)}: убрана ${kindRu(item.kind)} «${item.name}» — ${money(item.price * item.qty)}`,
      entity: "service_order",
      entityId: order.id,
    });
    return { order: await loadOne(item.orderId) };
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
