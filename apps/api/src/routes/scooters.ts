import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { rentals, scooters, users } from "../db/schema.js";
import { requireRole } from "../auth/plugin.js";
import { logActivity } from "../services/activityLog.js";
import { scooterStatusLabel } from "../services/activityMessages.js";

const ScooterModelEnum = z.enum(["jog", "gear", "honda", "tank"]);
const ScooterBaseStatusEnum = z.enum([
  "ready",
  "rental_pool",
  "repair",
  "buyout",
  "for_sale",
  "sold",
  "disassembly",
]);

const CreateScooterBody = z
  .object({
    name: z.string().min(1).max(50),
    model: ScooterModelEnum,
    modelId: z.number().int().positive().optional().nullable(),
    vin: z.string().max(20).optional().nullable(),
    engineNo: z.string().max(50).optional().nullable(),
    mileage: z.number().int().min(0).optional(),
    baseStatus: ScooterBaseStatusEnum.optional(),
    purchaseDate: z.string().optional().nullable(),
    purchasePrice: z.number().int().min(0).optional().nullable(),
    lastOilChangeMileage: z.number().int().min(0).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  })
  .strict();

const PatchScooterBody = CreateScooterBody.partial();

const directorOnly = requireRole("director");

async function currentUserName(userId: number | undefined): Promise<string | null> {
  if (!userId) return null;
  const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return u?.name ?? null;
}

export async function scootersRoutes(app: FastifyInstance) {
  /**
   * GET /api/scooters
   * По умолчанию возвращает активные (archived_at IS NULL).
   * ?includeArchived=1 вернёт всё.
   */
  app.get<{ Querystring: { includeArchived?: string } }>("/", async (req) => {
    const includeArchived = req.query.includeArchived === "1";
    const rows = includeArchived
      ? await db.select().from(scooters).orderBy(scooters.name)
      : await db
          .select()
          .from(scooters)
          .where(isNull(scooters.archivedAt))
          .orderBy(scooters.name);
    return { items: rows };
  });

  /** GET /api/scooters/archived — список в архиве */
  app.get("/archived", async () => {
    const rows = await db
      .select()
      .from(scooters)
      .where(isNotNull(scooters.archivedAt))
      .orderBy(scooters.archivedAt);
    return { items: rows };
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db.select().from(scooters).where(eq(scooters.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const parsed = CreateScooterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    try {
      const [row] = await db
        .insert(scooters)
        .values({
          ...parsed.data,
          mileage: parsed.data.mileage ?? 0,
          baseStatus: parsed.data.baseStatus ?? "ready",
        })
        .returning();
      if (!row) return reply.code(500).send({ error: "insert failed" });

      await logActivity(req, {
        entity: "scooter",
        entityId: row.id,
        action: "created",
        summary: `Добавлен скутер «${row.name}»`,
      });
      return reply.code(201).send(row);
    } catch (e) {
      if (String(e).includes("unique")) {
        return reply.code(409).send({ error: "duplicate name" });
      }
      throw e;
    }
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const parsed = PatchScooterBody.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation", issues: parsed.error.issues });
    }
    const [before] = await db.select().from(scooters).where(eq(scooters.id, id));
    if (!before) return reply.code(404).send({ error: "not found" });

    const [row] = await db
      .update(scooters)
      .set({ ...parsed.data, updatedAt: sql`now()` })
      .where(eq(scooters.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });

    // Если сменился статус — отдельным summary с русскими лейблами
    const statusChanged =
      parsed.data.baseStatus && parsed.data.baseStatus !== before.baseStatus;
    await logActivity(req, {
      entity: "scooter",
      entityId: id,
      action: statusChanged ? "status_changed" : "updated",
      summary: statusChanged
        ? `Статус ${row.name}: «${scooterStatusLabel(before.baseStatus)}» → «${scooterStatusLabel(row.baseStatus)}»`
        : `Отредактированы данные скутера ${row.name}`,
      meta: { before, after: row },
    });
    return row;
  });

  /**
   * DELETE /api/scooters/:id → переместить в архив (soft).
   * Разрешено директору/создателю. Если у скутера активная аренда — 409.
   */
  app.delete<{ Params: { id: string } }>("/:id", { preHandler: directorOnly }, async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

    const [sc] = await db.select().from(scooters).where(eq(scooters.id, id));
    if (!sc) return reply.code(404).send({ error: "not found" });
    if (sc.archivedAt) return reply.code(400).send({ error: "already archived" });

    // Проверяем активные аренды
    const activeRentals = await db
      .select({ id: rentals.id })
      .from(rentals)
      .where(
        and(
          eq(rentals.scooterId, id),
          sql`${rentals.status} IN ('active', 'overdue', 'returning')`,
        ),
      );
    if (activeRentals.length > 0) {
      return reply
        .code(409)
        .send({ error: "scooter has active rentals", rentalIds: activeRentals.map((r) => r.id) });
    }

    const by = (await currentUserName(req.user?.userId)) ?? "система";
    const [row] = await db
      .update(scooters)
      .set({ archivedAt: sql`now()`, archivedBy: by })
      .where(eq(scooters.id, id))
      .returning();

    await logActivity(req, {
      entity: "scooter",
      entityId: id,
      action: "archived",
      summary: `Скутер «${sc.name}» отправлен в архив`,
    });

    return row;
  });

  /** POST /api/scooters/:id/restore — вернуть из архива/отменить удаление */
  app.post<{ Params: { id: string } }>(
    "/:id/restore",
    { preHandler: directorOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [sc] = await db.select().from(scooters).where(eq(scooters.id, id));
      if (!sc) return reply.code(404).send({ error: "not found" });
      if (!sc.archivedAt && !sc.deletedAt)
        return reply.code(400).send({ error: "not archived or deleted" });

      const [row] = await db
        .update(scooters)
        .set({ archivedAt: null, archivedBy: null, deletedAt: null, deletedBy: null })
        .where(eq(scooters.id, id))
        .returning();
      await logActivity(req, {
        entity: "scooter",
        entityId: id,
        action: "restored",
        summary: `Скутер «${sc.name}» восстановлен из архива`,
      });
      return row;
    },
  );

  /**
   * POST /api/scooters/:id/purge — пометить к окончательному удалению.
   * Ставит deleted_at=now(). Через 7 дней фоновой задачей физически удалится
   * (задача пока не написана — покажем UI грацпериода и оставим).
   * До истечения 7 дней можно отменить через /restore.
   */
  app.post<{ Params: { id: string } }>(
    "/:id/purge",
    { preHandler: directorOnly },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const [sc] = await db.select().from(scooters).where(eq(scooters.id, id));
      if (!sc) return reply.code(404).send({ error: "not found" });
      if (!sc.archivedAt)
        return reply.code(400).send({ error: "must be archived first" });

      const by = (await currentUserName(req.user?.userId)) ?? "система";
      const [row] = await db
        .update(scooters)
        .set({ deletedAt: sql`now()`, deletedBy: by })
        .where(eq(scooters.id, id))
        .returning();
      await logActivity(req, {
        entity: "scooter",
        entityId: id,
        action: "purge_scheduled",
        summary: `Скутер «${sc.name}» помечен к удалению (можно отменить 7 дней)`,
      });
      return row;
    },
  );
}
