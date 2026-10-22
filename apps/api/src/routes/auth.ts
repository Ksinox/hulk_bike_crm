import type { FastifyInstance } from "fastify";
import { effectivePermissions, isFullAccessRole } from "../auth/permissions.js";
import bcrypt from "bcryptjs";
import { eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { config } from "../config.js";
import type { JwtPayload } from "../auth/plugin.js";
import { invalidateAuthUser, requireAuth } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";
import crypto from "node:crypto";

/** 22.10: коды восстановления — 10 штук вида «k7m2p-x9qre», без похожих букв. */
const RECOVERY_COUNT = 10;
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function newRecoveryCode(): string {
  const bytes = crypto.randomBytes(10);
  let s = "";
  for (let i = 0; i < 10; i++) s += RECOVERY_ALPHABET[bytes[i]! % RECOVERY_ALPHABET.length];
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}
/** Сравниваем без дефисов, пробелов и регистра — как человек перепечатает. */
function normalizeRecovery(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const LoginBody = z
  .object({
    login: z.string().min(1).max(50),
    password: z.string().min(1).max(200),
    remember: z.boolean().optional(),
  })
  .strict();

const SESSION_COOKIE = "hulk_session";

export async function authRoutes(app: FastifyInstance) {
  /**
   * GET /api/auth/tiles?unlock=<secret>
   * Публично. Возвращает список юзеров для экрана входа.
   * Creator'ы скрыты — появляются только при совпадении unlock-sequence.
   */
  app.get<{ Querystring: { unlock?: string } }>(
    "/tiles",
    async (req) => {
      const unlock = req.query.unlock ?? "";
      const showCreators =
        unlock === config.auth.creatorUnlockSequence && unlock !== "";
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          login: users.login,
          role: users.role,
          avatarColor: users.avatarColor,
          position: users.position,
        })
        .from(users)
        .where(
          showCreators
            ? eq(users.active, true)
            : sql`${users.active} = true AND ${users.role} <> 'creator'`,
        )
        .orderBy(users.id);
      return { items: rows };
    },
  );

  /**
   * POST /api/auth/login
   * body: { login, password, remember }
   * При успехе ставит http-only cookie hulk_session с JWT.
   */
  // v0.4.38: rate-limit на login против брутфорса. 20 попыток за
  // 15 минут на один IP — bcrypt всё равно медленный, но без лимита
  // бот может непрерывно нагружать CPU. После лимита 429.
  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "15 minutes",
        },
      },
    },
    async (req, reply) => {
    const parsed = LoginBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const { login, password, remember } = parsed.data;
    const [row] = await db.select().from(users).where(eq(users.login, login));
    if (!row || !row.active) {
      return reply.code(401).send({ error: "bad credentials" });
    }
    const ok = await bcrypt.compare(password, row.passwordHash);
    if (!ok) return reply.code(401).send({ error: "bad credentials" });

    await db
      .update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, row.id));

    const payload: JwtPayload = {
      userId: row.id,
      role: row.role,
      login: row.login,
      sv: row.sessionVersion,
    };
    const maxAge = remember ? 30 * 24 * 3600 : 12 * 3600; // 30 дней или 12 часов
    const token = app.jwt.sign(payload, {
      expiresIn: remember ? "30d" : "12h",
    });
    const isProd = !["development", "test"].includes(process.env.NODE_ENV ?? "");
    reply
      .setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: isProd,
        // Для Electron (origin=null, cross-site к api.*) куку с sameSite=lax
        // браузер не пошлёт обратно. В prod выставляем none+secure — работает
        // и для web (crm.hulkbike.ru), и для десктопа.
        sameSite: isProd ? "none" : "lax",
        path: "/",
        maxAge,
      })
      .send({
        id: row.id,
        name: row.name,
        login: row.login,
        role: row.role,
        avatarColor: row.avatarColor,
      });
  },
  );

  /**
   * POST /api/auth/logout — очищает cookie.
   */
  app.post("/logout", async (_req, reply) => {
    reply
      .clearCookie(SESSION_COOKIE, { path: "/" })
      .send({ ok: true });
  });

  /**
   * GET /api/auth/me — текущий юзер по cookie.
   * Возвращает 401 если нет сессии — фронт редиректит на /login.
   */
  app.get(
    "/me",
    { preHandler: requireAuth },
    async (req, reply) => {
      const u = req.user;
      const [row] = await db
        .select({
          id: users.id,
          name: users.name,
          login: users.login,
          role: users.role,
          avatarColor: users.avatarColor,
          mustChangePassword: users.mustChangePassword,
          active: users.active,
          position: users.position,
          permissions: users.permissions,
          sessionVersion: users.sessionVersion,
          staffKind: users.staffKind,
        })
        .from(users)
        .where(eq(users.id, u.userId));
      if (!row) return reply.code(401).send({ error: "user deleted" });
      // v0.4.38: если юзера деактивировали (`active=false`) — отзываем
      // сессию немедленно. Раньше JWT оставался валидным до истечения
      // (12h–30d), и деактивация работала только при следующем логине.
      if (!row.active) {
        reply.clearCookie(SESSION_COOKIE, { path: "/" });
        return reply.code(401).send({ error: "user_deactivated" });
      }
      return {
        id: row.id,
        name: row.name,
        login: row.login,
        role: row.role,
        avatarColor: row.avatarColor,
        // Сотруднику пароль задаёт директор — требовать смену нельзя, иначе
        // старый аккаунт с этим флагом застрял бы на экране смены пароля.
        mustChangePassword: isFullAccessRole(row.role) ? row.mustChangePassword : false,
        position: row.position,
        staffKind: row.staffKind,
        // 14.09: права на щепетильные данные — фронт по ним не рисует блоки.
        permissions: effectivePermissions(row.role, row.permissions),
        // Пароль сотрудника задаёт директор: сам он его не меняет.
        canChangePassword: isFullAccessRole(row.role),
      };
    },
  );

  /**
   * PATCH /api/auth/me
   * body: { name?: string, avatarColor?: string }
   * Позволяет авторизованному юзеру менять своё отображаемое имя и цвет аватара.
   */
  app.patch(
    "/me",
    { preHandler: requireAuth },
    async (req, reply) => {
      const Body = z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          avatarColor: z
            .enum(["blue", "green", "orange", "pink", "purple"])
            .optional(),
        })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      const patch: Record<string, unknown> = {};
      if (parsed.data.name !== undefined) patch.name = parsed.data.name;
      if (parsed.data.avatarColor !== undefined)
        patch.avatarColor = parsed.data.avatarColor;
      if (Object.keys(patch).length === 0) return reply.send({ ok: true });

      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, req.user.userId))
        .returning({
          id: users.id,
          name: users.name,
          login: users.login,
          role: users.role,
          avatarColor: users.avatarColor,
        });
      return updated;
    },
  );

  /**
   * POST /api/auth/change-password
   * body: { currentPassword, newPassword }
   * Меняет свой пароль. Требует подтверждения текущим паролем.
   */
  app.post(
    "/change-password",
    { preHandler: requireAuth },
    async (req, reply) => {
      const Body = z
        .object({
          currentPassword: z.string().min(1).max(200),
          newPassword: z.string().min(6).max(200),
        })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      const { currentPassword, newPassword } = parsed.data;

      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.id, req.user.userId));
      if (!row) return reply.code(401).send({ error: "user deleted" });
      // 14.09: пароль сотрудника задаёт только директор.
      if (!isFullAccessRole(row.role)) {
        return reply.code(403).send({
          error: "password_managed_by_director",
          message: "Пароль меняет директор — обратитесь к нему.",
        });
      }

      const ok = await bcrypt.compare(currentPassword, row.passwordHash);
      if (!ok)
        return reply.code(403).send({ error: "current password is wrong" });

      const hash = await bcrypt.hash(newPassword, 12);
      await db
        .update(users)
        .set({ passwordHash: hash, mustChangePassword: false })
        .where(eq(users.id, row.id));
      return { ok: true };
    },
  );

  /**
   * 22.10 — коды восстановления пароля директора («как на GitHub»).
   *
   * Директор создаёт 10 одноразовых кодов и хранит их вне CRM (печать,
   * файл). Забыл пароль — на экране входа: логин + один код → новый пароль.
   * В базе только bcrypt-хэши. Только для директора и создателя: пароль
   * сотрудника и так задаёт директор.
   */
  app.get("/recovery-codes", { preHandler: requireAuth }, async (req, reply) => {
    const [row] = await db
      .select({ role: users.role, recoveryCodes: users.recoveryCodes })
      .from(users)
      .where(eq(users.id, req.user.userId));
    if (!row || !isFullAccessRole(row.role))
      return reply.code(403).send({ error: "only_director" });
    const rc = row.recoveryCodes;
    return {
      createdAt: rc?.createdAt ?? null,
      total: rc?.codes.length ?? 0,
      left: rc?.codes.filter((c) => !c.usedAt).length ?? 0,
    };
  });

  /** Создать новый набор (старые перестают действовать). Нужен пароль. */
  app.post(
    "/recovery-codes",
    {
      preHandler: requireAuth,
      config: { rateLimit: { max: 10, timeWindow: "15 minutes" } },
    },
    async (req, reply) => {
      const Body = z.object({ password: z.string().min(1).max(200) }).strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      const [row] = await db.select().from(users).where(eq(users.id, req.user.userId));
      if (!row || !isFullAccessRole(row.role))
        return reply.code(403).send({ error: "only_director" });
      if (!(await bcrypt.compare(parsed.data.password, row.passwordHash)))
        return reply.code(403).send({ error: "wrong_password", message: "Неверный пароль." });
      const plain = Array.from({ length: RECOVERY_COUNT }, newRecoveryCode);
      const hashed = await Promise.all(plain.map((c) => bcrypt.hash(normalizeRecovery(c), 10)));
      await db
        .update(users)
        .set({
          recoveryCodes: {
            createdAt: new Date().toISOString(),
            codes: hashed.map((h) => ({ h, usedAt: null })),
          },
        })
        .where(eq(users.id, row.id));
      await logActivity(req, {
        entity: "user",
        entityId: row.id,
        action: "recovery_codes_created",
        summary: `${row.name}: созданы новые коды восстановления пароля (${RECOVERY_COUNT} шт.), прежние больше не действуют`,
      });
      return { codes: plain };
    },
  );

  /**
   * Восстановление пароля по коду — публично (человек не может войти).
   * Ответ на любую ошибку одинаковый: не подсказываем, что не так —
   * логин или код. Жёсткий лимит попыток.
   */
  app.post(
    "/recover",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const Body = z
        .object({
          login: z.string().min(1).max(50),
          code: z.string().min(1).max(40),
          newPassword: z.string().min(8).max(200),
        })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success)
        return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
      const fail = () =>
        reply.code(403).send({
          error: "bad_recovery",
          message: "Логин или код восстановления не подходят.",
        });
      const [row] = await db.select().from(users).where(eq(users.login, parsed.data.login));
      if (!row || !row.active || !isFullAccessRole(row.role) || !row.recoveryCodes) return fail();
      const code = normalizeRecovery(parsed.data.code);
      let hit = -1;
      for (let i = 0; i < row.recoveryCodes.codes.length; i++) {
        const c = row.recoveryCodes.codes[i]!;
        if (!c.usedAt && (await bcrypt.compare(code, c.h))) {
          hit = i;
          break;
        }
      }
      if (hit < 0) return fail();
      const now = new Date().toISOString();
      const codes = row.recoveryCodes.codes.map((c, i) => (i === hit ? { ...c, usedAt: now } : c));
      await db
        .update(users)
        .set({
          passwordHash: await bcrypt.hash(parsed.data.newPassword, 12),
          mustChangePassword: false,
          // Пароль сменён — все прежние входы этого аккаунта недействительны.
          sessionVersion: row.sessionVersion + 1,
          recoveryCodes: { ...row.recoveryCodes, codes },
        })
        .where(eq(users.id, row.id));
      invalidateAuthUser(row.id);
      const left = codes.filter((c) => !c.usedAt).length;
      await logActivity(null, {
        entity: "user",
        entityId: row.id,
        action: "password_recovered",
        summary: `${row.name}: пароль восстановлен кодом восстановления (осталось кодов: ${left}), выход на всех устройствах`,
      });
      return { ok: true, left };
    },
  );

  // Suppress unused import warning
  void ne;
}
