import type { FastifyInstance, FastifyRequest } from "fastify";
import { eq, asc, and, sum } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  damageReports,
  damageReportItems,
  payments,
  rentals,
  scooters,
  users,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import {
  loadDamageBundle,
  renderDamageHtml,
  renderDamageHtmlForWord,
} from "../documents/damage-document.js";
import {
  loadClaimBundle,
  renderClaimHtml,
  renderClaimHtmlForWord,
} from "../documents/claim-document.js";

/**
 * Акты о повреждениях.
 *
 * Бизнес-логика:
 *  - При создании акта аренда переводится в статус `completed_damage`,
 *    скутер (по флагу) — в `repair`. Аренда не архивируется пока есть долг.
 *  - Долг = total - depositCovered - SUM(payments[type=damage, paid=true]).
 *  - Платёж по акту — отдельный POST, авто-проставляет receivedByUserId
 *    из req.user.userId.
 */

const ItemInput = z.object({
  priceItemId: z.number().int().positive().nullable().optional(),
  name: z.string().min(1).max(200),
  originalPrice: z.number().int().min(0),
  finalPrice: z.number().int().min(0),
  quantity: z.number().int().min(1).default(1),
  comment: z.string().max(500).nullable().optional(),
});

const CreateBody = z.object({
  rentalId: z.number().int().positive(),
  depositCovered: z.number().int().min(0).default(0),
  note: z.string().max(2000).nullable().optional(),
  sendScooterToRepair: z.boolean().default(true),
  items: z.array(ItemInput).min(1),
});

const PatchBody = z.object({
  depositCovered: z.number().int().min(0).optional(),
  note: z.string().max(2000).nullable().optional(),
  items: z.array(ItemInput).optional(),
});

const PaymentBody = z.object({
  amount: z.number().int().positive(),
  note: z.string().max(500).nullable().optional(),
  /** Метод оплаты: cash / card / transfer */
  method: z.enum(["cash", "card", "transfer"]).default("cash"),
});

function getUserId(req: FastifyRequest): number | null {
  const u = (req as unknown as { user?: { userId?: number } }).user;
  return u?.userId ?? null;
}

async function loadReportFull(reportId: number) {
  const [report] = await db
    .select()
    .from(damageReports)
    .where(eq(damageReports.id, reportId));
  if (!report) return null;
  const items = await db
    .select()
    .from(damageReportItems)
    .where(eq(damageReportItems.reportId, reportId))
    .orderBy(asc(damageReportItems.sortOrder), asc(damageReportItems.id));
  const pays = await db
    .select()
    .from(payments)
    .where(
      and(eq(payments.damageReportId, reportId), eq(payments.type, "damage")),
    )
    .orderBy(asc(payments.paidAt), asc(payments.id));
  const paidSum = pays
    .filter((p) => p.paid)
    .reduce((s, p) => s + p.amount, 0);
  const debt = Math.max(0, report.total - report.depositCovered - paidSum);
  // Дополним именами «принявшего платёж».
  const userIds = Array.from(
    new Set(pays.map((p) => p.receivedByUserId).filter((x): x is number => !!x)),
  );
  const userRows = userIds.length
    ? await db
        .select({ id: users.id, name: users.name })
        .from(users)
    : [];
  const userMap = new Map(userRows.map((u) => [u.id, u.name]));
  const paysWithUser = pays.map((p) => ({
    ...p,
    receivedByName: p.receivedByUserId
      ? userMap.get(p.receivedByUserId) ?? null
      : null,
  }));
  return {
    ...report,
    items,
    payments: paysWithUser,
    paidSum,
    debt,
  };
}

