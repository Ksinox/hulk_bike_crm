import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";

/**
 * Управление сотрудниками. Видят и могут менять только creator и director.
 * Передаётся через requireRole — внутри он дополнительно пропускает creator.
 */
const staffOnly = requireRole("director");

const RoleEnum = z.enum([
  "director",
  "admin",
  "mechanic",
  "accountant",
]);

const AvatarEnum = z.enum(["blue", "green", "orange", "pink", "purple"]);

const LoginRegex = /^[a-z0-9._-]{2,50}$/;

/** Генерирует случайный читаемый пароль из 10 символов (без 0/O/1/l). */
function generatePassword(len = 10): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let out = "";
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) out += alphabet[arr[i]! % alphabet.length]!;
  return out;
}

/** Удаляем passwordHash из ответа всегда. */
function publicUser(u: typeof users.$inferSelect) {
  return {
    id: u.id,
    name: u.name,
    login: u.login,
    role: u.role,
    active: u.active,
    avatarColor: u.avatarColor,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export async function usersRoutes(app: FastifyInstance) {
  /**
   * GET /api/users
   * Список сотрудников. Creator'ы (кроме самого запрашивающего — если creator)
   * из списка исключаются — они скрыты даже от director'а.
   */
  app.get("/", { preHandler: staffOnly }, async (req) => {
    const rows = await db
      .select()
      .from(users)
      .where(req.user.role === "creator" ? undefined : ne(users.role, "creator"))
      .orderBy(users.id);
    return { items: rows.map(publicUser) };
  });

  /**
   * POST /api/users
   * body: { name, login, role, avatarColor, password? }
   * Если password не задан — генерируем и возвращаем в ответе ОДИН РАЗ.
   * Всегда ставим mustChangePassword=true (пусть сотрудник сразу сменит).
   */
  app.post("/", { preHandler: staffOnly }, async (req, reply) => {
    const Body = z
      .object({
        name: z.string().trim().min(1).max(100),
        login: z.string().trim().toLowerCase().regex(LoginRegex, {
          message: "login: латиница, цифры, точки/подчёркивания/дефисы, 2–50",
        }),
        role: RoleEnum,
        avatarColor: AvatarEnum.optional(),
        password: z.string().min(6).max(200).optional(),
      })
      .strict();
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const data = parsed.data;

    // Проверка уникальности логина
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.login, data.login));
    if (dup) {
      return reply.code(409).send({ error: "login already exists" });
    }

    const plainPassword = data.password ?? generatePassword();
    const hash = await bcrypt.hash(plainPassword, 12);

    const [row] = await db
      .insert(users)
      .values({
        name: data.name,
        login: data.login,
        passwordHash: hash,
        role: data.role,
        avatarColor: data.avatarColor ?? "blue",
        mustChangePassword: true,
        active: true,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    return {
      ...publicUser(row),
      // Показываем плейн-пароль ОДИН РАЗ — UI должен сохранить в модалке.
      initialPassword: plainPassword,
      passwordGenerated: data.password === undefined,
    };
  });

  /**
   * PATCH /api/users/:id
   * body: { name?, role?, active?, avatarColor? }
   * Пароль здесь не меняется — есть отдельный reset-password.
   * Защита: нельзя понизить самого себя (чтобы director не остался без прав).
   */
  app.patch<{ Params: { id: string } }>(
    "/:id",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

      const Body = z
        .object({
          name: z.string().trim().min(1).max(100).optional(),
          role: RoleEnum.optional(),
          active: z.boolean().optional(),
          avatarColor: AvatarEnum.optional(),
        })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }

      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) return reply.code(404).send({ error: "not found" });

      // Нельзя трогать creator'а не будучи creator'ом
      if (target.role === "creator" && req.user.role !== "creator") {
        return reply.code(403).send({ error: "cannot edit creator" });
      }

      // Себя деактивировать нельзя
      if (id === req.user.userId && parsed.data.active === false) {
        return reply.code(400).send({ error: "cannot deactivate self" });
      }

      const [updated] = await db
        .update(users)
        .set(parsed.data)
        .where(eq(users.id, id))
        .returning();
      if (!updated) return reply.code(500).send({ error: "update failed" });
      return publicUser(updated);
    },
  );

  /**
   * POST /api/users/:id/reset-password
   * body: { newPassword? } — если не задан, генерируем случайный
   * Ставит mustChangePassword=true. Возвращает плейн-пароль ОДИН РАЗ.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/reset-password",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

      const Body = z
        .object({
          newPassword: z.string().min(6).max(200).optional(),
        })
        .strict();
      const parsed = Body.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }

      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) return reply.code(404).send({ error: "not found" });
      if (target.role === "creator" && req.user.role !== "creator") {
        return reply.code(403).send({ error: "cannot reset creator password" });
      }

      const plain = parsed.data.newPassword ?? generatePassword();
      const hash = await bcrypt.hash(plain, 12);

      await db
        .update(users)
        .set({ passwordHash: hash, mustChangePassword: true })
        .where(eq(users.id, id));

      return {
        ok: true,
        newPassword: plain,
        generated: parsed.data.newPassword === undefined,
      };
    },
  );

  void and;
}
