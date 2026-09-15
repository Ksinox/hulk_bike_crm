import type { FastifyInstance } from "fastify";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { releaseViews, users } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";

/**
 * Показ обновления (15.09, релиз 2.0).
 *
 * С 2.0 каждое обновление ждёт человека, пока он его не посмотрит: экран
 * «Что изменилось», подсказки на месте, метка «новое» в меню. Прогресс —
 * на сервере, чтобы не зависеть от устройства; директор видит, кто посмотрел.
 */

const ActionSchema = z.object({
  version: z.string().min(1).max(20),
  action: z.enum(["postpone", "complete", "card", "hint", "visit"]),
  cardsSeen: z.number().int().min(0).max(50).optional(),
  hint: z.string().min(1).max(80).optional(),
  section: z.string().min(1).max(40).optional(),
});

/** «2.0.0» → «2.0» для людей. */
const human = (v: string) => v.replace(/\.0$/, "");

function pushUnique(list: unknown, value: string | undefined): string[] {
  const arr = Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  if (value && !arr.includes(value)) arr.push(value);
  return arr;
}

export async function releaseRoutes(app: FastifyInstance) {
  /** Мой прогресс по всем релизам + когда заведён аккаунт. */
  app.get("/me", async (req) => {
    const userId = req.user!.userId;
    const [u] = await db
      .select({ createdAt: users.createdAt, staffKind: users.staffKind })
      .from(users)
      .where(eq(users.id, userId));
    const views = await db
      .select()
      .from(releaseViews)
      .where(eq(releaseViews.userId, userId))
      .orderBy(asc(releaseViews.version));
    return {
      accountCreatedAt: u?.createdAt ?? null,
      staffKind: u?.staffKind ?? null,
      views: views.map((v) => ({
        version: v.version,
        status: v.status,
        postponedCount: v.postponedCount,
        cardsSeen: v.cardsSeen,
        hintsDone: v.hintsDone ?? [],
        sectionsVisited: v.sectionsVisited ?? [],
        completedAt: v.completedAt,
      })),
    };
  });

  app.post("/me", async (req, reply) => {
    const parsed = ActionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_request" });
    const { version, action, cardsSeen, hint, section } = parsed.data;
    const userId = req.user!.userId;

    const [cur] = await db
      .select()
      .from(releaseViews)
      .where(and(eq(releaseViews.userId, userId), eq(releaseViews.version, version)));

    const next = {
      status: cur?.status ?? "postponed",
      postponedCount: cur?.postponedCount ?? 0,
      cardsSeen: cur?.cardsSeen ?? 0,
      hintsDone: pushUnique(cur?.hintsDone, undefined),
      sectionsVisited: pushUnique(cur?.sectionsVisited, undefined),
      completedAt: cur?.completedAt ?? null,
    };
    if (action === "postpone" && next.status !== "completed") next.postponedCount += 1;
    if (action === "complete" && next.status !== "completed") {
      next.status = "completed";
      next.completedAt = new Date();
    }
    if (cardsSeen != null) next.cardsSeen = Math.max(next.cardsSeen, cardsSeen);
    if (action === "hint") next.hintsDone = pushUnique(next.hintsDone, hint);
    if (action === "visit") next.sectionsVisited = pushUnique(next.sectionsVisited, section);

    await db
      .insert(releaseViews)
      .values({ userId, version, ...next })
      .onConflictDoUpdate({
        target: [releaseViews.userId, releaseViews.version],
        set: { ...next, updatedAt: sql`now()` },
      });

    // В журнал — только решения человека, не каждый клик по карточке.
    const becameCompleted = action === "complete" && cur?.status !== "completed";
    if (becameCompleted || (action === "postpone" && next.status !== "completed")) {
      await logActivity(req, {
        entity: "user",
        entityId: userId,
        action: becameCompleted ? "release_viewed" : "release_postponed",
        summary: becameCompleted
          ? `Посмотрел обновление ${human(version)} до конца`
          : `Отложил показ обновления ${human(version)} (${next.postponedCount}-й раз)`,
        meta: { version, cardsSeen: next.cardsSeen },
      });
    }
    return { ok: true, status: next.status, postponedCount: next.postponedCount };
  });

  /** Кто посмотрел обновление — директору и создателю. */
  app.get("/views", { preHandler: requireRole("director") }, async (req, reply) => {
    const q = z.object({ version: z.string().min(1).max(20) }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: "bad_request" });
    const rows = await db
      .select({
        userId: users.id,
        name: users.name,
        position: users.position,
        role: users.role,
        staffKind: users.staffKind,
        accountCreatedAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        status: releaseViews.status,
        postponedCount: releaseViews.postponedCount,
        cardsSeen: releaseViews.cardsSeen,
        completedAt: releaseViews.completedAt,
        updatedAt: releaseViews.updatedAt,
      })
      .from(users)
      .leftJoin(
        releaseViews,
        and(eq(releaseViews.userId, users.id), eq(releaseViews.version, q.data.version)),
      )
      .where(eq(users.active, true))
      .orderBy(asc(users.id));
    return { items: rows };
  });
}
