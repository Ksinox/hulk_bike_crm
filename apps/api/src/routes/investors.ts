import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  appSettings,
  investorPayouts,
  investors,
  payments,
  rentals,
  scooters,
  users,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

/**
 * Правки 2.0 (26.08) + правки 27.08: инвесторы партнёрской техники.
 *
 * Техника добавляется ЧЕРЕЗ инвестора (scooters.investor_id). Процент —
 * свойство ИНВЕСТОРА (investors.share, правка 27.08): задаётся при
 * добавлении/изменении, его техника наследует процент автоматически.
 * scooters.partner_share остался только как fallback для партнёрских
 * единиц без инвестора (legacy).
 *
 * Метрики инвестора (п.8):
 *   • units — живая техника (без archived/deleted);
 *   • invested — размер инвестиций = Σ цен закупа его единиц;
 *   • income — доход инвестора за период = его доля от выручки техники.
 * Выручка считается по тем же правилам, что и общая «Выручка» CRM
 * (paid-платежи без залогов/возвратов).
 *
 * Выплаты (правка 27.08) — «накопилось → выплатили», без графика периодов:
 *   • accrued = доля инвестора от выручки его техники ЗА ВСЁ ВРЕМЯ минус
 *     сумма уже произведённых выплат;
 *   • POST /:id/payouts фиксирует выплату «сейчас» на сумму accrued
 *     (сервер сам считает — оператор не может выплатить будущим/задним
 *     числом или больше, чем накопилось), при нуле — 409 nothing_to_pay;
 *   • история выплат — записи с датой, суммой и кто провёл.
 */

const CreateInvestorBody = z
  .object({
    name: z.string().min(1).max(200),
    phone: z.string().max(30).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    payoutPeriod: z.enum(["week", "month"]).optional(),
    payoutDay: z.number().int().min(1).max(31).optional(),
    /** Процент инвестора (его доля от выручки его техники). */
    share: z.number().int().min(0).max(100).optional(),
  })
  .strict();

const PatchInvestorBody = CreateInvestorBody.partial();

/** Дефолтный процент из настроек (fallback 50) — для единиц без инвестора. */
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
};

/** Живая техника инвестора (без архива и удалённых). */
async function scootersOf(investorIds: number[]): Promise<Map<number, ScooterLite[]>> {
  if (investorIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: scooters.id,
      name: scooters.name,
      purchasePrice: scooters.purchasePrice,
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
 * Доход инвестора за период [from..to]: выручка его техники × его процент.
 * Правила выручки — как в CRM: paid=true, не исключено из выручки, тип не
 * залог/возврат, метод «из залога» не считается (кроме deposit_forfeit).
 */
async function investorIncome(
  units: ScooterLite[],
  from: Date,
  to: Date,
  sharePct: number,
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
  let revenue = 0;
  for (const r of rows) {
    if (r.type === "deposit" || r.type === "refund") continue;
    if (r.method === "deposit" && r.type !== "deposit_forfeit") continue;
    revenue += r.amount;
  }
  return { revenue, income: Math.floor((revenue * sharePct) / 100) };
}

/** ISO-дата (локальная, без времени). */
function ymd(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Ближайший день выплаты (сегодня или позже) по настройке инвестора.
 * Это НАПОМИНАНИЕ, не график: платить можно в любой день, когда накопилось.
 */
function nextDueDate(period: string, day: number, now = new Date()): Date {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "month") {
    const dom = Math.min(Math.max(day, 1), 28);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), dom);
    return thisMonth.getTime() >= today.getTime()
      ? thisMonth
      : new Date(today.getFullYear(), today.getMonth() + 1, dom);
  }
  const jsDay = day % 7; // 7 (вс) → 0
  const d = new Date(today);
  while (d.getDay() !== jsDay) d.setDate(d.getDate() + 1);
  return d;
}

/** Начало отсчёта «за всё время» — раньше любых данных CRM. */
const EPOCH = new Date("2020-01-01T00:00:00");

