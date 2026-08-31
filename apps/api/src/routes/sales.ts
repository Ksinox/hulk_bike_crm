import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  clients,
  saleDealDocuments,
  saleDeals,
  saleManagers,
  salePlans,
  scooterModels,
  scooters,
  users,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { requireRole } from "../auth/plugin.js";
import { scooterLabel } from "./scooters.js";
import { makeFileKey, removeObject } from "../storage/index.js";
import { putObjectWithImageVariants } from "../storage/image.js";

/**
 * Блок «Продажи» (задание заказчика 31.08).
 *
 * Что здесь живёт:
 *   • менеджеры продаж — имя, аватар (цвет плитки), процент, история сделок;
 *   • сделки — пошагово: клиент → техника → цена → менеджер → договор →
 *     подпись со сканом. Числа снимаются в сделку на момент продажи, чтобы
 *     правка карточки техники не переписала отчёт задним числом;
 *   • план продаж на месяц (единицы / выручка / прибыль / маржа).
 *
 * Показатели, рейтинги и динамику считает фронт по списку сделок: продаж
 * десятки в год, а отдельные агрегирующие ручки только усложнили бы фильтры
 * (период, менеджер, разрез день/неделя/месяц/год) — на клиенте они
 * мгновенные и не требуют запроса на каждое переключение.
 */

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const directorOnly = requireRole("director");

const ManagerBody = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().max(30).optional().nullable(),
    avatarColor: z
      .enum(["blue", "purple", "green", "orange", "pink"])
      .optional(),
    commissionPct: z.number().int().min(0).max(100).optional(),
    userId: z.number().int().positive().optional().nullable(),
    active: z.boolean().optional(),
    note: z.string().max(500).optional().nullable(),
  })
  .strict();

const DealBody = z
  .object({
    clientId: z.number().int().positive().optional().nullable(),
    scooterId: z.number().int().positive().optional().nullable(),
    managerId: z.number().int().positive().optional().nullable(),
    price: z.number().int().min(0).optional(),
    comment: z.string().max(1000).optional().nullable(),
  })
  .strict();

const PlanBody = z
  .object({
    /** YYYY-MM или YYYY-MM-DD — приводим к первому числу месяца. */
    period: z.string().min(7).max(10),
    units: z.number().int().min(0).optional(),
    revenue: z.number().int().min(0).optional(),
    profit: z.number().int().min(0).optional(),
    marginPct: z.number().int().min(0).max(100).optional(),
  })
  .strict();

/** «2026-08» / «2026-08-14» → «2026-08-01». */
function monthStart(v: string): string {
  return `${v.slice(0, 7)}-01`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("ru-RU");
}

/** Название сделки для журнала: «сделка #12 · Yamaha Jog · VIN …». */
function dealLabel(d: {
  id: number;
  scooterName: string | null;
  vin: string | null;
}) {
  const parts = [`сделка #${d.id}`];
  if (d.scooterName) parts.push(d.scooterName);
  if (d.vin) parts.push(`VIN ${d.vin}`);
  return parts.join(" · ");
}

