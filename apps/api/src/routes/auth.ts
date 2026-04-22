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
  app.post("/login", async (req, reply) => {
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
    reply
      .setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: !["development", "test"].includes(process.env.NODE_ENV ?? ""),
        sameSite: "lax",
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
  });

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
        })
        .from(users)
        .where(eq(users.id, u.userId));
      if (!row) return reply.code(401).send({ error: "user deleted" });
      return row;
    },
  );

  // Suppress unused import warning
  void ne;
}
