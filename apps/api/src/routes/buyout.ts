import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  appSettings,
  buyoutDeals,
  buyoutPayments,
  buyoutSchedule,
  clients,
  saleManagers,
  scooterModels,
  scooters,
  users,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { requireRole } from "../auth/plugin.js";
import { requireDirectorApproval } from "./approvals.js";
import { scooterLabel } from "./scooters.js";
import {
  applyPayment,
  buildSchedule,
  computeDiscipline,
  computeProgress,
  computeTerms,
  DEFAULT_MARKUPS,
  type BuyoutPeriod,
} from "../services/buyoutMath.js";

/**
 * «Аренда с выкупом» (задание 01.09).
 *
 * Сделка ведётся по шагам: клиент → проверка по чёрным спискам → техника →
 * условия (взнос, срок, периодичность) → договор → подписание. Подписание
 * строит график платежей и переводит технику в статус «Выкуп».
 *
 * Дальше живёт график: приём платежа гасит ближайшие непогашенные строки,
 * переплата уходит в досрочное погашение. Полное досрочное закрывает
 * сделку. Просрочка считается по графику, а не хранится флагом — иначе она
 * «протухает» при любой правке.
 *
 * Наценка за срок — справочник в app_settings, правится с ключом директора.
 */

const MARKUPS_KEY = "buyout_markups";
const directorOnly = requireRole("director");

async function loadMarkups(): Promise<Record<number, number>> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, MARKUPS_KEY));
  if (!row?.value) return DEFAULT_MARKUPS;
  try {
    const parsed = JSON.parse(row.value) as Record<string, number>;
    const out: Record<number, number> = { ...DEFAULT_MARKUPS };
    for (const [k, v] of Object.entries(parsed)) {
      const n = Number(k);
      if (Number.isFinite(n) && Number.isFinite(v)) out[n] = Math.round(v);
    }
    return out;
  } catch {
    return DEFAULT_MARKUPS;
  }
}

const DealBody = z
  .object({
    clientId: z.number().int().positive().optional().nullable(),
    scooterId: z.number().int().positive().optional().nullable(),
    managerId: z.number().int().positive().optional().nullable(),
    scooterPrice: z.number().int().min(0).optional(),
    termMonths: z.number().int().min(1).max(24).optional(),
    downPayment: z.number().int().min(0).optional(),
    period: z.enum(["month", "week"]).optional(),
    startDate: z.string().optional().nullable(),
    blacklistChecked: z.boolean().optional(),
    airtagConfirmed: z.boolean().optional(),
    comment: z.string().max(1000).optional().nullable(),
  })
  .strict();

const fmtMoney = (n: number) => n.toLocaleString("ru-RU");

function dealLabel(d: { id: number; scooterName: string | null }) {
  return `выкуп #${String(d.id).padStart(4, "0")}${d.scooterName ? ` · ${d.scooterName}` : ""}`;
}

/** Пересчёт условий сделки по текущим полям. */
async function recalc(deal: typeof buyoutDeals.$inferSelect) {
  const markups = await loadMarkups();
  return computeTerms({
    scooterPrice: deal.scooterPrice,
    termMonths: deal.termMonths,
    downPayment: deal.downPayment,
    period: deal.period as BuyoutPeriod,
    markups,
  });
}

