import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { appSettings, approvalRequests, users } from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { isFullAccessRole } from "../auth/permissions.js";
import { loadAuthUser } from "../auth/plugin.js";
import {
  TOTP_PERIOD_S,
  matchTotp,
  newTotpSecret,
  totpCode,
  totpStep,
} from "../services/totp.js";

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
 *
 * 22.10 — «Меняющийся код» вместо постоянного ключа. Директор включает его
 * в настройках: секрет хранится только на сервере, код (6 цифр) меняется
 * каждые 30 секунд и виден лишь в аккаунте директора. В этом режиме
 * постоянный ключ больше не принимается — сохранённый браузером ключ
 * перестаёт что-либо открывать. Код одноразовый, подбор ограничен.
 * Сам директор (вошёл под своей учётной записью) подтверждает одним
 * нажатием — без ключа и кода (заголовок `x-director-approval: self`,
 * роль проверяется по базе, а не по словам клиента).
 */

const KEY_SETTING = "director_key_hash";
const TOTP_SETTING = "director_totp_secret";
const TOTP_USED_SETTING = "director_totp_used_step";

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return row?.value ?? null;
}
const getKeyHash = () => getSetting(KEY_SETTING);
const getTotpSecret = () => getSetting(TOTP_SETTING);

type ProtectionMode = "off" | "key" | "code";
async function protectionMode(): Promise<ProtectionMode> {
  if (await getTotpSecret()) return "code";
  if (await getKeyHash()) return "key";
  return "off";
}

/** Запрос идёт из аккаунта директора (или создателя) — по базе, не по токену. */
export async function isDirectorSession(req: FastifyRequest): Promise<boolean> {
  const id = (req as unknown as { user?: { userId?: number } }).user?.userId;
  if (!id) return false;
  const u = await loadAuthUser(id);
  return !!u && u.active && isFullAccessRole(u.role);
}

/**
 * Защита от подбора кода: 6 цифр — миллион вариантов, поэтому неверные
 * попытки считаем на весь сервер (не на IP) и после 8 за 10 минут код
 * не принимаем вовсе до конца окна. Каждая неверная попытка — в журнал.
 */
const CODE_FAIL_WINDOW_MS = 10 * 60 * 1000;
const CODE_FAIL_MAX = 8;
let codeFails: number[] = [];
function codeLocked(): boolean {
  const now = Date.now();
  codeFails = codeFails.filter((t) => now - t < CODE_FAIL_WINDOW_MS);
  return codeFails.length >= CODE_FAIL_MAX;
}

type FactorResult =
  | { ok: true }
  | { ok: false; status: number; error: string; message: string };

/**
 * Проверка того, что ввёл оператор: в режиме кода — меняющийся код
 * (одноразовый), в режиме ключа — постоянный ключ.
 */
