import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  appSettings,
  investorPayouts,
  investors,
  payments,
  rentals,
  scooters,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

/**
 * Правки 2.0 (26.08): инвесторы партнёрской техники — п.6, 7, 8.
 *
 * Техника добавляется ЧЕРЕЗ инвестора (scooters.investor_id). Метрики
 * инвестора (п.8):
 *   • units — живая техника (без archived/deleted);
 *   • invested — размер инвестиций = Σ цен закупа его единиц;
 *   • income — доход инвестора за период = его доля от выручки техники.
 * Выручка считается по тем же правилам, что и общая «Выручка» CRM
 * (paid-платежи без залогов/возвратов) — см. countsAsRevenueWhere().
 *
 * Выплаты (п.6): график вычисляется на лету из payout_period/payout_day
 * инвестора; факт «выплачено» — запись в investor_payouts.
 */

const CreateInvestorBody = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().max(30).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    payoutPeriod: z.enum(["week", "month"]).optional(),
    payoutDay: z.number().int().min(1).max(31).optional(),
  })
  .strict();

const PatchInvestorBody = CreateInvestorBody.partial();

/** Дефолтный процент инвестора из настроек (fallback 50). */
async function defaultShare(): Promise<number> {
  const [row] = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, "partner_share_default"));
  const n = Number(row?.value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 50;
}

type ScooterLite = {
  id: number;
  name: string;
  purchasePrice: number | null;
  partnerShare: number | null;
};

/** Живая техника инвестора (без архива и удалённых). */
async function scootersOf(investorIds: number[]): Promise<Map<number, ScooterLite[]>> {
  if (investorIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: scooters.id,
      name: scooters.name,
      purchasePrice: scooters.purchasePrice,
      partnerShare: scooters.partnerShare,
      investorId: scooters.investorId,
    })
    .from(scooters)
    .where(
      and(
        inArray(scooters.investorId, investorIds),
        isNull(scooters.archivedAt),
        isNull(scooters.deletedAt),
      ),
    );
  const map = new Map<number, ScooterLite[]>();
  for (const r of rows) {
    const list = map.get(r.investorId!) ?? [];
    list.push(r);
    map.set(r.investorId!, list);
  }
  return map;
}

/**
 * Доход инвестора за период [from..to]: Σ по его технике
 * (выручка единицы × её процент). Правила выручки — как в CRM:
 * paid=true, не исключено из выручки, тип не залог/возврат, метод
 * «из залога» не считается (кроме удержания deposit_forfeit).
 */
async function investorIncome(
  units: ScooterLite[],
  from: Date,
  to: Date,
  shareDefault: number,
): Promise<{ revenue: number; income: number }> {
  if (units.length === 0) return { revenue: 0, income: 0 };
  const scooterIds = units.map((u) => u.id);
  const rows = await db
    .select({
      scooterId: rentals.scooterId,
      amount: payments.amount,
      type: payments.type,
      method: payments.method,
    })
    .from(payments)
    .innerJoin(rentals, eq(payments.rentalId, rentals.id))
    .where(
      and(
        inArray(rentals.scooterId, scooterIds),
        eq(payments.paid, true),
        gte(payments.paidAt, from),
        lte(payments.paidAt, to),
        sql`${payments.excludedFromRevenue} IS NOT TRUE`,
      ),
    );
  const revByScooter = new Map<number, number>();
  for (const r of rows) {
    if (r.type === "deposit" || r.type === "refund") continue;
    if (r.method === "deposit" && r.type !== "deposit_forfeit") continue;
    if (r.scooterId == null) continue;
    revByScooter.set(r.scooterId, (revByScooter.get(r.scooterId) ?? 0) + r.amount);
  }
  let revenue = 0;
  let income = 0;
  for (const u of units) {
    const rev = revByScooter.get(u.id) ?? 0;
    const share = u.partnerShare ?? shareDefault;
    revenue += rev;
    income += Math.floor((rev * share) / 100);
  }
  return { revenue, income };
}

/** ISO-дата (локальная, без времени). */
function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * График выплат: последние `count` РАСЧЁТНЫХ периодов инвестора,
 * заканчивая ближайшим прошедшим/сегодняшним днём выплаты.
 * Период = [прошлый день выплаты, следующий день выплаты).
 */