export async function buyoutRoutes(app: FastifyInstance) {
  /* ==================== СПРАВОЧНИК НАЦЕНОК ==================== */

  app.get("/markups", async () => ({ markups: await loadMarkups() }));

  app.put("/markups", async (req, reply) => {
    const Body = z.object({ markups: z.record(z.string(), z.number().int().min(0)) });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad body" });
    // Наценка — деньги компании: правка только с ключом директора.
    if (!(await requireDirectorApproval(app, req, reply, "buyout_markups"))) return;
    const before = await loadMarkups();
    const value = JSON.stringify(parsed.data.markups);
    const [existing] = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, MARKUPS_KEY));
    if (existing) {
      await db
        .update(appSettings)
        .set({ value })
        .where(eq(appSettings.key, MARKUPS_KEY));
    } else {
      await db.insert(appSettings).values({ key: MARKUPS_KEY, value });
    }
    const changes = Object.entries(parsed.data.markups)
      .filter(([k, v]) => before[Number(k)] !== v)
      .map(([k, v]) => `${k} мес: ${fmtMoney(before[Number(k)] ?? 0)} → ${fmtMoney(v)} ₽`);
    await logActivity(req, {
      entity: "settings",
      action: "buyout_markups_changed",
      summary: `Наценка за срок выкупа изменена${changes.length ? `: ${changes.join(" · ")}` : ""}`,
      meta: { before, after: parsed.data.markups },
    });
    return { markups: parsed.data.markups };
  });

  /* ==================== СДЕЛКИ ==================== */

  app.get("/deals", async () => {
    const rows = await db
      .select({
        deal: buyoutDeals,
        clientName: clients.name,
        clientPhone: clients.phone,
        blacklisted: clients.blacklisted,
        managerName: saleManagers.name,
        managerColor: saleManagers.avatarColor,
        createdBy: users.name,
      })
      .from(buyoutDeals)
      .leftJoin(clients, eq(clients.id, buyoutDeals.clientId))
      .leftJoin(saleManagers, eq(saleManagers.id, buyoutDeals.managerId))
      .leftJoin(users, eq(users.id, buyoutDeals.createdByUserId))
      .orderBy(desc(buyoutDeals.createdAt))
      .limit(1000);

    const ids = rows.map((r) => r.deal.id);
    const schedule = ids.length
      ? await db
          .select()
          .from(buyoutSchedule)
          .where(inArray(buyoutSchedule.dealId, ids))
          .orderBy(asc(buyoutSchedule.seq))
      : [];
    const byDeal = new Map<number, typeof schedule>();
    for (const r of schedule) {
      const list = byDeal.get(r.dealId) ?? [];
      list.push(r);
      byDeal.set(r.dealId, list);
    }

    return {
      items: rows.map((r) => {
        const rows2 = byDeal.get(r.deal.id) ?? [];
        return {
          ...r.deal,
          clientName: r.clientName,
          clientPhone: r.clientPhone,
          clientBlacklisted: r.blacklisted ?? false,
          managerName: r.managerName,
          managerColor: r.managerColor,
          createdBy: r.createdBy,
          schedule: rows2,
          progress: computeProgress(r.deal, rows2),
        };
      }),
    };
  });

  app.post("/deals", async (req, reply) => {
    const parsed = DealBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "bad body", details: parsed.error.issues });
    }
    const values = await buildValues(parsed.data, null);
    const [row] = await db
      .insert(buyoutDeals)
      .values({ ...values, createdByUserId: req.user?.userId ?? null })
      .returning();
    await logActivity(req, {
      entity: "buyout",
      entityId: row!.id,
      action: "created",
      summary: `Создан ${dealLabel(row!)}`,
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
      .from(buyoutDeals)
      .where(eq(buyoutDeals.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });
    if (before.status === "active" || before.status === "closed") {
      // Условия подписанной сделки не редактируем: график уже построен.
      return reply.code(409).send({ error: "deal_started" });
    }
    const values = await buildValues(parsed.data, before);
    const [row] = await db
      .update(buyoutDeals)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(buyoutDeals.id, id))
      .returning();
    await logActivity(req, {
      entity: "buyout",
      entityId: id,
      action: "updated",
      summary: `${dealLabel(row!)}: условия изменены · ${row!.termMonths} мес · взнос ${fmtMoney(row!.downPayment)} ₽ · платёж ${fmtMoney(row!.paymentAmount)} ₽`,
    });
    return row;
  });

  /** Договор сформирован. */
  app.post<{ Params: { id: string } }>(
    "/deals/:id/contract",
    async (req, reply) => {
      const id = Number(req.params.id);
      const [deal] = await db
        .select()
        .from(buyoutDeals)
        .where(eq(buyoutDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });
      if (!deal.clientId || !deal.scooterId || deal.total <= 0) {
        return reply.code(409).send({ error: "deal_incomplete" });
      }
      const [row] = await db
        .update(buyoutDeals)
        .set({
          status: deal.status === "draft" ? "contract" : deal.status,
          contractAt: deal.contractAt ?? new Date(),
          updatedAt: new Date(),
        })
        .where(eq(buyoutDeals.id, id))
        .returning();
      await logActivity(req, {
        entity: "buyout",
        entityId: id,
        action: "contract_generated",
        summary: `Сформирован договор выкупа · ${dealLabel(row!)} · ${fmtMoney(row!.total)} ₽ за ${row!.termMonths} мес`,
      });
      return row;
    },
  );

  /**
   * Подписание: строим график, фиксируем первоначальный взнос платежом,
   * технику переводим в «Выкуп».
   */
  app.post<{ Params: { id: string } }>("/deals/:id/sign", async (req, reply) => {
    const id = Number(req.params.id);
    const [deal] = await db
      .select()
      .from(buyoutDeals)
      .where(eq(buyoutDeals.id, id));
    if (!deal) return reply.code(404).send({ error: "not found" });
    if (deal.status === "active" || deal.status === "closed") {
      return reply.code(409).send({ error: "already_active" });
    }
    if (!deal.clientId || !deal.scooterId || deal.total <= 0) {
      return reply.code(409).send({ error: "deal_incomplete" });
    }
    if (!deal.airtagConfirmed) {
      return reply.code(409).send({ error: "airtag_required" });
    }
    const now = new Date();
    const start =
      deal.startDate ??
      new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
    const terms = await recalc(deal);
    const rows = buildSchedule(terms, start);

    await db.delete(buyoutSchedule).where(eq(buyoutSchedule.dealId, id));
    if (rows.length) {
      await db.insert(buyoutSchedule).values(
        rows.map((r) => ({
          dealId: id,
          seq: r.seq,
          dueDate: r.dueDate,
          amount: r.amount,
        })),
      );
    }
    if (deal.downPayment > 0) {
      await db.insert(buyoutPayments).values({
        dealId: id,
        amount: deal.downPayment,
        kind: "down_payment",
        userId: req.user?.userId ?? null,
        note: "Первоначальный взнос",
      });
    }
    const [row] = await db
      .update(buyoutDeals)
      .set({
        status: "active",
        signedAt: now,
        startDate: start,
        paymentsCount: rows.length,
        updatedAt: now,
      })
      .where(eq(buyoutDeals.id, id))
      .returning();

    // Техника уходит в «Выкуп» — она у клиента, но ещё не его.
    const [sc] = await db
      .select()
      .from(scooters)
      .where(eq(scooters.id, deal.scooterId));
    if (sc && sc.baseStatus !== "buyout") {
      await db
        .update(scooters)
        .set({ baseStatus: "buyout" })
        .where(eq(scooters.id, deal.scooterId));
      await logActivity(req, {
        entity: "scooter",
        entityId: deal.scooterId,
        action: "status_changed",
        summary: `Статус ${scooterLabel(sc.name, sc.rentalSlot)}: «${sc.baseStatus}» → «Выкуп» · передан клиенту по выкупу #${String(id).padStart(4, "0")} · из парка выбыл`,
        meta: { statusFrom: sc.baseStatus, statusTo: "buyout", buyoutId: id },
      });
    }

    await logActivity(req, {
      entity: "buyout",
      entityId: id,
      action: "signed",
      summary:
        `ВЫКУП НАЧАТ: ${dealLabel(row!)} · стоимость ${fmtMoney(row!.total)} ₽ ` +
        `(техника ${fmtMoney(row!.scooterPrice)} ₽ + наценка ${fmtMoney(row!.markup)} ₽) · ` +
        `взнос ${fmtMoney(row!.downPayment)} ₽ · ${rows.length} платежей по ${fmtMoney(row!.paymentAmount)} ₽ ` +
        `(${row!.period === "week" ? "еженедельно" : "ежемесячно"}) с ${start}`,
      meta: { total: row!.total, payments: rows.length },
    });
    return row;
  });

  /* ==================== ПЛАТЕЖИ ==================== */

  app.post<{ Params: { id: string } }>(
    "/deals/:id/payments",
    async (req, reply) => {
      const Body = z.object({
        amount: z.number().int().min(1),
        method: z.enum(["cash", "card", "transfer"]).optional(),
        note: z.string().max(500).optional().nullable(),
        /** Полное досрочное погашение — гасим весь остаток. */
        payoff: z.boolean().optional(),
      });
      const parsed = Body.safeParse(req.body);
      const id = Number(req.params.id);
      if (!parsed.success || !Number.isFinite(id)) {
        return reply.code(400).send({ error: "bad request" });
      }
      const [deal] = await db
        .select()
        .from(buyoutDeals)
        .where(eq(buyoutDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });
      if (deal.status !== "active") {
        return reply.code(409).send({ error: "deal_not_active" });
      }

      const rows = await db
        .select()
        .from(buyoutSchedule)
        .where(eq(buyoutSchedule.dealId, id))
        .orderBy(asc(buyoutSchedule.seq));
      const progress = computeProgress(deal, rows);
      const amount = parsed.data.payoff ? progress.left : parsed.data.amount;
      if (amount <= 0) return reply.code(409).send({ error: "nothing_to_pay" });

      const { updates } = applyPayment(
        rows.map((r) => ({ id: r.id, amount: r.amount, paidAmount: r.paidAmount })),
        amount,
      );
      const now = new Date();
      for (const u of updates) {
        await db
          .update(buyoutSchedule)
          .set({ paidAmount: u.paidAmount, paidAt: u.closed ? now : null })
          .where(eq(buyoutSchedule.id, u.id));
      }

      const kind = parsed.data.payoff
        ? "early_full"
        : updates.length > 1
          ? "early_partial"
          : "regular";
      await db.insert(buyoutPayments).values({
        dealId: id,
        amount,
        method: parsed.data.method ?? "cash",
        kind,
        userId: req.user?.userId ?? null,
        note: parsed.data.note ?? null,
      });

      const after = await db
        .select()
        .from(buyoutSchedule)
        .where(eq(buyoutSchedule.dealId, id))
        .orderBy(asc(buyoutSchedule.seq));
      const p2 = computeProgress(deal, after);
      let closed = false;
      if (p2.left <= 0) {
        closed = true;
        await db
          .update(buyoutDeals)
          .set({ status: "closed", closedAt: now, updatedAt: now })
          .where(eq(buyoutDeals.id, id));
        // Техника окончательно уходит клиенту.
        if (deal.scooterId) {
          const [sc] = await db
            .select()
            .from(scooters)
            .where(eq(scooters.id, deal.scooterId));
          if (sc) {
            await db
              .update(scooters)
              .set({ baseStatus: "sold" })
              .where(eq(scooters.id, deal.scooterId));
            await logActivity(req, {
              entity: "scooter",
              entityId: deal.scooterId,
              action: "status_changed",
              summary: `Статус ${scooterLabel(sc.name, sc.rentalSlot)}: «Выкуп» → «Продан» · выкуп #${String(id).padStart(4, "0")} закрыт, техника перешла клиенту`,
              meta: { statusFrom: sc.baseStatus, statusTo: "sold", buyoutId: id },
            });
          }
        }
      }

      await logActivity(req, {
        entity: "buyout",
        entityId: id,
        action: closed ? "closed" : "payment",
        summary: closed
          ? `ВЫКУП ЗАКРЫТ: ${dealLabel(deal)} · последний платёж ${fmtMoney(amount)} ₽ · выплачено полностью ${fmtMoney(deal.total)} ₽`
          : `Платёж по выкупу ${fmtMoney(amount)} ₽ · ${dealLabel(deal)} · закрыто ${p2.paidCount} из ${after.length} · остаток ${fmtMoney(p2.left)} ₽` +
            (kind === "early_partial" ? " · досрочно" : ""),
        meta: { amount, kind, left: p2.left },
      });
      return { ok: true, closed, progress: p2 };
    },
  );

  app.post<{ Params: { id: string }; Body: { reason?: string; status?: string } }>(
    "/deals/:id/cancel",
    async (req, reply) => {
      const id = Number(req.params.id);
      const [deal] = await db
        .select()
        .from(buyoutDeals)
        .where(eq(buyoutDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });
      const reason = (req.body?.reason ?? "").slice(0, 500) || null;
      const status = req.body?.status === "defaulted" ? "defaulted" : "cancelled";
      const [row] = await db
        .update(buyoutDeals)
        .set({ status, cancelReason: reason, updatedAt: new Date() })
        .where(eq(buyoutDeals.id, id))
        .returning();
      // Техника возвращается в парк — она физически у нас.
      if (deal.scooterId && deal.status === "active") {
        await db
          .update(scooters)
          .set({ baseStatus: "ready" })
          .where(eq(scooters.id, deal.scooterId));
      }
      await logActivity(req, {
        entity: "buyout",
        entityId: id,
        action: status === "defaulted" ? "defaulted" : "cancelled",
        summary:
          (status === "defaulted"
            ? `ВЫКУП СОРВАН: ${dealLabel(row!)}`
            : `Отменён ${dealLabel(row!)}`) + (reason ? ` · причина: ${reason}` : ""),
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
        .from(buyoutDeals)
        .where(eq(buyoutDeals.id, id));
      if (!deal) return reply.code(404).send({ error: "not found" });
      await db.delete(buyoutDeals).where(eq(buyoutDeals.id, id));
      await logActivity(req, {
        entity: "buyout",
        entityId: id,
        action: "deleted",
        summary: `Удалён ${dealLabel(deal)} · статус «${deal.status}» · сумма ${fmtMoney(deal.total)} ₽ · восстановить нельзя`,
        meta: { snapshot: deal },
      });
      return { ok: true };
    },
  );

  /** История платежей и дисциплина по сделке. */
  app.get<{ Params: { id: string } }>("/deals/:id/payments", async (req, reply) => {
    const id = Number(req.params.id);
    const [deal] = await db
      .select()
      .from(buyoutDeals)
      .where(eq(buyoutDeals.id, id));
    if (!deal) return reply.code(404).send({ error: "not found" });
    const payments = await db
      .select()
      .from(buyoutPayments)
      .where(eq(buyoutPayments.dealId, id))
      .orderBy(desc(buyoutPayments.paidAt));
    const rows = await db
      .select()
      .from(buyoutSchedule)
      .where(eq(buyoutSchedule.dealId, id))
      .orderBy(asc(buyoutSchedule.seq));
    return {
      payments,
      schedule: rows,
      progress: computeProgress(deal, rows),
      discipline: computeDiscipline(
        rows.map((r) => ({
          dueDate: r.dueDate,
          amount: r.amount,
          paidAmount: r.paidAmount,
          paidAt: r.paidAt,
        })),
      ),
    };
  });

  /* ==================== ДОГОВОР ==================== */

  app.get<{ Params: { id: string }; Querystring: { format?: string } }>(
    "/deals/:id/document",
    async (req, reply) => {
      const id = Number(req.params.id);
      const { loadBuyoutBundle, renderBuyoutHtml, renderBuyoutHtmlForWord } =
        await import("../documents/buyout-document.js");
      const bundle = await loadBuyoutBundle(id);
      if (!bundle) return reply.code(404).send({ error: "not found" });
      if (req.query.format === "docx") {
        const wordHtml = await renderBuyoutHtmlForWord(bundle);
        const filename = `Договор выкупа ${String(id).padStart(4, "0")}.doc`;
        await logActivity(req, {
          entity: "buyout",
          entityId: id,
          action: "document_downloaded",
          summary: `Скачан договор выкупа (Word) по сделке #${id}`,
        });
        return reply
          .header("Content-Type", "application/msword; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          )
          .send(wordHtml);
      }
      const html = await renderBuyoutHtml(bundle);
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

/** Собирает поля сделки: снимок техники + пересчёт условий. */
async function buildValues(
  input: z.infer<typeof DealBody>,
  before: typeof buyoutDeals.$inferSelect | null,
) {
  const values: Record<string, unknown> = {};
  if (input.clientId !== undefined) values.clientId = input.clientId;
  if (input.managerId !== undefined) values.managerId = input.managerId;
  if (input.comment !== undefined) values.comment = input.comment;
  if (input.startDate !== undefined) values.startDate = input.startDate;
  if (input.blacklistChecked !== undefined) {
    values.blacklistChecked = input.blacklistChecked;
  }
  if (input.airtagConfirmed !== undefined) {
    values.airtagConfirmed = input.airtagConfirmed;
  }

  let scooterPrice = input.scooterPrice ?? before?.scooterPrice ?? 0;
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
        values.mileage = sc.mileage;
        // Базовая цена — из карточки: цена продажи, иначе рыночная.
        if (input.scooterPrice === undefined) {
          scooterPrice = sc.salePrice ?? sc.marketValue ?? sc.purchasePrice ?? 0;
        }
      }
    }
  }

  const terms = computeTerms({
    scooterPrice,
    termMonths: input.termMonths ?? before?.termMonths ?? 1,
    downPayment: input.downPayment ?? before?.downPayment ?? 0,
    period: (input.period ?? before?.period ?? "month") as BuyoutPeriod,
    markups: await loadMarkups(),
  });
  values.scooterPrice = terms.scooterPrice;
  values.termMonths = terms.termMonths;
  values.markup = terms.markup;
  values.total = terms.total;
  values.downPayment = terms.downPayment;
  values.financed = terms.financed;
  values.period = terms.period;
  values.paymentAmount = terms.paymentAmount;
  values.paymentsCount = terms.paymentsCount;
  return values;
}
