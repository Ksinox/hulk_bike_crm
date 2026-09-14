import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import { eq } from "drizzle-orm";
import { config } from "../config.js";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { effectivePermissions, type PermissionKey, type Perms } from "./permissions.js";

/** Что лежит внутри JWT (полезная нагрузка) */
export type JwtPayload = {
  userId: number;
  role: "creator" | "director" | "admin" | "mechanic" | "accountant";
  login: string;
  /** Версия сессий на момент входа (14.09). Старые токены без неё = 0. */
  sv?: number;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    /** Итоговые права текущего пользователя (14.09). */
    perms?: Perms;
  }
}

/**
 * Кто сейчас за запросом — из базы, с коротким кэшем (14.09).
 *
 * Токен живёт до 30 дней, поэтому одной подписи мало: при каждом запросе
 * сверяем, что аккаунт не отключён, что директор не сбросил его вход на
 * всех устройствах, и берём свежие права. Кэш на 15 секунд, чтобы не
 * ходить в базу на каждый запрос; при правке сотрудника он сбрасывается.
 */
type AuthUser = {
  id: number;
  role: JwtPayload["role"];
  active: boolean;
  sessionVersion: number;
  perms: Perms;
};
const AUTH_TTL_MS = 15_000;
const authCache = new Map<number, { at: number; user: AuthUser | null }>();

export async function loadAuthUser(id: number): Promise<AuthUser | null> {
  const hit = authCache.get(id);
  if (hit && Date.now() - hit.at < AUTH_TTL_MS) return hit.user;
  const [row] = await db
    .select({
      id: users.id,
      role: users.role,
      active: users.active,
      sessionVersion: users.sessionVersion,
      permissions: users.permissions,
    })
    .from(users)
    .where(eq(users.id, id));
  const user: AuthUser | null = row
    ? {
        id: row.id,
        role: row.role,
        active: row.active,
        sessionVersion: row.sessionVersion,
        perms: effectivePermissions(row.role, row.permissions),
      }
    : null;
  authCache.set(id, { at: Date.now(), user });
  return user;
}

export function invalidateAuthUser(id: number): void {
  authCache.delete(id);
}

/**
 * Регистрирует @fastify/jwt + @fastify/cookie.
 * JWT кладётся в http-only cookie `hulk_session`.
 */
async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyCookie);
  await app.register(fastifyJwt, {
    secret: config.auth.jwtSecret,
    cookie: {
      cookieName: "hulk_session",
      signed: false,
    },
  });
}

export default fp(authPlugin, { name: "auth-plugin" });

/**
 * Middleware: требует валидный JWT-токен в cookie. Если нет — 401.
 * Пишет `req.user` при успехе.
 */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const u = await loadAuthUser(req.user.userId);
  if (!u || !u.active) {
    return reply.code(401).send({ error: "user_deactivated" });
  }
  if ((req.user.sv ?? 0) !== u.sessionVersion) {
    return reply.code(401).send({ error: "session_revoked" });
  }
  // Роль и права — из базы, а не из токена: директор мог их поменять.
  req.user.role = u.role;
  req.perms = u.perms;
}

/** Middleware: требует конкретное право (директор и создатель проходят всегда). */
export function requirePermission(key: PermissionKey) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    if (!req.perms?.[key]) {
      return reply.code(403).send({ error: "no_permission", permission: key });
    }
  };
}

/**
 * Middleware: требует чтобы роль пользователя была в списке разрешённых.
 * Creator автоматически проходит любую проверку.
 */
export function requireRole(
  ...allowed: Array<JwtPayload["role"]>
): (req: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (req, reply) => {
    await requireAuth(req, reply);
    if (reply.sent) return;
    const u = req.user;
    if (!u) return reply.code(401).send({ error: "unauthorized" });
    if (u.role === "creator") return; // creator всё может
    if (!allowed.includes(u.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }
  };
}