function payoutPeriods(
  period: string,
  day: number,
  count: number,
  now = new Date(),
): { start: Date; end: Date; due: Date }[] {
  const res: { start: Date; end: Date; due: Date }[] = [];
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "month") {
    const dom = Math.min(Math.max(day, 1), 28); // 29-31 схлопываем к 28 — есть у всех месяцев
    // Ближайший день выплаты (включая сегодня)
    let due = new Date(today.getFullYear(), today.getMonth(), dom);
    if (due.getTime() > today.getTime()) due = new Date(today.getFullYear(), today.getMonth() - 1, dom);
    for (let i = 0; i < count; i++) {
      const d = new Date(due.getFullYear(), due.getMonth() - i, dom);
      const start = new Date(d.getFullYear(), d.getMonth() - 1, dom);
      res.push({ start, end: d, due: d });
    }
  } else {
    // week: day 1 (пн) … 7 (вс); JS getDay(): 0 вс … 6 сб
    const jsDay = day % 7; // 7 (вс) → 0
    let due = new Date(today);
    while (due.getDay() !== jsDay) due.setDate(due.getDate() - 1);
    for (let i = 0; i < count; i++) {
      const d = new Date(due);
      d.setDate(d.getDate() - 7 * i);
      const start = new Date(d);
      start.setDate(start.getDate() - 7);
      res.push({ start, end: d, due: d });
    }
  }
  return res;
}