export async function salesRoutes(app: FastifyInstance) {
  /* ==================== МЕНЕДЖЕРЫ ==================== */

  app.get("/managers", async () => {
    const rows = await db
      .select()
      .from(saleManagers)
      .where(isNull(saleManagers.archivedAt))
      .orderBy(saleManagers.name);
    return { items: rows };
  });

  app.post("/managers", async (req, reply) => {
    const parsed = ManagerBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad body", details: parsed.error.issues });
    }
    const [row] = await db.insert(saleManagers).values(parsed.data).returning();
    await logActivity(req, {
      entity: "sale_manager",
      entityId: row!.id,
      action: "created",
      summary: `Добавлен менеджер продаж «${row!.name}» · процент ${row!.commissionPct}%`,
      meta: { name: row!.name, commissionPct: row!.commissionPct },
    });
    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/managers/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = ManagerBody.partial().safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      return reply.code(400).send({ error: "bad request" });
    }
    const [before] = await db
      .select()
      .from(saleManagers)
      .where(eq(saleManagers.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });
    const [row] = await db
      .update(saleManagers)
      .set(parsed.data)
      .where(eq(saleManagers.id, id))
      .returning();
    const changes: string[] = [];
    if (parsed.data.name && parsed.data.name !== before.name) {
      changes.push(`имя «${before.name}» → «${parsed.data.name}»`);
    }
    if (
      parsed.data.commissionPct != null &&
      parsed.data.commissionPct !== before.commissionPct
    ) {
      changes.push(
        `процент ${before.commissionPct}% → ${parsed.data.commissionPct}%`,
      );
    }
    await logActivity(req, {
      entity: "sale_manager",
      entityId: id,
      action: "updated",
      summary: `Менеджер продаж «${row!.name}»${changes.length ? `: ${changes.join(" · ")}` : " — изменены данные"}`,
      meta: { changes },
    });
    return row;
  });

  app.delete<{ Params: { id: string } }>(
    "/managers/:id",
    { preHandler: directorOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      const [row] = await db
        .select()
        .from(saleManagers)
        .where(eq(saleManagers.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });
      const [cntRow] = await db
        .select({ cnt: sql<number>`count(*)::int` })
        .from(saleDeals)
        .where(eq(saleDeals.managerId, id));
      const cnt = cntRow?.cnt ?? 0;
      if (cnt > 0) {
        // Есть сделки — не удаляем, а убираем из списка: история продаж
        // должна остаться читаемой.
        await db
          .update(saleManagers)
          .set({ archivedAt: new Date(), active: false })
          .where(eq(saleManagers.id, id));
        await logActivity(req, {
          entity: "sale_manager",
          entityId: id,
          action: "archived",
          summary: `Менеджер продаж «${row.name}» убран из списка · за ним ${cnt} сделок — история сохранена`,
        });
        return { ok: true, archived: true, deals: cnt };
      }
      await db.delete(saleManagers).where(eq(saleManagers.id, id));
      await logActivity(req, {
        entity: "sale_manager",
        entityId: id,
        action: "deleted",
        summary: `Удалён менеджер продаж «${row.name}» · сделок за ним не было`,
      });
      return { ok: true, archived: false };
    },
  );

  /* ==================== СДЕЛКИ ==================== */

  /** Список сделок с подтянутыми клиентом, менеджером и документами. */
  app.get("/deals", async () => {
    const rows = await db
      .select({
        deal: saleDeals,
        clientName: clients.name,
        clientPhone: clients.phone,
        managerName: saleManagers.name,
        managerColor: saleManagers.avatarColor,
        createdBy: users.name,
      })
      .from(saleDeals)
      .leftJoin(clients, eq(clients.id, saleDeals.clientId))
      .leftJoin(saleManagers, eq(saleManagers.id, saleDeals.managerId))
      .leftJoin(users, eq(users.id, saleDeals.createdByUserId))
      .orderBy(desc(saleDeals.createdAt))
      .limit(2000);

    const ids = rows.map((r) => r.deal.id);
    const docs = ids.length
      ? await db
          .select()
          .from(saleDealDocuments)
          .where(inArray(saleDealDocuments.dealId, ids))
      : [];
    const docsByDeal = new Map<number, typeof docs>();
    for (const d of docs) {
      const list = docsByDeal.get(d.dealId) ?? [];
      list.push(d);
      docsByDeal.set(d.dealId, list);
    }
    return {
      items: rows.map((r) => ({
        ...r.deal,
        clientName: r.clientName,
        clientPhone: r.clientPhone,
        managerName: r.managerName,
        managerColor: r.managerColor,
        createdBy: r.createdBy,
        documents: docsByDeal.get(r.deal.id) ?? [],
      })),
    };
  });

  /** Создание сделки. Снимок техники берём сразу — цена/VIN на момент старта. */
  app.post("/deals", async (req, reply) => {
    const parsed = DealBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad body", details: parsed.error.issues });
    }
    const values = await buildDealValues(parsed.data, null);
    const [row] = await db
      .insert(saleDeals)
      .values({ ...values, createdByUserId: req.user?.userId ?? null })
      .returning();
    await logActivity(req, {
      entity: "sale_deal",
      entityId: row!.id,
      action: "created",
      summary: `Создана ${dealLabel(row!)}`,
      meta: { price: row!.price },
    });
    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/deals/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = DealBody.safeParse(req.body);
    if (!Number.isFinite(id) || !parsed.success) {
      return reply.code(400).send({ error: "bad request" });
    }
    const [before] = await db
      .select()
      .from(saleDeals)
      .where(eq(saleDeals.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });
    if (before.status === "signed") {
      return reply.code(409).send({ error: "deal_signed" });
    }
    const values = await buildDealValues(parsed.data, before);
    const [row] = await db
      .update(saleDeals)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(saleDeals.id, id))
      .returning();
    const changes: string[] = [];
    if (parsed.data.price != null && parsed.data.price !== before.price) {
      changes.push(
        `цена ${fmtMoney(before.price)} ₽ → ${fmtMoney(parsed.data.price)} ₽`,
      );
    }
    if (
      parsed.data.scooterId !== undefined &&
      parsed.data.scooterId !== before.scooterId
    ) {
      changes.push(`техника → ${row!.scooterName ?? "не выбрана"}`);
    }
    if (
      parsed.data.managerId !== undefined &&
      parsed.data.managerId !== before.managerId
    ) {
      changes.push("сменён менеджер");
    }
    await logActivity(req, {
      entity: "sale_deal",
      entityId: id,
      action: "updated",
      summary: `${dealLabel(row!)}${changes.length ? `: ${changes.join(" · ")}` : " — изменена"}`,
      meta: { changes },
    });
    return row;
  });

  /** Договор сформирован — фиксируем факт и время. */
  app.post<{ Params: { id: string } }>(
    "/deals/:id/contract",
    async (req, reply) => {
      const id = Number(req.params.id);
      const [deal] = await db
        .select()
        .from(saleDeals)
        .where(eq(saleDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });
      if (!deal.clientId || !deal.scooterId || !deal.price) {
        return reply.code(409).send({ error: "deal_incomplete" });
      }
      const [row] = await db
        .update(saleDeals)
        .set({
          status: deal.status === "draft" ? "contract" : deal.status,
          contractAt: deal.contractAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(saleDeals.id, id))
        .returning();
      await logActivity(req, {
        entity: "sale_deal",
        entityId: id,
        action: "contract_generated",
        summary: `Сформирован договор купли-продажи · ${dealLabel(row!)} · цена ${fmtMoney(row!.price)} ₽`,
      });
      return row;
    },
  );

  /**
   * Договор подписан — продажа состоялась. Техника переводится в «Продан»,
   * фиксируется дата продажи и вознаграждение менеджера.
   */
  app.post<{ Params: { id: string } }>("/deals/:id/sign", async (req, reply) => {
    const id = Number(req.params.id);
    const [deal] = await db
      .select()
      .from(saleDeals)
      .where(eq(saleDeals.id, id));
    if (!deal) return reply.code(404).send({ error: "not found" });
    if (deal.status === "signed") {
      return reply.code(409).send({ error: "already_signed" });
    }
    if (!deal.clientId || !deal.scooterId || !deal.price) {
      return reply.code(409).send({ error: "deal_incomplete" });
    }
    const now = new Date();
    const profit = deal.price - (deal.purchasePrice ?? 0);
    const pct = deal.managerCommissionPct ?? 0;
    const [row] = await db
      .update(saleDeals)
      .set({
        status: "signed",
        signedAt: now,
        soldAt: now,
        managerCommission:
          pct > 0 ? Math.max(0, Math.round((profit * pct) / 100)) : 0,
        updatedAt: now,
      })
      .where(eq(saleDeals.id, id))
      .returning();

    // Техника уходит из продажи в «Продан».
    if (deal.scooterId) {
      const [sc] = await db
        .select()
        .from(scooters)
        .where(eq(scooters.id, deal.scooterId));
      if (sc && sc.baseStatus !== "sold") {
        await db
          .update(scooters)
          .set({ baseStatus: "sold" })
          .where(eq(scooters.id, deal.scooterId));
        await logActivity(req, {
          entity: "scooter",
          entityId: deal.scooterId,
          action: "status_changed",
          summary: `Статус ${scooterLabel(sc.name, sc.rentalSlot)}: «Продаётся» → «Продан» · продан по сделке #${id} за ${fmtMoney(row!.price)} ₽ · техника выбыла из оборота`,
          meta: { statusFrom: sc.baseStatus, statusTo: "sold", dealId: id },
        });
      }
    }
    await logActivity(req, {
      entity: "sale_deal",
      entityId: id,
      action: "signed",
      summary:
        `ПРОДАНО: ${dealLabel(row!)} · цена ${fmtMoney(row!.price)} ₽` +
        (row!.purchasePrice != null
          ? ` · закуп ${fmtMoney(row!.purchasePrice)} ₽ · прибыль ${fmtMoney(profit)} ₽`
          : "") +
        (row!.managerCommission
          ? ` · менеджеру ${fmtMoney(row!.managerCommission)} ₽`
          : ""),
      meta: { price: row!.price, profit, dealId: id },
    });
    return row;
  });

  app.post<{ Params: { id: string }; Body: { reason?: string } }>(
    "/deals/:id/cancel",
    async (req, reply) => {
      const id = Number(req.params.id);
      const [deal] = await db
        .select()
        .from(saleDeals)
        .where(eq(saleDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });
      const reason = (req.body?.reason ?? "").slice(0, 500) || null;
      const [row] = await db
        .update(saleDeals)
        .set({ status: "cancelled", cancelReason: reason, updatedAt: new Date() })
        .where(eq(saleDeals.id, id))
        .returning();
      // Техника возвращается в продажу, если была помечена проданной.
      if (deal.scooterId && deal.status === "signed") {
        await db
          .update(scooters)
          .set({ baseStatus: "for_sale" })
          .where(eq(scooters.id, deal.scooterId));
      }
      await logActivity(req, {
        entity: "sale_deal",
        entityId: id,
        action: "cancelled",
        summary: `Отменена ${dealLabel(row!)}${reason ? ` · причина: ${reason}` : ""}`,
      });
      return row;
    },
  );

  app.delete<{ Params: { id: string } }>(
    "/deals/:id",
    { preHandler: directorOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      const [deal] = await db
        .select()
        .from(saleDeals)
        .where(eq(saleDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });
      const docs = await db
        .select()
        .from(saleDealDocuments)
        .where(eq(saleDealDocuments.dealId, id));
      for (const d of docs) {
        try {
          await removeObject(d.fileKey);
        } catch {}
      }
      await db.delete(saleDeals).where(eq(saleDeals.id, id));
      await logActivity(req, {
        entity: "sale_deal",
        entityId: id,
        action: "deleted",
        summary: `Удалена ${dealLabel(deal)} · статус на момент удаления «${deal.status}» · цена ${fmtMoney(deal.price)} ₽ · восстановить нельзя`,
        meta: { snapshot: deal },
      });
      return { ok: true };
    },
  );

  /* ============ документы сделки (скан подписанного договора) ============ */

  app.post<{ Params: { id: string } }>(
    "/deals/:id/documents",
    async (req, reply) => {
      const id = Number(req.params.id);
      const [deal] = await db
        .select()
        .from(saleDeals)
        .where(eq(saleDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });

      const parts = req.parts({ limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
      let fileBuf: Buffer | null = null;
      let fileName = "file";
      let mimeType = "application/octet-stream";
      let title: string | undefined;
      for await (const part of parts) {
        if (part.type === "file") {
          fileBuf = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        } else if (part.type === "field" && part.fieldname === "title") {
          title = String(part.value);
        }
      }
      if (!fileBuf) return reply.code(400).send({ error: "file required" });

      const key = makeFileKey(`sales/${id}/contract`, fileName);
      await putObjectWithImageVariants(key, fileBuf, mimeType);
      const [row] = await db
        .insert(saleDealDocuments)
        .values({
          dealId: id,
          fileKey: key,
          fileName,
          mimeType,
          size: fileBuf.length,
          title: title ?? "Подписанный договор",
        })
        .returning();
      await logActivity(req, {
        entity: "sale_deal",
        entityId: id,
        action: "document_attached",
        summary: `К сделке #${id} приложена копия договора «${fileName}»`,
      });
      return reply.code(201).send(row);
    },
  );

  app.delete<{ Params: { id: string; docId: string } }>(
    "/deals/:id/documents/:docId",
    async (req, reply) => {
      const docId = Number(req.params.docId);
      const [doc] = await db
        .select()
        .from(saleDealDocuments)
        .where(eq(saleDealDocuments.id, docId));
      if (!doc) return reply.code(404).send({ error: "not found" });
      try {
        await removeObject(doc.fileKey);
      } catch {}
      await db.delete(saleDealDocuments).where(eq(saleDealDocuments.id, docId));
      await logActivity(req, {
        entity: "sale_deal",
        entityId: doc.dealId,
        action: "document_removed",
        summary: `Из сделки #${doc.dealId} удалена копия договора «${doc.fileName}»`,
      });
      return { ok: true };
    },
  );

  /* ==================== ПЛАН ПРОДАЖ ==================== */

  app.get("/plans", async () => {
    const rows = await db.select().from(salePlans).orderBy(desc(salePlans.period));
    return { items: rows };
  });

  app.put("/plans", { preHandler: directorOnly }, async (req, reply) => {
    const parsed = PlanBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad body", details: parsed.error.issues });
    }
    const period = monthStart(parsed.data.period);
    const values = {
      period,
      units: parsed.data.units ?? 0,
      revenue: parsed.data.revenue ?? 0,
      profit: parsed.data.profit ?? 0,
      marginPct: parsed.data.marginPct ?? 0,
      updatedAt: new Date(),
    };
    const [existing] = await db
      .select()
      .from(salePlans)
      .where(eq(salePlans.period, period));
    const [row] = existing
      ? await db
          .update(salePlans)
          .set(values)
          .where(eq(salePlans.id, existing.id))
          .returning()
      : await db.insert(salePlans).values(values).returning();
    await logActivity(req, {
      entity: "sale_deal",
      entityId: null,
      action: "plan_set",
      summary: `План продаж на ${period.slice(0, 7)}: ${row!.units} ед. · ${fmtMoney(row!.revenue)} ₽ выручки · ${fmtMoney(row!.profit)} ₽ прибыли`,
      meta: { plan: row },
    });
    return row;
  });

  /* ==================== ДОГОВОР ==================== */

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/deals/:id/document",
    async (req, reply) => {
      const id = Number(req.params.id);
      const { loadSaleBundle, renderSaleHtml, renderSaleHtmlForWord } =
        await import("../documents/sale-document.js");
      const bundle = await loadSaleBundle(id);
      if (!bundle) return reply.code(404).send({ error: "not found" });
      if (req.query.format === "docx") {
        const wordHtml = await renderSaleHtmlForWord(bundle);
        await logActivity(req, {
          entity: "sale_deal",
          entityId: id,
          action: "document_downloaded",
          summary: `Скачан договор купли-продажи (Word) по сделке #${id}`,
        });
        const filename = `Договор купли-продажи ${String(id).padStart(4, "0")}.doc`;
        return reply
          .header("Content-Type", "application/msword; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          )
          .send(wordHtml);
      }
      const html = await renderSaleHtml(bundle);
      // CRM встраивает документ в iframe с другого поддомена — снимаем
      // X-Frame-Options от helmet и разрешаем нужные origin'ы.
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
}

/**
 * Собирает поля сделки: подтягивает снимок техники (модель, VIN, двигатель,
 * партия, пробег, закуп) и процент менеджера. Снимок пересобирается, пока
 * сделка не подписана — после подписи PATCH запрещён.
 */
async function buildDealValues(
  input: z.infer<typeof DealBody>,
  before: typeof saleDeals.$inferSelect | null,
) {
  const values: Record<string, unknown> = {};
  if (input.clientId !== undefined) values.clientId = input.clientId;
  if (input.comment !== undefined) values.comment = input.comment;
  if (input.price !== undefined) values.price = input.price;

  if (input.scooterId !== undefined) {
    values.scooterId = input.scooterId;
    if (input.scooterId) {
      const [sc] = await db
        .select()
        .from(scooters)
        .where(eq(scooters.id, input.scooterId));
      if (sc) {
        const [model] = sc.modelId
          ? await db
              .select()
              .from(scooterModels)
              .where(eq(scooterModels.id, sc.modelId))
          : [];
        values.scooterName = scooterLabel(sc.name, sc.rentalSlot);
        values.modelName = model?.name ?? null;
        values.vin = sc.vin;
        values.engineNo = sc.engineNo;
        values.frameNumber = sc.frameNumber;
        values.purchaseBatch = sc.purchaseBatch;
        values.mileage = sc.mileage;
        values.purchasePrice = sc.purchasePrice;
        // Цена по умолчанию — из карточки техники, пока оператор не задал свою.
        if (input.price === undefined && !before?.price) {
          values.price = sc.salePrice ?? 0;
        }
      }
    } else {
      values.scooterName = null;
      values.modelName = null;
      values.vin = null;
      values.engineNo = null;
      values.frameNumber = null;
      values.purchaseBatch = null;
      values.mileage = null;
      values.purchasePrice = null;
    }
  }

  if (input.managerId !== undefined) {
    values.managerId = input.managerId;
    if (input.managerId) {
      const [m] = await db
        .select()
        .from(saleManagers)
        .where(eq(saleManagers.id, input.managerId));
      values.managerCommissionPct = m?.commissionPct ?? 0;
    } else {
      values.managerCommissionPct = null;
      values.managerCommission = null;
    }
  }
  return values;
}
