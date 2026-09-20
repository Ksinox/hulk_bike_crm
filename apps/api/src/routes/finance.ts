import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  billingPeriodAnchors,
  financeCategories,
  financeEntries,
  financePayroll,
  financePeople,
  financeRecurring,
} from "../db/schema.js";
import { logActivity, type DiffPayload } from "../services/activityLog.js";
import { requirePermission } from "../auth/plugin.js";
import {
  periodFor,
  toISODate,
  type BillingAnchorRow,
} from "../services/billingPeriod.js";

/**
 * Блок «Финансы» (задание заказчика 20.09) — форма ДДС.
 *
 * Зачем: видеть, откуда деньги приходят и куда уходят, и сравнивать периоды,
 * чтобы усиливать сильные направления и резать слабые места.
 *
 * Три договорённости, на которых стоит блок:
 *
 * 1. **Изоляция.** С арендами, ремонтами и продажами блок данными не
 *    обменивается: суммы вносятся руками. Так цифры ДДС не спорят с
 *    операционным учётом (решение заказчика, п.9 задания).
 * 2. **Период — общий.** Берём расчётный период CRM (у заказчика с 15-го по
 *    15-е). Своего календаря у блока нет, иначе в системе будет два разных
 *    «месяца». Ключ периода (`periodKey`) — дата первого дня, YYYY-MM-DD.
 * 3. **Всё правится.** Любая строка редактируется на месте, удаление мягкое
 *    и возвращается кнопкой «Отменить»; постоянные издержки и ФОТ правятся
 *    в своём периоде, не задевая прошлые.
 *
 * Постоянные издержки: шаблон (`finance_recurring`) сам разворачивается в
 * запись периода при первом открытии этого периода — без крона и без
 * «забыли перенести». Повтор защищён уникальным индексом
 * (recurring_id, period_key).
 */

const financeOnly = requirePermission("data.finance");

/* ──────────────── период ──────────────── */

async function anchors(): Promise<BillingAnchorRow[]> {
  const rows = await db
    .select()
    .from(billingPeriodAnchors)
    .orderBy(asc(billingPeriodAnchors.effectiveFrom));
  return rows.map((r) => ({
    id: r.id,
    effectiveFrom:
      typeof r.effectiveFrom === "string"
        ? r.effectiveFrom
        : toISODate(r.effectiveFrom as unknown as Date),
    ruleStartDay: r.ruleStartDay,
    kind: r.kind as "regular" | "transition",
    transitionEndDate: r.transitionEndDate
      ? typeof r.transitionEndDate === "string"
        ? r.transitionEndDate
        : toISODate(r.transitionEndDate as unknown as Date)
      : null,
  }));
}

function parseISO(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}

/** Ключ периода, в который попадает дата. */
function keyOf(date: Date, a: BillingAnchorRow[]): string {
  return toISODate(periodFor(date, a).start);
}

/** Границы периода по его ключу: [начало, конец включительно]. */
function boundsOf(key: string, a: BillingAnchorRow[]): { from: string; to: string } {
  const p = periodFor(parseISO(key), a);
  const lastDay = new Date(p.end.getTime() - 86_400_000);
  return { from: toISODate(p.start), to: toISODate(lastDay) };
}

/** Ключи N последних периодов, начиная с того, где сейчас `from`. */
function keysBack(from: Date, n: number, a: BillingAnchorRow[]): string[] {
  const out: string[] = [];
  let cur = periodFor(from, a);
  for (let i = 0; i < n; i++) {
    out.push(toISODate(cur.start));
    cur = periodFor(new Date(cur.start.getTime() - 86_400_000), a);
  }
  return out;
}

/* ──────────────── развёртка постоянных издержек и ФОТ ──────────────── */

/**
 * Разворачивает в период всё, что должно там быть само: постоянные издержки
 * и строки ФОТ по активным людям. Идемпотентно — повторный вызов ничего не
 * добавляет. Будущие периоды не трогаем: деньги за них ещё не тратились.
 */