/** Накоплено к выплате: доход за всё время минус уже выплаченное. */
async function accruedOf(
  invId: number,
  sharePct: number,
): Promise<{ accrued: number; incomeAll: number; revenueAll: number; paidTotal: number }> {
  const unitsBy = await scootersOf([invId]);
  const units = unitsBy.get(invId) ?? [];
  const { revenue, income } = await investorIncome(units, EPOCH, new Date(), sharePct);
  const [paidRow] = await db
    .select({ total: sql<number>`coalesce(sum(${investorPayouts.amount}), 0)::int` })
    .from(investorPayouts)
    .where(eq(investorPayouts.investorId, invId));
  const paidTotal = paidRow?.total ?? 0;
  return {
    accrued: Math.max(0, income - paidTotal),
    incomeAll: income,
    revenueAll: revenue,
    paidTotal,
  };
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

    const items = [];
    for (const inv of list) {
      const units = unitsBy.get(inv.id) ?? [];
      const invested = units.reduce((s, u) => s + (u.purchasePrice ?? 0), 0);
      const { revenue, income } = await investorIncome(units, from, to, inv.share);
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
    const share = parsed.data.share ?? (await defaultShare());
    const [row] = await db
      .insert(investors)
      .values({
        name: parsed.data.name.trim(),
        phone: parsed.data.phone ?? null,
        note: parsed.data.note ?? null,
        payoutPeriod: parsed.data.payoutPeriod ?? "week",
        payoutDay: parsed.data.payoutDay ?? 5,
        share,
      })
      .returning();
    await logActivity(req, {
      entity: "investor",
      entityId: row!.id,
      action: "created",
      summary: `Добавлен инвестор «${row!.name}» · процент ${share} %`,
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
    if (parsed.data.share != null && parsed.data.share !== before.share)
      changes.push(`процент: ${before.share} % → ${parsed.data.share} %`);
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
   * Правка 27.08: выплаты инвестора — накоплено + история.
   * accrued считается на сервере: доход за всё время − выплачено.
   */
  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    "/:id/payouts",
    async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [inv] = await db.select().from(investors).where(eq(investors.id, id));
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: "not found" });

    /**
     * Правка 31.08 (заказчик): детализация выплат — история за прошлые
     * периоды с возможностью выбрать произвольный диапазон. Без from/to
     * отдаём всю историю, как раньше.
     */
    const from = req.query.from ? new Date(req.query.from + "T00:00:00") : null;
    const to = req.query.to ? new Date(req.query.to + "T23:59:59") : null;

    const { accrued, incomeAll, revenueAll, paidTotal } = await accruedOf(id, inv.share);

    const history = await db
      .select({
        id: investorPayouts.id,
        amount: investorPayouts.amount,
        paidAt: investorPayouts.paidAt,
        paidBy: investorPayouts.paidBy,
        note: investorPayouts.note,
        method: investorPayouts.method,
        cashAmount: investorPayouts.cashAmount,
        transferAmount: investorPayouts.transferAmount,
        userName: users.name,
      })
      .from(investorPayouts)
      .leftJoin(users, eq(investorPayouts.paidBy, users.id))
      .where(
        and(
          eq(investorPayouts.investorId, id),
          ...(from ? [gte(investorPayouts.paidAt, from)] : []),
          ...(to ? [lte(investorPayouts.paidAt, to)] : []),
        ),
      )
      .orderBy(desc(investorPayouts.paidAt));

    const due = nextDueDate(inv.payoutPeriod, inv.payoutDay);
    const todayKey = ymd(new Date());
    return {
      investor: {
        id: inv.id,
        name: inv.name,
        payoutPeriod: inv.payoutPeriod,
        payoutDay: inv.payoutDay,
        share: inv.share,
      },
      accrued: {
        amount: accrued,
        incomeAll,
        revenueAll,
        paidTotal,
      },
      nextDue: {
        date: ymd(due),
        isToday: ymd(due) === todayKey,
      },
      history: history.map((h) => ({
        id: h.id,
        amount: h.amount,
        paidAt: h.paidAt,
        by: h.userName ?? null,
        note: h.note,
        method: h.method,
        cashAmount: h.cashAmount,
        transferAmount: h.transferAmount,
      })),
      /** Итог по выбранному периоду — для подписи в детализации. */
      periodTotal: history.reduce((sum, h) => sum + h.amount, 0),
      periodFilter: {
        from: req.query.from ?? null,
        to: req.query.to ?? null,
      },
    };
  },
  );

  /**
   * Выплатить накопленное. Сумму считает СЕРВЕР на момент нажатия —
   * оператор не может выплатить будущим/задним числом или больше accrued.
   * Ноль к выплате → 409 nothing_to_pay.
   */
  app.post<{ Params: { id: string } }>("/:id/payouts", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    // Способ расчёта — как везде по проекту: нал, перевод или смешанно.
    // Для смешанного храним обе доли, иначе выплату не свести с кассой.
    const Body = z
      .object({
        note: z.string().max(300).optional().nullable(),
        method: z.enum(["cash", "transfer", "mixed"]).optional(),
        cashAmount: z.number().int().min(0).optional(),
      })
      .strict();
    const parsed = Body.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    const [inv] = await db.select().from(investors).where(eq(investors.id, id));
    if (!inv || inv.deletedAt) return reply.code(404).send({ error: "not found" });

    const { accrued } = await accruedOf(id, inv.share);
    if (accrued <= 0)
      return reply.code(409).send({
        error: "nothing_to_pay",
        message: "Нет средств к выплате — доля инвестора ещё не накопилась.",
      });

    const method = parsed.data.method ?? "cash";
    const cashPart =
      method === "cash"
        ? accrued
        : method === "transfer"
          ? 0
          : Math.min(accrued, Math.max(0, parsed.data.cashAmount ?? 0));
    const transferPart = accrued - cashPart;

    const [row] = await db
      .insert(investorPayouts)
      .values({
        investorId: id,
        amount: accrued,
        paidBy: req.user?.userId ?? null,
        note: parsed.data.note ?? null,
        method,
        cashAmount: cashPart,
        transferAmount: transferPart,
      })
      .returning();
    const methodText =
      method === "mixed"
        ? `смешанно: ${cashPart.toLocaleString("ru-RU")} ₽ наличными и ${transferPart.toLocaleString("ru-RU")} ₽ переводом`
        : method === "transfer"
          ? "переводом"
          : "наличными";
    await logActivity(req, {
      entity: "investor",
      entityId: id,
      action: "payout",
      summary: `Выплата инвестору «${inv.name}»: ${accrued.toLocaleString("ru-RU")} ₽ ${methodText} (процент ${inv.share} %, счётчик обнулён)`,
    });
    return reply.code(201).send(row);
  });

  /** Отменить выплату (провели по ошибке) — сумма вернётся в «к выплате». */
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
        summary: `Отменена выплата инвестору «${inv?.name ?? id}» на ${row.amount.toLocaleString("ru-RU")} ₽ — сумма вернулась в «к выплате»`,
      });
      return { ok: true };
    },
  );
}
