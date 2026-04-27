import type { FastifyInstance } from "fastify";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { clients } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import {
  loadStatementBundle,
  renderStatementHtml,
  renderStatementHtmlForWord,
} from "../documents/statement-document.js";

const ClientSourceEnum = z.enum(["avito", "repeat", "ref", "maps", "other"]);

/** Поля, которые можно прислать при создании клиента. */
const CreateClientBody = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().min(1).max(30),
    extraPhone: z.string().max(30).optional().nullable(),
    rating: z.number().int().min(0).max(100).optional(),
    source: ClientSourceEnum.optional(),
    /** Если предустановленные варианты не подходят — текст руками. */
    sourceCustom: z.string().max(100).optional().nullable(),
    /** Иностранный гражданин — паспорт в свободной форме. */
    isForeigner: z.boolean().optional(),
    passportRaw: z.string().max(2000).optional().nullable(),
    comment: z.string().max(500).optional().nullable(),
    blacklisted: z.boolean().optional(),
    blacklistReason: z.string().optional().nullable(),

    birthDate: z.string().optional().nullable(),
    passportSeries: z.string().optional().nullable(),
    passportNumber: z.string().optional().nullable(),
    passportIssuedOn: z.string().optional().nullable(),
    passportIssuer: z.string().optional().nullable(),
    passportDivisionCode: z.string().optional().nullable(),
    passportRegistration: z.string().optional().nullable(),
    licenseNumber: z.string().optional().nullable(),
    licenseCategories: z.string().optional().nullable(),
    licenseIssuedOn: z.string().optional().nullable(),
    licenseExpiresOn: z.string().optional().nullable(),
  })
  .strict();

/** Поля, которые можно патчить. Все опциональны. */
const PatchClientBody = CreateClientBody.partial().extend({
  unreachable: z.boolean().optional(),
});

export async function clientsRoutes(app: FastifyInstance) {
  // GET /api/clients
  app.get("/", async () => {
    const rows = await db.select().from(clients).orderBy(clients.name);
    return { items: rows };
  });

  // GET /api/clients/:id
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const [row] = await db.select().from(clients).where(eq(clients.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // POST /api/clients
  app.post("/", async (req, reply) => {
    const parsed = CreateClientBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const [row] = await db
      .insert(clients)
      .values({
        ...parsed.data,
        source: parsed.data.source ?? "other",
        rating: parsed.data.rating ?? 80,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    await logActivity(req, {
      entity: "client",
      entityId: row.id,
      action: "created",
      summary: `Добавлен клиент «${row.name}» · ${row.phone}`,
    });
    return reply.code(201).send(row);
  });

  // PATCH /api/clients/:id
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const parsed = PatchClientBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const [row] = await db
      .update(clients)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(clients.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    // Отдельные сообщения для значимых флагов
    let summary = `Обновлена карточка клиента «${row.name}»`;
    if (parsed.data.blacklisted === true) {
      summary = `Клиент «${row.name}» добавлен в чёрный список${parsed.data.blacklistReason ? `: ${parsed.data.blacklistReason}` : ""}`;
    } else if (parsed.data.blacklisted === false) {
      summary = `Клиент «${row.name}» убран из чёрного списка`;
    } else if (parsed.data.unreachable === true) {
      summary = `Клиент «${row.name}» помечен «не выходит на связь»`;
    } else if (parsed.data.unreachable === false) {
      summary = `С клиентом «${row.name}» снова на связи`;
    }

    await logActivity(req, {
      entity: "client",
      entityId: id,
      action: "updated",
      summary,
    });
    return row;
  });

  /**
   * GET /api/clients/:id/statement?format=html|docx
   * Финансовая выписка по клиенту: все аренды, платежи, акты ущерба,
   * история частичных оплат, остатки долга. Для суда и претензий.
   */
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>("/:id/statement", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const bundle = await loadStatementBundle(id);
    if (!bundle) return reply.code(404).send({ error: "not found" });
    const format = req.query.format === "docx" ? "docx" : "html";
    if (format === "html") {
      const html = renderStatementHtml(bundle);
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .removeHeader("X-Frame-Options")
        .header(
          "Content-Security-Policy",
          "frame-ancestors 'self' https://crm.hulkbike.ru https://crm.104-128-128-96.sslip.io",
        );
      return reply.send(html);
    }
    const wordHtml = renderStatementHtmlForWord(bundle);
    const filename = `Финансовая выписка ${bundle.client.name}.doc`;
    reply
      .header("Content-Type", "application/msword; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    return reply.send(wordHtml);
  });
}
