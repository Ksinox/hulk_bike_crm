import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import fastifyCookie from "@fastify/cookie";
import { config } from "../config.js";

/** Что лежит внутри JWT (полезная нагрузка) */
export type JwtPayload = {
  userId: number;
  role: "creator" | "director" | "admin" | "mechanic" | "accountant";
  login: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
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
