import type { FastifyInstance } from "fastify";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  clients,
  damageReports,
  debtorPayments,
  debtors,
  payments,
  scooters,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import {
  loadStatementBundle,
  renderStatementHtml,
  renderStatementHtmlForWord,
} from "../documents/statement-document.js";

const ClientSourceEnum = z.enum(["avito", "repeat", "ref", "maps", "other"]);

/** Поля, которые можно прислать при создании клиента. */
export const CreateClientBody = z
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

/** Краткая сводка по делу-должнику для карточки клиента. */
export type DebtorCaseSummary = {
  id: number;
  caseNumber: string;
  type: string;
  stage: string;
  totalAmount: number;
  paid: number;
  progressPercent: number;
  active: boolean;
  problem: boolean;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
};

const debtorStageIsClosed = (s: string) => s.startsWith("closed_");
/** Проблемное дело (угон/невозврат/криминал) — зеркало lib/debtors/types. */
const debtorIsProblem = (type: string, stage: string) =>
  type === "theft" || stage === "police" || stage === "criminal_case";

/**
 * Дела-должники по клиентам: clientId → массив сводок.
 * `clientIds === null` → все дела с привязкой к клиенту (для списка).
 * Активные дела идут первыми, внутри — по дате создания (новые сверху).
 */
async function debtorCasesByClient(
  clientIds: number[] | null,
): Promise<Map<number, DebtorCaseSummary[]>> {
  const map = new Map<number, DebtorCaseSummary[]>();
  if (clientIds && clientIds.length === 0) return map;

  const dRows = await db
    .select()
    .from(debtors)
    .where(
      clientIds
        ? inArray(debtors.clientId, clientIds)
        : sql`${debtors.clientId} IS NOT NULL`,
    );
  if (dRows.length === 0) return map;

  const ids = dRows.map((d) => d.id);
  const pays = await db
    .select()
    .from(debtorPayments)
    .where(inArray(debtorPayments.debtorId, ids));
  const paidByDebtor = new Map<number, number>();
  for (const p of pays) {
    if (p.paidAt) {
      paidByDebtor.set(
        p.debtorId,
        (paidByDebtor.get(p.debtorId) ?? 0) + (p.paidAmount ?? 0),
      );
    }
  }

  for (const d of dRows) {
    if (d.clientId == null) continue;
    const paid = paidByDebtor.get(d.id) ?? 0;
    const closed = debtorStageIsClosed(d.stage);
    const summary: DebtorCaseSummary = {
      id: d.id,
      caseNumber: d.caseNumber,
      type: d.type,
      stage: d.stage,
      totalAmount: d.totalAmount,
      paid,
      progressPercent:
        d.totalAmount > 0
          ? Math.min(100, Math.round((paid / d.totalAmount) * 100))
          : 0,
      // «Должник» = дело не закрыто И ещё не погашено полностью.
      active: !closed && paid < d.totalAmount,
      problem: debtorIsProblem(d.type, d.stage),
      closedAt: d.closedAt ? d.closedAt.toISOString() : null,
      closedReason: d.closedReason ?? null,
      createdAt: d.createdAt.toISOString(),
    };
    const arr = map.get(d.clientId) ?? [];
    arr.push(summary);
    map.set(d.clientId, arr);
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }
  return map;
}