export async function damageReportsRoutes(app: FastifyInstance) {
  /** Список актов по аренде (с items, платежами и остатком долга). */
  app.get<{ Querystring: { rentalId?: string } }>("/", async (req, reply) => {
    const rentalId = Number(req.query.rentalId);
    if (!Number.isFinite(rentalId) || rentalId <= 0)
      return reply.code(400).send({ error: "rentalId required" });
    const rows = await db
      .select()
      .from(damageReports)
      .where(eq(damageReports.rentalId, rentalId))
      .orderBy(asc(damageReports.createdAt), asc(damageReports.id));
    const full = await Promise.all(rows.map((r) => loadReportFull(r.id)));
    return { items: full.filter(Boolean) };
  });

  /** Один акт. */
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const r = await loadReportFull(id);
    if (!r) return reply.code(404).send({ error: "not found" });
    return r;
  });

  /** Создать акт. */
  app.post("/", async (req, reply) => {
    const parsed = CreateBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const { rentalId, items, depositCovered, note, sendScooterToRepair } =
      parsed.data;
    // Грузим аренду — нужен скутер и залог.
    const [rental] = await db
      .select()
      .from(rentals)
      .where(eq(rentals.id, rentalId));
    if (!rental) return reply.code(404).send({ error: "rental not found" });
    // Считаем итог.
    const total = items.reduce(
      (s, it) => s + it.finalPrice * it.quantity,
      0,
    );
    const cappedDeposit = Math.min(
      depositCovered ?? 0,
      total,
      rental.deposit ?? 0,
    );
    const userId = getUserId(req);
    const [report] = await db
      .insert(damageReports)
      .values({
        rentalId,
        createdByUserId: userId,
        total,
        depositCovered: cappedDeposit,
        note: note ?? null,
      })
      .returning();
    if (items.length > 0) {
      await db.insert(damageReportItems).values(
        items.map((it, i) => ({
          reportId: report!.id,
          priceItemId: it.priceItemId ?? null,
          name: it.name,
          originalPrice: it.originalPrice,
          finalPrice: it.finalPrice,
          quantity: it.quantity,
          comment: it.comment ?? null,
          sortOrder: i,
        })),
      );
    }
    // Аренду — в completed_damage (если ещё не).
    if (rental.status !== "completed_damage") {
      await db
        .update(rentals)
        .set({ status: "completed_damage" })
        .where(eq(rentals.id, rentalId));
    }
    // Скутер — в ремонт (если флаг и есть скутер).
    if (sendScooterToRepair && rental.scooterId) {
      await db
        .update(scooters)
        .set({ baseStatus: "repair" })
        .where(eq(scooters.id, rental.scooterId));
    }
    // Если залог зачли — фиксируем это «возвратом залога» (отрицательным
    // движением) — пока просто помечаем deposit_returned=false и пишем в note.
    // (Полноценный учёт возврата залога — отдельный поток.)
    await logActivity(req, {
      entity: "damage_report",
      entityId: report!.id,
      action: "created",
      summary: `Аренда #${String(rentalId).padStart(4, "0")}: акт о повреждениях на ${total} ₽ (${items.length} поз.)`,
      meta: { total, depositCovered: cappedDeposit, items: items.length },
    });
    return await loadReportFull(report!.id);
  });

  /** Изменить акт (заголовок и/или позиции). */
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const parsed = PatchBody.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const [report] = await db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, id));
    if (!report) return reply.code(404).send({ error: "not found" });
    const next: Partial<typeof damageReports.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.note !== undefined) next.note = parsed.data.note ?? null;
    if (parsed.data.depositCovered !== undefined)
      next.depositCovered = parsed.data.depositCovered;
    // Если items переданы — заменяем целиком и пересчитываем total.
    if (parsed.data.items) {
      const items = parsed.data.items;
      const total = items.reduce(
        (s, it) => s + it.finalPrice * it.quantity,
        0,
      );
      next.total = total;
      await db
        .delete(damageReportItems)
        .where(eq(damageReportItems.reportId, id));
      if (items.length > 0) {
        await db.insert(damageReportItems).values(
          items.map((it, i) => ({
            reportId: id,
            priceItemId: it.priceItemId ?? null,
            name: it.name,
            originalPrice: it.originalPrice,
            finalPrice: it.finalPrice,
            quantity: it.quantity,
            comment: it.comment ?? null,
            sortOrder: i,
          })),
        );
      }
    }
    await db.update(damageReports).set(next).where(eq(damageReports.id, id));
    await logActivity(req, {
      entity: "damage_report",
      entityId: id,
      action: "updated",
      summary: `Акт о повреждениях #${id} изменён`,
    });
    return await loadReportFull(id);
  });

  /** Внести платёж по акту. Авто-проставляет receivedByUserId. */
  app.post<{ Params: { id: string } }>(
    "/:id/payment",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const parsed = PaymentBody.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const [report] = await db
        .select()
        .from(damageReports)
        .where(eq(damageReports.id, id));
      if (!report) return reply.code(404).send({ error: "not found" });
      const userId = getUserId(req);
      const [pay] = await db
        .insert(payments)
        .values({
          rentalId: report.rentalId,
          type: "damage",
          amount: parsed.data.amount,
          method: parsed.data.method,
          paid: true,
          paidAt: new Date(),
          note: parsed.data.note ?? null,
          receivedByUserId: userId,
          damageReportId: id,
        })
        .returning();
      await logActivity(req, {
        entity: "damage_report",
        entityId: id,
        action: "payment",
        summary: `Платёж за ущерб ${parsed.data.amount} ₽ по акту #${id}`,
        meta: { paymentId: pay!.id, amount: parsed.data.amount },
      });
      return await loadReportFull(id);
    },
  );

  /** Печатная форма акта. format=html (preview) | docx (Word-скачивание). */
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>("/:id/document", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const bundle = await loadDamageBundle(id);
    if (!bundle) return reply.code(404).send({ error: "not found" });
    const format = req.query.format === "docx" ? "docx" : "html";
    if (format === "html") {
      const html = await renderDamageHtml(bundle);
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .removeHeader("X-Frame-Options")
        .header(
          "Content-Security-Policy",
          "frame-ancestors 'self' https://crm.hulkbike.ru https://crm.104-128-128-96.sslip.io",
        );
      return reply.send(html);
    }
    const wordHtml = await renderDamageHtmlForWord(bundle);
    const filename = `Акт о повреждениях ${String(id).padStart(4, "0")}.doc`;
    reply
      .header("Content-Type", "application/msword; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    return reply.send(wordHtml);
  });

  /** Досудебная претензия по акту — отдельный документ для случая
   *  когда клиент не согласен с актом. */
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>("/:id/claim", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const bundle = await loadClaimBundle(id);
    if (!bundle) return reply.code(404).send({ error: "not found" });
    const format = req.query.format === "docx" ? "docx" : "html";
    if (format === "html") {
      const html = await renderClaimHtml(bundle);
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .removeHeader("X-Frame-Options")
        .header(
          "Content-Security-Policy",
          "frame-ancestors 'self' https://crm.hulkbike.ru https://crm.104-128-128-96.sslip.io",
        );
      return reply.send(html);
    }
    const wordHtml = await renderClaimHtmlForWord(bundle);
    const filename = `Досудебная претензия ${String(id).padStart(4, "0")}.doc`;
    reply
      .header("Content-Type", "application/msword; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    return reply.send(wordHtml);
  });

  /** Удалить акт (cascade на items; платежи остаются как обычные). */
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const [report] = await db
      .select()
      .from(damageReports)
      .where(eq(damageReports.id, id));
    if (!report) return reply.code(404).send({ error: "not found" });
    // Проверим — нет ли платежей (тогда удалять нельзя без отвязки).
    const sumRows = await db
      .select({
        paidSum: sum(payments.amount),
      })
      .from(payments)
      .where(eq(payments.damageReportId, id));
    const paidSum = sumRows[0]?.paidSum;
    if (paidSum && Number(paidSum) > 0) {
      return reply.code(409).send({
        error: "has_payments",
        message: "По акту уже есть платежи — удаление заблокировано.",
      });
    }
    await db.delete(damageReports).where(eq(damageReports.id, id));
    await logActivity(req, {
      entity: "damage_report",
      entityId: id,
      action: "deleted",
      summary: `Акт о повреждениях #${id} удалён`,
    });
    return reply.code(204).send();
  });
}
