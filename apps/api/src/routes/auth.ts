import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { config } from "../config.js";
import type { JwtPayload } from "../auth/plugin.js";
import { requireAuth } from "../auth/plugin.js";

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
        mustChangePassword: row.mustChangePassword,
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

  // Suppress unused import warning
  void ne;
}
