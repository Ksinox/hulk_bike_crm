import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { appSettings, approvalRequests, users } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";

/**
 * Пункт 1 — «Ключ директора».
 *
 * Отдельный пароль, который знает только настоящий директор (роли в CRM
 * пока не разделены — все работают под директорской сессией, поэтому
 * защита действий держится именно на этом ключе, а не на роли).
 *
 * Два пути подтвердить защищённое действие:
 *  1. Оператор знает ключ → вводит его в окне → POST /verify выдаёт
 *     короткоживущий pass (JWT 5 мин) → действие уходит с заголовком
 *     `x-director-approval: pass:<jwt>`.
 *  2. Оператор ключа не знает → POST / создаёт запрос-ожидание, директор
 *     видит его (в т.ч. с телефона: очередь «висящих подтверждений» с
 *     кратким отчётом операции), вводит ключ → approve. Оператор
 *     поллит GET /:id и, получив approved, выполняет действие с
 *     `x-director-approval: req:<id>` (запрос потребляется ровно один раз).
 *
 * Хэш ключа — app_settings['director_key_hash'] (bcrypt).
 */

const KEY_SETTING = "director_key_hash";

async function getKeyHash(): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, KEY_SETTING));
  return row?.value ?? null;
}

function getUser(req: FastifyRequest): { id: number | null; name: string } {
  const u = (req as unknown as { user?: { userId?: number } }).user;
  return { id: u?.userId ?? null, name: "" };
}

async function userName(id: number | null): Promise<string> {
  if (!id) return "система";
  const [u] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, id));
  return u?.name ?? "система";
}

/**
 * Требование подтверждения ключом директора для защищённого действия.
 * Возвращает true — можно выполнять; false — ответ уже отправлен (428 с
 * данными для фронта: показать окно ключа / отправить запрос директору).
 *
 * Если ключ ещё не установлен (director_key_hash отсутствует) — действия
 * НЕ блокируем: механизм включается настройкой ключа в «Настройках».
 */
export async function requireDirectorApproval(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  action: string,
): Promise<boolean> {
  const hash = await getKeyHash();
  if (!hash) return true; // ключ не настроен — защита выключена

  const header = String(req.headers["x-director-approval"] ?? "");
  if (header.startsWith("pass:")) {
    try {
      const payload = app.jwt.verify<{ dk?: boolean; act?: string }>(
        header.slice(5),
      );
      if (payload.dk === true && (!payload.act || payload.act === action))
        return true;
    } catch {
      /* невалидный/просроченный pass — упадём в 428 ниже */
    }
  } else if (header.startsWith("req:")) {
    const id = Number(header.slice(4));
    if (Number.isFinite(id)) {
      // Потребляем approved-запрос атомарно — повторное использование
      // того же подтверждения невозможно.
      const [row] = await db
        .update(approvalRequests)
        .set({ consumedAt: sql`now()` })
        .where(
          and(
            eq(approvalRequests.id, id),
            eq(approvalRequests.status, "approved"),
            eq(approvalRequests.action, action),
            sql`${approvalRequests.consumedAt} IS NULL`,
          ),
        )
        .returning();
      if (row) return true;
    }
  }

  reply.code(428).send({
    error: "director_key_required",
    action,
    message: "Действие требует подтверждения ключом директора.",
  });
  return false;
}

