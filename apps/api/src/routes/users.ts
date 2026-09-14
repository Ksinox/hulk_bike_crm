import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { invalidateAuthUser, requireRole } from "../auth/plugin.js";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  PermissionsPatchSchema,
  defaultPermissions,
  effectivePermissions,
  type PermissionKey,
} from "../auth/permissions.js";
import { logActivity, type DiffPayload } from "../services/activityLog.js";

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

const StaffKindEnum = z.enum(["existing", "new"]);
const STAFF_KIND_LABEL = { existing: "уже работает", new: "новый сотрудник" } as const;

/** «Прибыль, закуп и маржа: видит» — строки прав для журнала. */
function permsText(perms: Record<PermissionKey, boolean>): string {
  return PERMISSION_KEYS.map(
    (k) => `${PERMISSIONS[k].label}: ${perms[k] ? "видит" : "не видит"}`,
  ).join(" · ");
}

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
    position: u.position,
    staffKind: u.staffKind,
    permissions: effectivePermissions(u.role, u.permissions),
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
        position: z.string().trim().max(100).optional(),
        staffKind: StaffKindEnum.optional(),
        permissions: PermissionsPatchSchema.optional(),
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
    // Права сохраняем явно — выбор директора не должен меняться, если
    // позже поменяются умолчания.
    const perms = { ...defaultPermissions(), ...(data.permissions ?? {}) };

    const [row] = await db
      .insert(users)
      .values({
        name: data.name,
        login: data.login,
        passwordHash: hash,
        role: data.role,
        avatarColor: data.avatarColor ?? "blue",
        // 14.09: пароль сотрудника задаёт директор — смену при входе не требуем.
        mustChangePassword: false,
        active: true,
        position: data.position || null,
        staffKind: data.staffKind ?? null,
        permissions: perms,
      })
      .returning();
    if (!row) return reply.code(500).send({ error: "insert failed" });

    await logActivity(req, {
      entity: "user",
      entityId: row.id,
      action: "created",
      summary:
        `Заведён аккаунт «${row.name}»` +
        (row.position ? ` · ${row.position}` : "") +
        ` · логин ${row.login}` +
        (row.staffKind ? ` · ${STAFF_KIND_LABEL[row.staffKind as "existing" | "new"]}` : "") +
        ` · ${permsText(effectivePermissions(row.role, row.permissions))}`,
      meta: { login: row.login, position: row.position, staffKind: row.staffKind },
    });

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
          position: z.string().trim().max(100).nullable().optional(),
          staffKind: StaffKindEnum.optional(),
          permissions: PermissionsPatchSchema.optional(),
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

      const { permissions: permsPatch, ...rest } = parsed.data;
      const set: Partial<typeof users.$inferInsert> = { ...rest };
      if (rest.position !== undefined) set.position = rest.position || null;
      const beforePerms = effectivePermissions(target.role, target.permissions);
      if (permsPatch) {
        set.permissions = { ...beforePerms, ...permsPatch };
      }

      const [updated] = await db
        .update(users)
        .set(set)
        .where(eq(users.id, id))
        .returning();
      if (!updated) return reply.code(500).send({ error: "update failed" });
      invalidateAuthUser(id);

      // Журнал: что поменялось — было → стало.
      const diff: DiffPayload = {};
      if (rest.name !== undefined && rest.name !== target.name) {
        diff.name = { label: "Имя", from: target.name, to: rest.name, kind: "text" };
      }
      if (rest.position !== undefined && (rest.position || null) !== target.position) {
        diff.position = { label: "Должность", from: target.position ?? "—", to: rest.position || "—", kind: "text" };
      }
      if (rest.active !== undefined && rest.active !== target.active) {
        diff.active = { label: "Доступ", from: target.active ? "включён" : "отключён", to: rest.active ? "включён" : "отключён", kind: "text" };
      }
      const afterPerms = effectivePermissions(updated.role, updated.permissions);
      for (const k of PERMISSION_KEYS) {
        if (beforePerms[k] !== afterPerms[k]) {
          diff[k] = {
            label: PERMISSIONS[k].label,
            from: beforePerms[k] ? "видит" : "не видит",
            to: afterPerms[k] ? "видит" : "не видит",
            kind: "text",
          };
        }
      }
      if (Object.keys(diff).length) {
        await logActivity(req, {
          entity: "user",
          entityId: id,
          action: "updated",
          summary:
            `Аккаунт «${updated.name}»: ` +
            Object.values(diff)
              .map((d) => `${d.label} — ${String(d.from)} → ${String(d.to)}`)
              .join(" · "),
          diff,
        });
      }
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

      // 14.09: пароль задаёт директор, поэтому смену при входе не требуем.
      // Новый пароль = выход на всех устройствах: старый мог узнать чужой.
      await db
        .update(users)
        .set({
          passwordHash: hash,
          mustChangePassword: false,
          sessionVersion: target.sessionVersion + 1,
        })
        .where(eq(users.id, id));
      invalidateAuthUser(id);
      await logActivity(req, {
        entity: "user",
        entityId: id,
        action: "password_reset",
        summary: `Директор задал новый пароль аккаунту «${target.name}» · вход сброшен на всех устройствах`,
      });

      return {
        ok: true,
        newPassword: plain,
        generated: parsed.data.newPassword === undefined,
      };
    },
  );

  /**
   * POST /api/users/:id/logout-everywhere
   * Выход на всех устройствах без смены пароля (14.09).
   */
  app.post<{ Params: { id: string } }>(
    "/:id/logout-everywhere",
    { preHandler: staffOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [target] = await db.select().from(users).where(eq(users.id, id));
      if (!target) return reply.code(404).send({ error: "not found" });
      if (target.role === "creator" && req.user.role !== "creator") {
        return reply.code(403).send({ error: "cannot touch creator" });
      }
      await db
        .update(users)
        .set({ sessionVersion: target.sessionVersion + 1 })
        .where(eq(users.id, id));
      invalidateAuthUser(id);
      await logActivity(req, {
        entity: "user",
        entityId: id,
        action: "logout_everywhere",
        summary: `Аккаунт «${target.name}» вышел на всех устройствах`,
      });
      return { ok: true };
    },
  );

  void and;
}