async function checkFactor(
  req: FastifyRequest,
  input: { key?: string; code?: string },
): Promise<FactorResult> {
  const secret = await getTotpSecret();
  if (secret) {
    if (codeLocked())
      return {
        ok: false,
        status: 429,
        error: "code_locked",
        message:
          "Слишком много неверных кодов. Подождите 10 минут или попросите директора подтвердить из его аккаунта.",
      };
    const code = (input.code ?? input.key ?? "").trim();
    const step = matchTotp(secret, code);
    if (step == null) {
      codeFails.push(Date.now());
      await logActivity(req, {
        entity: "settings",
        entityId: null,
        action: "director_code_wrong",
        summary: "Введён неверный код директора",
      });
      return {
        ok: false,
        status: 403,
        error: "wrong_code",
        message: "Неверный код. Код меняется каждые 30 секунд — уточните текущий.",
      };
    }
    // Одноразовость: код окна принимается один раз. Атомарно — двое
    // одновременно одним кодом не воспользуются.
    const used = await db.execute(sql`
      INSERT INTO app_settings (key, value) VALUES (${TOTP_USED_SETTING}, ${String(step)})
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
      WHERE app_settings.value ~ '^[0-9]+$' AND app_settings.value::bigint < EXCLUDED.value::bigint
      RETURNING key
    `);
    const rows =
      (used as unknown as { rows?: unknown[] }).rows ?? (used as unknown as unknown[]);
    if (!Array.isArray(rows) || rows.length === 0)
      return {
        ok: false,
        status: 403,
        error: "code_used",
        message: "Этот код уже использован. Дождитесь следующего — он появится через несколько секунд.",
      };
    return { ok: true };
  }
  const hash = await getKeyHash();
  if (!hash)
    return { ok: false, status: 409, error: "key_not_set", message: "Ключ ещё не установлен." };
  const ok = !!input.key && (await bcrypt.compare(input.key, hash));
  return ok
    ? { ok: true }
    : { ok: false, status: 403, error: "wrong_key", message: "Неверный ключ." };
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
  if ((await protectionMode()) === "off") return true; // защита не настроена

  const header = String(req.headers["x-director-approval"] ?? "");
  if (header === "self") {
    // Директор сам, из своего аккаунта — одно нажатие «Подтвердить».
    if (await isDirectorSession(req)) return true;
  } else if (header.startsWith("pass:")) {
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

const FactorBody = z
  .object({
    key: z.string().min(1).max(200).optional(),
    code: z.string().min(1).max(20).optional(),
  })
  .strict();

export async function approvalsRoutes(app: FastifyInstance) {
  /** Установлен ли ключ + сколько запросов ждут подтверждения. */
  app.get("/status", async (req) => {
    const mode = await protectionMode();
    const [cnt] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(approvalRequests)
      .where(eq(approvalRequests.status, "pending"));
    return {
      // keySet = «защита включена» (ключом или кодом) — так читают старые места.
      keySet: mode !== "off",
      mode,
      keyHashSet: !!(await getKeyHash()),
      isDirector: await isDirectorSession(req),
      pending: cnt?.n ?? 0,
    };
  });

  /**
   * 22.10: текущий меняющийся код — ТОЛЬКО в аккаунт директора.
   * Отдаём и момент смены, чтобы кольцо обратного отсчёта шло по часам
   * сервера, а не телефона.
   */
  app.get("/code", async (req, reply) => {
    if (!(await isDirectorSession(req)))
      return reply.code(403).send({ error: "only_director" });
    const secret = await getTotpSecret();
    if (!secret) return reply.code(409).send({ error: "code_off" });
    const now = Date.now();
    const step = totpStep(now);
    reply.header("Cache-Control", "no-store");
    return {
      code: totpCode(secret, step),
      period: TOTP_PERIOD_S,
      serverNow: now,
      endsAt: (step + 1) * TOTP_PERIOD_S * 1000,
    };
  });

  /** Включить меняющийся код (только директор). */
  app.post("/code/enable", async (req, reply) => {
    if (!(await isDirectorSession(req)))
      return reply.code(403).send({ error: "only_director" });
    if (await getTotpSecret()) return { ok: true };
    const me = getUser(req);
    await db
      .insert(appSettings)
      .values({ key: TOTP_SETTING, value: newTotpSecret(), updatedByUserId: me.id })
      .onConflictDoNothing();
    await logActivity(req, {
      entity: "settings",
      entityId: null,
      action: "director_code_enabled",
      summary:
        "Включён меняющийся код директора — постоянный ключ больше не принимается",
    });
    return { ok: true };
  });

  /** Выключить (вернуться к постоянному ключу) — только директор. */
  app.post("/code/disable", async (req, reply) => {
    if (!(await isDirectorSession(req)))
      return reply.code(403).send({ error: "only_director" });
    await db.delete(appSettings).where(eq(appSettings.key, TOTP_SETTING));
    await logActivity(req, {
      entity: "settings",
      entityId: null,
      action: "director_code_disabled",
      summary: (await getKeyHash())
        ? "Меняющийся код выключен — снова действует постоянный ключ директора"
        : "Меняющийся код выключен — защищённые действия больше не требуют подтверждения",
    });
    return { ok: true };
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
    // 22.10: ключ меняет только директор из своего аккаунта — знание
    // текущего ключа (его мог сохранить браузер) больше не даёт права.
    if (!(await isDirectorSession(req)))
      return reply.code(403).send({
        error: "only_director",
        message: "Ключ меняет директор из своего аккаунта.",
      });
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
        .object({
          key: z.string().min(1).max(200).optional(),
          code: z.string().min(1).max(20).optional(),
          action: z.string().max(80).optional(),
        })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const f = await checkFactor(req, parsed.data);
      if (!f.ok)
        return reply.code(f.status).send({ error: f.error, message: f.message });
      // Полезная нагрузка pass-токена отличается от сессионной (dk/act),
      // поэтому каст: @fastify/jwt типизирован под JwtPayload сессии.
      const pass = app.jwt.sign(
        { dk: true, act: parsed.data.action ?? null } as unknown as Parameters<
          typeof app.jwt.sign
        >[0],
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
      const parsed = FactorBody.safeParse(req.body ?? {});
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      // 22.10: директор из своего аккаунта — одним нажатием, без ключа.
      if (!(await isDirectorSession(req))) {
        const f = await checkFactor(req, parsed.data);
        if (!f.ok)
          return reply.code(f.status).send({ error: f.error, message: f.message });
      }
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
    const parsed = FactorBody.safeParse(req.body ?? {});
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    if (!(await isDirectorSession(req))) {
      const f = await checkFactor(req, parsed.data);
      if (!f.ok)
        return reply.code(f.status).send({ error: f.error, message: f.message });
    }
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