async function materialize(periodKey: string, a: BillingAnchorRow[]): Promise<void> {
  const { from } = boundsOf(periodKey, a);
  if (parseISO(periodKey).getTime() > Date.now()) return;

  const templates = await db
    .select()
    .from(financeRecurring)
    .where(and(eq(financeRecurring.active, true), isNull(financeRecurring.archivedAt)));
  for (const t of templates) {
    if (t.startPeriod > periodKey) continue;
    await db
      .insert(financeEntries)
      .values({
        kind: t.kind,
        categoryId: t.categoryId,
        name: t.name,
        amount: t.amount,
        at: from,
        periodKey,
        source: "recurring",
        recurringId: t.id,
        note: t.note,
      })
      .onConflictDoNothing();
  }

  const people = await db
    .select()
    .from(financePeople)
    .where(and(eq(financePeople.active, true), isNull(financePeople.archivedAt)));
  for (const p of people) {
    await db
      .insert(financePayroll)
      .values({
        periodKey,
        personId: p.id,
        personName: p.name,
        salary: p.salaryDefault,
        salesBonus: 0,
      })
      .onConflictDoNothing();
  }
}

/* ──────────────── схемы тела запросов ──────────────── */

const CategoryBody = z
  .object({
    kind: z.enum(["income", "expense"]),
    name: z.string().trim().min(1).max(120),
    fixed: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

const EntryBody = z
  .object({
    kind: z.enum(["income", "expense"]),
    categoryId: z.number().int().positive().nullable().optional(),
    name: z.string().trim().min(1).max(200),
    amount: z.number().int().min(0).max(1_000_000_000),
    at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();

const RecurringBody = z
  .object({
    kind: z.enum(["income", "expense"]).optional(),
    categoryId: z.number().int().positive().nullable().optional(),
    name: z.string().trim().min(1).max(200),
    amount: z.number().int().min(0).max(1_000_000_000),
    startPeriod: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    active: z.boolean().optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();

const PersonBody = z
  .object({
    name: z.string().trim().min(1).max(120),
    role: z.string().max(120).nullable().optional(),
    salaryDefault: z.number().int().min(0).max(100_000_000).optional(),
    active: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
  })
  .strict();

const PayrollBody = z
  .object({
    salary: z.number().int().min(0).max(100_000_000).optional(),
    salesBonus: z.number().int().min(0).max(100_000_000).optional(),
    note: z.string().max(500).nullable().optional(),
  })
  .strict();

const money = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
const kindWord = (k: string) => (k === "income" ? "приход" : "расход");

export async function financeRoutes(app: FastifyInstance) {
  app.addHook("preHandler", financeOnly);

  /* ── статьи ── */

  app.get("/categories", async () => {
    const items = await db
      .select()
      .from(financeCategories)
      .where(isNull(financeCategories.archivedAt))
      .orderBy(asc(financeCategories.kind), asc(financeCategories.sortOrder), asc(financeCategories.id));
    return { items };
  });

  app.post("/categories", async (req, reply) => {
    const parsed = CategoryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [row] = await db.insert(financeCategories).values(parsed.data).returning();
    await logActivity(req, {
      entity: "finance",
      entityId: row!.id,
      action: "created",
      summary: `Финансы: добавлена статья «${row!.name}» (${kindWord(row!.kind)})`,
    });
    return reply.code(201).send({ item: row });
  });

  app.patch<{ Params: { id: string } }>("/categories/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = CategoryBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [before] = await db.select().from(financeCategories).where(eq(financeCategories.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    const [row] = await db
      .update(financeCategories)
      .set(parsed.data)
      .where(eq(financeCategories.id, id))
      .returning();
    const diff: DiffPayload = {};
    if (parsed.data.name && parsed.data.name !== before.name) {
      diff.name = { label: "Название", from: before.name, to: parsed.data.name, kind: "text" };
    }
    if (parsed.data.fixed !== undefined && parsed.data.fixed !== before.fixed) {
      diff.fixed = {
        label: "Постоянная статья",
        from: before.fixed ? "да" : "нет",
        to: parsed.data.fixed ? "да" : "нет",
        kind: "text",
      };
    }
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "updated",
      summary: `Финансы: статья «${before.name}» изменена`,
      diff: Object.keys(diff).length ? diff : undefined,
    });
    return { item: row };
  });

  app.delete<{ Params: { id: string } }>("/categories/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const [before] = await db.select().from(financeCategories).where(eq(financeCategories.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    const usedRows = await db
      .select({ used: sql<number>`count(*)::int` })
      .from(financeEntries)
      .where(and(eq(financeEntries.categoryId, id), isNull(financeEntries.deletedAt)));
    const used = usedRows[0]?.used ?? 0;
    await db
      .update(financeCategories)
      .set({ archivedAt: new Date() })
      .where(eq(financeCategories.id, id));
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "deleted",
      summary: `Финансы: статья «${before.name}» убрана из списка${used ? ` (движений с ней: ${used} — они остались)` : ""}`,
    });
    return { ok: true, used };
  });

  /* ── движения денег ── */

  app.get<{ Querystring: { period?: string; back?: string } }>("/entries", async (req) => {
    const a = await anchors();
    const periodKey = req.query.period ?? keyOf(new Date(), a);
    const back = Math.min(36, Math.max(1, Number(req.query.back ?? 13)));
    await materialize(periodKey, a);
    const keys = keysBack(parseISO(periodKey), back, a);
    const oldest = keys[keys.length - 1]!;
    const { to } = boundsOf(periodKey, a);
    const items = await db
      .select()
      .from(financeEntries)
      .where(
        and(
          isNull(financeEntries.deletedAt),
          gte(financeEntries.at, boundsOf(oldest, a).from),
          lte(financeEntries.at, to),
        ),
      )
      .orderBy(desc(financeEntries.at), desc(financeEntries.id));
    return { items, periodKey, periods: keys, bounds: boundsOf(periodKey, a) };
  });

  app.post("/entries", async (req, reply) => {
    const parsed = EntryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const a = await anchors();
    const periodKey = keyOf(parseISO(parsed.data.at), a);
    const [row] = await db
      .insert(financeEntries)
      .values({
        ...parsed.data,
        periodKey,
        createdBy: req.user?.userId ?? null,
      })
      .returning();
    await logActivity(req, {
      entity: "finance",
      entityId: row!.id,
      action: "created",
      summary: `Финансы: ${kindWord(row!.kind)} «${row!.name}» ${money(row!.amount)} от ${row!.at}`,
    });
    return reply.code(201).send({ item: row });
  });

  app.patch<{ Params: { id: string } }>("/entries/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = EntryBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [before] = await db.select().from(financeEntries).where(eq(financeEntries.id, id));
    if (!before || before.deletedAt) return reply.code(404).send({ error: "not_found" });
    const a = await anchors();
    const next: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.at) next.periodKey = keyOf(parseISO(parsed.data.at), a);
    const [row] = await db
      .update(financeEntries)
      .set(next)
      .where(eq(financeEntries.id, id))
      .returning();
    const diff: DiffPayload = {};
    if (parsed.data.amount !== undefined && parsed.data.amount !== before.amount) {
      diff.amount = {
        label: "Сумма",
        from: money(before.amount),
        to: money(parsed.data.amount),
        kind: "text",
      };
    }
    if (parsed.data.name && parsed.data.name !== before.name) {
      diff.name = { label: "Наименование", from: before.name, to: parsed.data.name, kind: "text" };
    }
    if (parsed.data.at && parsed.data.at !== before.at) {
      diff.at = { label: "Дата", from: before.at, to: parsed.data.at, kind: "text" };
    }
    if (
      parsed.data.categoryId !== undefined &&
      parsed.data.categoryId !== before.categoryId
    ) {
      const names = await db
        .select({ id: financeCategories.id, name: financeCategories.name })
        .from(financeCategories);
      const nm = (cid: number | null) => names.find((n) => n.id === cid)?.name ?? "без статьи";
      diff.categoryId = {
        label: "Статья",
        from: nm(before.categoryId),
        to: nm(parsed.data.categoryId ?? null),
        kind: "text",
      };
    }
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "updated",
      summary: `Финансы: правка — ${kindWord(before.kind)} «${before.name}»`,
      diff: Object.keys(diff).length ? diff : undefined,
    });
    return { item: row };
  });

  /** Мягкое удаление: строка возвращается кнопкой «Отменить». */
  app.delete<{ Params: { id: string } }>("/entries/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const [before] = await db.select().from(financeEntries).where(eq(financeEntries.id, id));
    if (!before || before.deletedAt) return reply.code(404).send({ error: "not_found" });
    await db
      .update(financeEntries)
      .set({ deletedAt: new Date() })
      .where(eq(financeEntries.id, id));
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "deleted",
      summary: `Финансы: удалён ${kindWord(before.kind)} «${before.name}» ${money(before.amount)}`,
    });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/entries/:id/restore", async (req, reply) => {
    const id = Number(req.params.id);
    const [before] = await db.select().from(financeEntries).where(eq(financeEntries.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    await db
      .update(financeEntries)
      .set({ deletedAt: null })
      .where(eq(financeEntries.id, id));
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "restored",
      summary: `Финансы: возвращён ${kindWord(before.kind)} «${before.name}» ${money(before.amount)}`,
    });
    return { ok: true };
  });

  /* ── постоянные издержки ── */

  app.get("/recurring", async () => {
    const items = await db
      .select()
      .from(financeRecurring)
      .where(isNull(financeRecurring.archivedAt))
      .orderBy(asc(financeRecurring.name));
    return { items };
  });

  app.post("/recurring", async (req, reply) => {
    const parsed = RecurringBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [row] = await db.insert(financeRecurring).values(parsed.data).returning();
    const a = await anchors();
    await materialize(keyOf(new Date(), a), a);
    await logActivity(req, {
      entity: "finance",
      entityId: row!.id,
      action: "created",
      summary: `Финансы: постоянная издержка «${row!.name}» ${money(row!.amount)} — повторяется каждый период`,
    });
    return reply.code(201).send({ item: row });
  });

  /**
   * Правка шаблона меняет запись текущего периода (и будущих), прошлые
   * периоды остаются как были — иначе история задним числом «поедет».
   */
  app.patch<{ Params: { id: string } }>("/recurring/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = RecurringBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [before] = await db.select().from(financeRecurring).where(eq(financeRecurring.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    const [row] = await db
      .update(financeRecurring)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(financeRecurring.id, id))
      .returning();
    const a = await anchors();
    const cur = keyOf(new Date(), a);
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) patch.name = parsed.data.name;
    if (parsed.data.amount !== undefined) patch.amount = parsed.data.amount;
    if (parsed.data.categoryId !== undefined) patch.categoryId = parsed.data.categoryId;
    if (Object.keys(patch).length > 1) {
      await db
        .update(financeEntries)
        .set(patch)
        .where(
          and(
            eq(financeEntries.recurringId, id),
            gte(financeEntries.periodKey, cur),
            isNull(financeEntries.deletedAt),
          ),
        );
    }
    const diff: DiffPayload = {};
    if (parsed.data.amount !== undefined && parsed.data.amount !== before.amount) {
      diff.amount = { label: "Сумма", from: money(before.amount), to: money(parsed.data.amount), kind: "text" };
    }
    if (parsed.data.active !== undefined && parsed.data.active !== before.active) {
      diff.active = {
        label: "Повторяется",
        from: before.active ? "да" : "нет",
        to: parsed.data.active ? "да" : "нет",
        kind: "text",
      };
    }
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "updated",
      summary: `Финансы: постоянная издержка «${before.name}» изменена (текущий период пересчитан)`,
      diff: Object.keys(diff).length ? diff : undefined,
    });
    return { item: row };
  });

  /** Снять с повтора: прошлые записи остаются, новые не создаются. */
  app.delete<{ Params: { id: string } }>("/recurring/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const [before] = await db.select().from(financeRecurring).where(eq(financeRecurring.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    await db
      .update(financeRecurring)
      .set({ archivedAt: new Date(), active: false })
      .where(eq(financeRecurring.id, id));
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "deleted",
      summary: `Финансы: «${before.name}» снята с повтора — в следующем периоде не появится`,
    });
    return { ok: true };
  });

  /* ── ФОТ ── */

  app.get("/people", async () => {
    const items = await db
      .select()
      .from(financePeople)
      .where(isNull(financePeople.archivedAt))
      .orderBy(asc(financePeople.sortOrder), asc(financePeople.id));
    return { items };
  });

  app.post("/people", async (req, reply) => {
    const parsed = PersonBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [row] = await db.insert(financePeople).values(parsed.data).returning();
    const a = await anchors();
    await materialize(keyOf(new Date(), a), a);
    await logActivity(req, {
      entity: "finance",
      entityId: row!.id,
      action: "created",
      summary: `Финансы, ФОТ: добавлен ${row!.name}${row!.salaryDefault ? ` · оклад ${money(row!.salaryDefault)}` : ""}`,
    });
    return reply.code(201).send({ item: row });
  });

  app.patch<{ Params: { id: string } }>("/people/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = PersonBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [before] = await db.select().from(financePeople).where(eq(financePeople.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    const [row] = await db
      .update(financePeople)
      .set(parsed.data)
      .where(eq(financePeople.id, id))
      .returning();
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "updated",
      summary: `Финансы, ФОТ: ${before.name} — правка карточки`,
    });
    return { item: row };
  });

  app.delete<{ Params: { id: string } }>("/people/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const [before] = await db.select().from(financePeople).where(eq(financePeople.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    await db
      .update(financePeople)
      .set({ archivedAt: new Date(), active: false })
      .where(eq(financePeople.id, id));
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "deleted",
      summary: `Финансы, ФОТ: ${before.name} убран из списка (прошлые месяцы остались)`,
    });
    return { ok: true };
  });

  app.get<{ Querystring: { period?: string } }>("/payroll", async (req) => {
    const a = await anchors();
    const periodKey = req.query.period ?? keyOf(new Date(), a);
    await materialize(periodKey, a);
    const items = await db
      .select()
      .from(financePayroll)
      .where(eq(financePayroll.periodKey, periodKey))
      .orderBy(asc(financePayroll.id));
    return { items, periodKey };
  });

  app.patch<{ Params: { id: string } }>("/payroll/:id", async (req, reply) => {
    const id = Number(req.params.id);
    const parsed = PayrollBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const [before] = await db.select().from(financePayroll).where(eq(financePayroll.id, id));
    if (!before) return reply.code(404).send({ error: "not_found" });
    const [row] = await db
      .update(financePayroll)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(financePayroll.id, id))
      .returning();
    const diff: DiffPayload = {};
    if (parsed.data.salary !== undefined && parsed.data.salary !== before.salary) {
      diff.salary = { label: "Оклад", from: money(before.salary), to: money(parsed.data.salary), kind: "text" };
    }
    if (parsed.data.salesBonus !== undefined && parsed.data.salesBonus !== before.salesBonus) {
      diff.salesBonus = {
        label: "Процент с продаж",
        from: money(before.salesBonus),
        to: money(parsed.data.salesBonus),
        kind: "text",
      };
    }
    await logActivity(req, {
      entity: "finance",
      entityId: id,
      action: "updated",
      summary: `Финансы, ФОТ: ${before.personName} — ${before.periodKey}`,
      diff: Object.keys(diff).length ? diff : undefined,
    });
    return { item: row };
  });
}