export async function investorsRoutes(app: FastifyInstance) {
  /** Список инвесторов с метриками (п.8). ?from&to — период дохода. */
  app.get("/", async (req) => {
    const q = req.query as { from?: string; to?: string };
    const now = new Date();
    // По умолчанию метрика дохода — за последние 30 дней.
    const to = q.to ? new Date(q.to + "T23:59:59") : now;
    const from = q.from
      ? new Date(q.from + "T00:00:00")
      : new Date(to.getTime() - 30 * 86_400_000);

    const list = await db
      .select()
      .from(investors)
      .where(isNull(investors.deletedAt))
      .orderBy(investors.name);
    const unitsBy = await scootersOf(list.map((i) => i.id));
    const shareDefault = await defaultShare();

    const items = [];
    for (const inv of list) {
      const units = unitsBy.get(inv.id) ?? [];
      const invested = units.reduce((s, u) => s + (u.purchasePrice ?? 0), 0);
      const { revenue, income } = await investorIncome(units, from, to, shareDefault);
      // Средний ЕЖЕМЕСЯЧНЫЙ доход: доход за период, приведённый к 30 дням.
      const periodDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000));
      const monthlyIncome = Math.round((income * 30) / periodDays);
      items.push({
        ...inv,
        units: units.length,
        invested,
        revenue,
        income,
        monthlyIncome,
        scooterIds: units.map((u) => u.id),
      });
    }
    return { items, period: { from: ymd(from), to: ymd(to) } };
  });

  app.post("/", async (req, reply) => {
    const parsed = CreateInvestorBody.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    const [row] = await db
      .insert(investors)
      .values({
        name: parsed.data.name.trim(),
        phone: parsed.data.phone ?? null,
        note: parsed.data.note ?? null,
        payoutPeriod: parsed.data.payoutPeriod ?? "week",
        payoutDay: parsed.data.payoutDay ?? 5,
      })
      .returning();
    await logActivity(req, {
      entity: "investor",
      entityId: row!.id,
      action: "created",
      summary: `Добавлен инвестор «${row!.name}»`,
    });
    return reply.code(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed = PatchInvestorBody.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    const [before] = await db.select().from(investors).where(eq(investors.id, id));
    if (!before || before.deletedAt) return reply.code(404).send({ error: "not found" });
    const [row] = await db
      .update(investors)
      .set(parsed.data)
      .where(eq(investors.id, id))
      .returning();
    const changes: string[] = [];
    if (parsed.data.payoutPeriod && parsed.data.payoutPeriod !== before.payoutPeriod)
      changes.push(
        `периодичность: ${before.payoutPeriod === "week" ? "неделя" : "месяц"} → ${parsed.data.payoutPeriod === "week" ? "неделя" : "месяц"}`,
      );
    if (parsed.data.payoutDay && parsed.data.payoutDay !== before.payoutDay)
      changes.push(`день выплаты: ${before.payoutDay} → ${parsed.data.payoutDay}`);
    await logActivity(req, {
      entity: "investor",
      entityId: id,
      action: "updated",
      summary:
        changes.length > 0
          ? `Инвестор «${row!.name}»: ${changes.join(", ")}`
          : `Отредактирован инвестор «${row!.name}»`,
    });
    return row;
  });

  /** Удаление — только без техники (мягкое). */
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const units = await db
      .select({ id: scooters.id })
      .from(scooters)
      .where(
        and(
          eq(scooters.investorId, id),
          isNull(scooters.archivedAt),
          isNull(scooters.deletedAt),
        ),
      );
    if (units.length > 0)
      return reply.code(409).send({
        error: "has_scooters",
        message: `У инвестора ${units.length} ед. техники — сначала перепривяжите или отправьте её в архив.`,
      });
    const [row] = await db
      .update(investors)
      .set({ deletedAt: sql`now()` })
      .where(eq(investors.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    await logActivity(req, {
      entity: "investor",
      entityId: id,
      action: "deleted",
      summary: `Удалён инвестор «${row.name}»`,
    });
    return { ok: true };
  });

  /**
   * П.6: график выплат инвестора — последние N периодов с суммами и
   * статусом «выплачено». due=сегодня и не выплачено → напоминание.
   */
  app.get<{ Params: { id: string } }>("/:id/payouts", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [inv] = await db.select().from(investors).where(eq(investors.id, id));
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: "not found" });
    const q = req.query as { count?: string };
    const count = Math.min(Math.max(Number(q.count) || 8, 1), 26);

    const unitsBy = await scootersOf([id]);
    const units = unitsBy.get(id) ?? [];
    const shareDefault = await defaultShare();
    const periods = payoutPeriods(inv.payoutPeriod, inv.payoutDay, count);

    const paidRows = await db
      .select()
      .from(investorPayouts)
      .where(eq(investorPayouts.investorId, id));
    const paidByKey = new Map(paidRows.map((p) => [`${p.periodStart}_${p.periodEnd}`, p]));

    const todayKey = ymd(new Date());
    const items = [];
    for (const p of periods) {
      // Период выручки: [start, end) — конец не включается (это уже
      // следующий период).
      const endExclusive = new Date(p.end.getTime() - 1);
      const { income } = await investorIncome(units, p.start, endExclusive, shareDefault);
      const key = `${ymd(p.start)}_${ymd(p.end)}`;
      const paid = paidByKey.get(key) ?? null;
      items.push({
        periodStart: ymd(p.start),
        periodEnd: ymd(p.end),
        dueDate: ymd(p.due),
        amount: income,
        isDueToday: ymd(p.due) === todayKey,
        paid: paid
          ? { id: paid.id, amount: paid.amount, paidAt: paid.paidAt, note: paid.note }
          : null,
      });
    }
    return {
      investor: { id: inv.id, name: inv.name, payoutPeriod: inv.payoutPeriod, payoutDay: inv.payoutDay },
      items,
    };
  });

  /** Отметить выплату произведённой (галочка в графике). */
  app.post<{ Params: { id: string } }>("/:id/payouts", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z
      .object({
        periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        amount: z.number().int().min(0),
        note: z.string().max(300).optional().nullable(),
      })
      .strict();
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    const [inv] = await db.select().from(investors).where(eq(investors.id, id));
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: "not found" });
    const userId = req.user?.userId ?? null;
    try {
      const [row] = await db
        .insert(investorPayouts)
        .values({
          investorId: id,
          periodStart: parsed.data.periodStart,
          periodEnd: parsed.data.periodEnd,
          amount: parsed.data.amount,
          paidBy: userId,
          note: parsed.data.note ?? null,
        })
        .returning();
      await logActivity(req, {
        entity: "investor",
        entityId: id,
        action: "payout",
        summary: `Выплата инвестору «${inv.name}»: ${parsed.data.amount.toLocaleString("ru-RU")} ₽ за период ${parsed.data.periodStart} — ${parsed.data.periodEnd}`,
      });
      return reply.code(201).send(row);
    } catch (e) {
      if (String(e).includes("investor_payouts_period_uniq"))
        return reply.code(409).send({ error: "already_paid" });
      throw e;
    }
  });

  /** Снять отметку выплаты (ошиблись галочкой). */
  app.delete<{ Params: { id: string; payoutId: string } }>(
    "/:id/payouts/:payoutId",
    async (req, reply) => {
      const id = Number(req.params.id);
      const payoutId = Number(req.params.payoutId);
      if (!Number.isFinite(id) || !Number.isFinite(payoutId))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .delete(investorPayouts)
        .where(and(eq(investorPayouts.id, payoutId), eq(investorPayouts.investorId, id)))
        .returning();
      if (!row) return reply.code(404).send({ error: "not found" });
      const [inv] = await db.select().from(investors).where(eq(investors.id, id));
      await logActivity(req, {
        entity: "investor",
        entityId: id,
        action: "payout_undo",
        summary: `Снята отметка выплаты «${inv?.name ?? id}» за ${row.periodStart} — ${row.periodEnd} (${row.amount.toLocaleString("ru-RU")} ₽)`,
      });
      return { ok: true };
    },
  );
}