export async function clientsRoutes(app: FastifyInstance) {
  // GET /api/clients
  // v0.5.6: дополнительно агрегируем долг по ущербу клиента из ВСЕХ его
  // аренд (включая завершённые). Поле `unpaidDamageDebt` используется
  // фронтом для метки «опасный клиент» в пикере при создании новой
  // аренды + для плашки на карточке клиента «висит долг X ₽».
  app.get("/", async () => {
    const rows = await db.select().from(clients).orderBy(clients.name);
    // Один SQL-запрос: для каждого клиента считаем сумму
    // (damage_reports.total − depositCovered − Σ paid damage payments).
    // GROUP BY clients.id, JOIN с rentals → damage_reports → payments.
    const debtsRaw = await db.execute(sql`
      SELECT
        r.client_id AS "clientId",
        COALESCE(SUM(
          GREATEST(
            0,
            dr.total - dr.deposit_covered - COALESCE((
              SELECT SUM(p.amount)
                FROM payments p
               WHERE p.damage_report_id = dr.id
                 AND p.type = 'damage'
                 AND p.paid = true
            ), 0)
          )
        ), 0)::int AS "unpaidDamageDebt"
      FROM damage_reports dr
      JOIN rentals r ON r.id = dr.rental_id
      WHERE NOT EXISTS (
        SELECT 1 FROM debtors db WHERE db.related_rental_id = r.id
            AND db.stage::text NOT LIKE 'closed_%'
      )
      GROUP BY r.client_id
    `);
    const debtRows = (debtsRaw as unknown as { rows?: Array<{ clientId: number; unpaidDamageDebt: number }> }).rows
      ?? (debtsRaw as unknown as Array<{ clientId: number; unpaidDamageDebt: number }>);
    const debtMap = new Map<number, number>(
      (Array.isArray(debtRows) ? debtRows : []).map((d) => [
        Number(d.clientId),
        Number(d.unpaidDamageDebt),
      ]),
    );
    const debtorMap = await debtorCasesByClient(rows.map((r) => r.id));
    return {
      items: rows.map((r) => ({
        ...r,
        unpaidDamageDebt: debtMap.get(r.id) ?? 0,
        debtorCases: debtorMap.get(r.id) ?? [],
      })),
    };
  });

  // GET /api/clients/:id
  // v0.5.6: тот же агрегат unpaidDamageDebt что в /api/clients.
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return reply.code(400).send({ error: "bad id" });
    }
    const [row] = await db.select().from(clients).where(eq(clients.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    const debtRaw = await db.execute(sql`
      SELECT COALESCE(SUM(
        GREATEST(
          0,
          dr.total - dr.deposit_covered - COALESCE((
            SELECT SUM(p.amount)
              FROM payments p
             WHERE p.damage_report_id = dr.id
               AND p.type = 'damage'
               AND p.paid = true
          ), 0)
        )
      ), 0)::int AS "unpaidDamageDebt"
      FROM damage_reports dr
      JOIN rentals r ON r.id = dr.rental_id
      WHERE r.client_id = ${id}
        AND NOT EXISTS (
          SELECT 1 FROM debtors db WHERE db.related_rental_id = r.id
            AND db.stage::text NOT LIKE 'closed_%'
        )
    `);
    const debtRow = ((debtRaw as unknown as { rows?: Array<{ unpaidDamageDebt: number }> }).rows
      ?? (debtRaw as unknown as Array<{ unpaidDamageDebt: number }>))?.[0];
    const debtorMap = await debtorCasesByClient([id]);
    return {
      ...row,
      unpaidDamageDebt: Number(debtRow?.unpaidDamageDebt ?? 0),
      debtorCases: debtorMap.get(id) ?? [],
    };
  });

  // GET /api/clients/:id/debt-sources — ИСТОЧНИКИ незакрытого долга клиента
  // по арендам (F3): по какой аренде, какой скутер/период, сколько и за что.
  // Сейчас покрываем долг по УЩЕРБУ (он «переезжает» с клиентом после возврата
  // и не виден в активных арендах). Совпадает с формулой unpaidDamageDebt:
  // суммируем по арендам клиента, кроме тех, где уже заведено дело должника.
  app.get<{ Params: { id: string } }>(
    "/:id/debt-sources",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const raw = await db.execute(sql`
        SELECT
          dr.id AS "drId",
          dr.rental_id::int AS "rentalId",
          dr.total::int AS "total",
          dr.deposit_covered::int AS "depositCovered",
          dr.note AS "note",
          r.scooter_id::int AS "scooterId",
          r.status AS "status",
          r.archived_at AS "archivedAt",
          r.start_at AS "startAt",
          r.end_planned_at AS "endPlannedAt",
          COALESCE((
            SELECT SUM(p.amount) FROM payments p
             WHERE p.damage_report_id = dr.id
               AND p.type = 'damage' AND p.paid = true
          ), 0)::int AS "paidDamage"
        FROM damage_reports dr
        JOIN rentals r ON r.id = dr.rental_id
        WHERE r.client_id = ${id}
          AND NOT EXISTS (
            SELECT 1 FROM debtors db WHERE db.related_rental_id = r.id
            AND db.stage::text NOT LIKE 'closed_%'
          )
      `);
      type Row = {
        drId: number;
        rentalId: number;
        total: number;
        depositCovered: number;
        note: string | null;
        scooterId: number | null;
        status: string;
        archivedAt: string | null;
        startAt: string | Date;
        endPlannedAt: string | Date;
        paidDamage: number;
      };
      const list = ((raw as unknown as { rows?: Row[] }).rows ??
        (raw as unknown as Row[])) as Row[];
      // Группируем по аренде (на одной аренде может быть несколько актов).
      const byRental = new Map<
        number,
        {
          rentalId: number;
          scooterId: number | null;
          status: string;
          archived: boolean;
          startAt: string | Date;
          endPlannedAt: string | Date;
          amount: number;
          notes: string[];
        }
      >();
      for (const d of Array.isArray(list) ? list : []) {
        const debt = Math.max(
          0,
          d.total - d.depositCovered - d.paidDamage,
        );
        if (debt <= 0) continue;
        const ex = byRental.get(d.rentalId) ?? {
          rentalId: d.rentalId,
          scooterId: d.scooterId,
          status: d.status,
          archived: !!d.archivedAt,
          startAt: d.startAt,
          endPlannedAt: d.endPlannedAt,
          amount: 0,
          notes: [],
        };
        ex.amount += debt;
        if (d.note && d.note.trim()) ex.notes.push(d.note.trim());
        byRental.set(d.rentalId, ex);
      }
      const items = [...byRental.values()];
      const scIds = items
        .map((i) => i.scooterId)
        .filter((x): x is number => typeof x === "number");
      const scs = scIds.length
        ? await db
            .select({ id: scooters.id, name: scooters.name })
            .from(scooters)
            .where(inArray(scooters.id, scIds))
        : [];
      const scName = new Map(scs.map((s) => [s.id, s.name]));
      return {
        items: items.map((i) => ({
          rentalId: i.rentalId,
          scooterName: i.scooterId
            ? (scName.get(i.scooterId) ?? `#${i.scooterId}`)
            : "—",
          status: i.status,
          archived: i.archived,
          startIso:
            typeof i.startAt === "string"
              ? i.startAt
              : new Date(i.startAt).toISOString(),
          endPlannedIso:
            typeof i.endPlannedAt === "string"
              ? i.endPlannedAt
              : new Date(i.endPlannedAt).toISOString(),
          type: "damage" as const,
          amount: i.amount,
          label: i.notes.length ? `Ущерб: ${i.notes.join("; ")}` : "Ущерб",
        })),
      };
    },
  );

  // POST /api/clients/:id/pay-damage-debt — принять оплату по СКВОЗНОМУ долгу
  // клиента (ущерб с прошлых аренд, который «переехал» за клиентом). Сумму
  // распределяем по незакрытым актам клиента (старые — первыми), записывая
  // damage-платежи. Фильтр актов — тот же, что в debt-sources (кроме аренд с
  // активным делом должника). Рубль-в-рубль: долг акта = total − depositCovered
  // − Σ(damage-платежи), формулы не меняем — просто гасим существующий долг.
  const PayDamageDebtBody = z.object({
    amount: z.number().int().positive(),
    method: z.enum(["cash", "card", "transfer"]).optional(),
  });
  app.post<{ Params: { id: string } }>(
    "/:id/pay-damage-debt",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const parsed = PayDamageDebtBody.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const method = parsed.data.method ?? "cash";
      let remaining = parsed.data.amount;
      const raw = await db.execute(sql`
        SELECT dr.id AS "drId", dr.rental_id::int AS "rentalId",
               dr.total::int AS "total",
               dr.deposit_covered::int AS "depositCovered",
               COALESCE((
                 SELECT SUM(p.amount) FROM payments p
                  WHERE p.damage_report_id = dr.id
                    AND p.type = 'damage' AND p.paid = true
               ), 0)::int AS "paidDamage"
        FROM damage_reports dr
        JOIN rentals r ON r.id = dr.rental_id
        WHERE r.client_id = ${id}
          AND NOT EXISTS (
            SELECT 1 FROM debtors db WHERE db.related_rental_id = r.id
              AND db.stage::text NOT LIKE 'closed_%'
          )
        ORDER BY dr.created_at ASC, dr.id ASC
      `);
      type Row = {
        drId: number;
        rentalId: number;
        total: number;
        depositCovered: number;
        paidDamage: number;
      };
      const rows = ((raw as unknown as { rows?: Row[] }).rows ??
        (raw as unknown as Row[])) as Row[];
      const userId =
        (req as unknown as { user?: { userId?: number } }).user?.userId ?? null;
      const applied: { drId: number; rentalId: number; amount: number }[] = [];
      for (const row of Array.isArray(rows) ? rows : []) {
        if (remaining <= 0) break;
        const debt = Math.max(
          0,
          row.total - row.depositCovered - row.paidDamage,
        );
        if (debt <= 0) continue;
        const pay = Math.min(debt, remaining);
        await db.insert(payments).values({
          rentalId: row.rentalId,
          type: "damage",
          amount: pay,
          method,
          paid: true,
          paidAt: new Date(),
          note: "Погашение долга по ущербу (с прошлых аренд)",
          receivedByUserId: userId,
          damageReportId: row.drId,
        });
        applied.push({ drId: row.drId, rentalId: row.rentalId, amount: pay });
        remaining -= pay;
      }
      const paidTotal = parsed.data.amount - remaining;
      if (paidTotal > 0) {
        await logActivity(req, {
          entity: "client",
          entityId: id,
          action: "payment",
          summary: `Погашение сквозного долга по ущербу ${paidTotal} ₽`,
          meta: { applied, method },
        });
      }
      return { paid: paidTotal, applied };
    },
  );

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

  /* ============================================================
   *  v0.3.9 — баланс депозита клиента (charge / spend / get).
   *
   *  Депозит — неиспользованные средства, которые автоматически
   *  подтянутся в счёт следующей оплаты аренды. Не путать с залогом
   *  под скутер (rentals.deposit).
   * ============================================================ */

  app.get<{ Params: { id: string } }>("/:id/deposit", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db
      .select({ balance: clients.depositBalance, name: clients.name })
      .from(clients)
      .where(eq(clients.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return { balance: row.balance, clientName: row.name };
  });

  /** Зачислить средства на депозит (например — переплата при оплате). */
  app.post<{
    Params: { id: string };
    Body: { amount: number; comment?: string; rentalId?: number };
  }>("/:id/deposit/charge", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z.object({
      amount: z.number().int().positive(),
      comment: z.string().max(500).optional(),
      rentalId: z.number().int().positive().optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const [row] = await db
      .update(clients)
      .set({
        depositBalance: sql`${clients.depositBalance} + ${parsed.data.amount}`,
      })
      .where(eq(clients.id, id))
      .returning({ id: clients.id, balance: clients.depositBalance, name: clients.name });
    if (!row) return reply.code(404).send({ error: "not found" });
    await logActivity(req, {
      entity: "client",
      entityId: id,
      action: "deposit_charged",
      summary: `Депозит +${parsed.data.amount} ₽: ${row.name}${parsed.data.comment ? ` (${parsed.data.comment})` : ""}`,
      meta: parsed.data.rentalId
        ? { rentalId: parsed.data.rentalId }
        : undefined,
    });
    return row;
  });

  /** Списать средства с депозита (использование в счёт оплаты). */
  app.post<{
    Params: { id: string };
    Body: { amount: number; comment?: string; rentalId?: number };
  }>("/:id/deposit/spend", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z.object({
      amount: z.number().int().positive(),
      comment: z.string().max(500).optional(),
      rentalId: z.number().int().positive().optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const [before] = await db
      .select({ balance: clients.depositBalance, name: clients.name })
      .from(clients)
      .where(eq(clients.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });
    const spend = Math.min(parsed.data.amount, before.balance);
    if (spend <= 0) {
      return reply.code(400).send({ error: "no_balance" });
    }
    const [row] = await db
      .update(clients)
      .set({
        depositBalance: sql`${clients.depositBalance} - ${spend}`,
      })
      .where(eq(clients.id, id))
      .returning({ id: clients.id, balance: clients.depositBalance, name: clients.name });
    await logActivity(req, {
      entity: "client",
      entityId: id,
      action: "deposit_spent",
      summary: `Депозит −${spend} ₽: ${before.name}${parsed.data.comment ? ` (${parsed.data.comment})` : ""}`,
      meta: parsed.data.rentalId
        ? { rentalId: parsed.data.rentalId }
        : undefined,
    });
    return row;
  });

  /**
   * Выдать депозит клиенту (вернуть наличными). v0.6.51: депозит — это
   * «лишние» деньги клиента (переплаты, излишки коррекций). Оператор может
   * выдать их клиенту целиком или частично. Дебетует depositBalance, выдача
   * капается остатком (нельзя выдать больше, чем лежит).
   */
  app.post<{
    Params: { id: string };
    Body: { amount: number; comment?: string };
  }>("/:id/deposit/payout", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z.object({
      amount: z.number().int().positive(),
      comment: z.string().max(500).optional(),
    });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const [before] = await db
      .select({ balance: clients.depositBalance, name: clients.name })
      .from(clients)
      .where(eq(clients.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });
    const payout = Math.min(parsed.data.amount, before.balance);
    if (payout <= 0) {
      return reply.code(400).send({ error: "no_balance" });
    }
    const [row] = await db
      .update(clients)
      .set({
        depositBalance: sql`${clients.depositBalance} - ${payout}`,
      })
      .where(eq(clients.id, id))
      .returning({ id: clients.id, balance: clients.depositBalance, name: clients.name });
    await logActivity(req, {
      entity: "client",
      entityId: id,
      action: "deposit_paid_out",
      summary: `Депозит выдан клиенту −${payout} ₽: ${before.name}${parsed.data.comment ? ` (${parsed.data.comment})` : ""}`,
    });
    return row;
  });
}