export async function approvalsRoutes(app: FastifyInstance) {
  /** Установлен ли ключ + сколько запросов ждут подтверждения. */
  app.get("/status", async () => {
    const hash = await getKeyHash();
    const [cnt] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(approvalRequests)
      .where(eq(approvalRequests.status, "pending"));
    return { keySet: !!hash, pending: cnt?.n ?? 0 };
  });

  /** Установить / сменить ключ. Смена требует текущий ключ. */
  app.post("/key", async (req, reply) => {
    const Body = z
      .object({
        currentKey: z.string().max(200).optional(),
        newKey: z.string().min(4).max(200),
      })
      .strict();
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const hash = await getKeyHash();
    if (hash) {
      const ok =
        parsed.data.currentKey &&
        (await bcrypt.compare(parsed.data.currentKey, hash));
      if (!ok)
        return reply
          .code(403)
          .send({ error: "wrong_key", message: "Текущий ключ неверен." });
    }
    const me = getUser(req);
    const newHash = await bcrypt.hash(parsed.data.newKey, 12);
    await db
      .insert(appSettings)
      .values({ key: KEY_SETTING, value: newHash, updatedByUserId: me.id })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: newHash, updatedAt: sql`now()`, updatedByUserId: me.id },
      });
    await logActivity(req, {
      entity: "settings",
      entityId: null,
      action: "director_key_set",
      summary: hash
        ? "Ключ директора изменён"
        : "Установлен ключ директора — защищённые действия теперь требуют подтверждения",
    });
    return { ok: true };
  });

  /** Проверить ключ → короткоживущий pass для одного действия. */
  app.post(
    "/verify",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (req, reply) => {
      const Body = z
        .object({ key: z.string().min(1).max(200), action: z.string().max(80).optional() })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const hash = await getKeyHash();
      if (!hash)
        return reply
          .code(409)
          .send({ error: "key_not_set", message: "Ключ ещё не установлен." });
      const ok = await bcrypt.compare(parsed.data.key, hash);
      if (!ok)
        return reply
          .code(403)
          .send({ error: "wrong_key", message: "Неверный ключ." });
      const pass = app.jwt.sign(
        { dk: true, act: parsed.data.action ?? null },
        { expiresIn: "5m" },
      );
      return { ok: true, pass };
    },
  );

  /** Создать запрос на подтверждение (оператор без ключа). */
  app.post("/", async (req, reply) => {
    const Body = z
      .object({
        action: z.string().min(1).max(80),
        summary: z.string().min(1).max(500),
        details: z.array(z.string().max(300)).max(20).optional(),
        payload: z.unknown().optional(),
      })
      .strict();
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const me = getUser(req);
    const name = await userName(me.id);
    const [row] = await db
      .insert(approvalRequests)
      .values({
        action: parsed.data.action,
        summary: parsed.data.summary,
        detailsJson: (parsed.data.details ?? null) as object | null,
        payloadJson: (parsed.data.payload ?? null) as object | null,
        requestedByUserId: me.id,
        requestedByName: name,
      })
      .returning();
    await logActivity(req, {
      entity: "approval",
      entityId: row!.id,
      action: "approval_created",
      summary: `Запрос директору: ${parsed.data.summary}`,
    });
    return row;
  });

  /** Очередь (для экрана директора) + история. */
  app.get<{ Querystring: { status?: string } }>("/", async (req) => {
    const status = req.query.status ?? "pending";
    const rows = await db
      .select()
      .from(approvalRequests)
      .where(
        status === "all" ? sql`true` : eq(approvalRequests.status, status),
      )
      .orderBy(desc(approvalRequests.createdAt))
      .limit(100);
    return { items: rows };
  });

  /** Один запрос — поллинг ожидания оператором. */
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  /** Подтвердить (ввод ключа директором — где угодно, в т.ч. с телефона). */
  app.post<{ Params: { id: string } }>(
    "/:id/approve",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const Body = z.object({ key: z.string().min(1).max(200) }).strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const hash = await getKeyHash();
      if (!hash) return reply.code(409).send({ error: "key_not_set" });
      const ok = await bcrypt.compare(parsed.data.key, hash);
      if (!ok)
        return reply
          .code(403)
          .send({ error: "wrong_key", message: "Неверный ключ." });
      const me = getUser(req);
      const name = await userName(me.id);
      const [row] = await db
        .update(approvalRequests)
        .set({
          status: "approved",
          resolvedAt: sql`now()`,
          resolvedByUserId: me.id,
          resolvedByName: name,
        })
        .where(
          and(
            eq(approvalRequests.id, id),
            eq(approvalRequests.status, "pending"),
          ),
        )
        .returning();
      if (!row)
        return reply
          .code(409)
          .send({ error: "not_pending", message: "Запрос уже обработан." });
      await logActivity(req, {
        entity: "approval",
        entityId: id,
        action: "approval_approved",
        summary: `Подтверждено директором: ${row.summary}`,
      });
      return row;
    },
  );

  /** Отклонить (тоже под ключом — чтобы решал только директор). */
  app.post<{ Params: { id: string } }>("/:id/reject", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const Body = z.object({ key: z.string().min(1).max(200) }).strict();
    const parsed = Body.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const hash = await getKeyHash();
    if (!hash) return reply.code(409).send({ error: "key_not_set" });
    const ok = await bcrypt.compare(parsed.data.key, hash);
    if (!ok)
      return reply
        .code(403)
        .send({ error: "wrong_key", message: "Неверный ключ." });
    const me = getUser(req);
    const name = await userName(me.id);
    const [row] = await db
      .update(approvalRequests)
      .set({
        status: "rejected",
        resolvedAt: sql`now()`,
        resolvedByUserId: me.id,
        resolvedByName: name,
      })
      .where(
        and(eq(approvalRequests.id, id), eq(approvalRequests.status, "pending")),
      )
      .returning();
    if (!row) return reply.code(409).send({ error: "not_pending" });
    await logActivity(req, {
      entity: "approval",
      entityId: id,
      action: "approval_rejected",
      summary: `Отклонено директором: ${row.summary}`,
    });
    return row;
  });

  /** Оператор передумал — отменить свой pending-запрос (без ключа). */
  app.post<{ Params: { id: string } }>("/:id/cancel", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const me = getUser(req);
    const [row] = await db
      .update(approvalRequests)
      .set({ status: "cancelled", resolvedAt: sql`now()` })
      .where(
        and(
          eq(approvalRequests.id, id),
          eq(approvalRequests.status, "pending"),
          me.id != null
            ? eq(approvalRequests.requestedByUserId, me.id)
            : sql`true`,
        ),
      )
      .returning();
    if (!row) return reply.code(409).send({ error: "not_pending" });
    return row;
  });
}
