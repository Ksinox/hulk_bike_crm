import type { FastifyInstance, FastifyRequest } from "fastify";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  repairJobs,
  repairProgress,
  repairProgressPhotos,
  scooters,
  rentals,
  clients,
  damageReports,
  damageReportItems,
} from "../db/schema.js";
import { logActivity } from "../services/activityLog.js";
import { makeFileKey, putObject, removeObject } from "../storage/index.js";

const MAX_PHOTO_SIZE = 12 * 1024 * 1024; // 12 MB

function getUserId(req: FastifyRequest): number | null {
  const u = (req as unknown as { user?: { userId?: number } }).user;
  return u?.userId ?? null;
}

/**
 * Помощник: подгружает полный repair_job c progress + photos.
 * Возвращает плотный объект, готовый к отдаче на фронт.
 */
async function loadJobFull(jobId: number) {
  const [job] = await db
    .select()
    .from(repairJobs)
    .where(eq(repairJobs.id, jobId));
  if (!job) return null;
  const progressRows = await db
    .select()
    .from(repairProgress)
    .where(eq(repairProgress.repairJobId, jobId))
    .orderBy(asc(repairProgress.sortOrder), asc(repairProgress.id));
  const photos =
    progressRows.length > 0
      ? await db
          .select()
          .from(repairProgressPhotos)
          .where(
            // несколько progress_id — упрощённо: фетчим всё для job
            // (на ремонте обычно <20 пунктов, не критично для perf)
            // используем второй select по job_id через join — но
            // проще inArray:
            eq(repairProgressPhotos.progressId, progressRows[0]!.id),
          )
      : [];
  // Если несколько progress — подтянем фото для всех остальных
  let allPhotos = photos;
  if (progressRows.length > 1) {
    allPhotos = [];
    for (const p of progressRows) {
      const ph = await db
        .select()
        .from(repairProgressPhotos)
        .where(eq(repairProgressPhotos.progressId, p.id));
      allPhotos.push(...ph);
    }
  }
  const photosByProgress = new Map<number, typeof allPhotos>();
  for (const ph of allPhotos) {
    const arr = photosByProgress.get(ph.progressId) ?? [];
    arr.push(ph);
    photosByProgress.set(ph.progressId, arr);
  }
  // Контекст: имя скутера + клиент последней аренды
  const [scooter] = await db
    .select()
    .from(scooters)
    .where(eq(scooters.id, job.scooterId));
  let rentalCtx: {
    id: number;
    clientId: number | null;
    clientName: string | null;
    startAt: Date | null;
  } | null = null;
  if (job.rentalId) {
    const [r] = await db
      .select()
      .from(rentals)
      .where(eq(rentals.id, job.rentalId));
    if (r) {
      const [cl] = r.clientId
        ? await db
            .select({ name: clients.name })
            .from(clients)
            .where(eq(clients.id, r.clientId))
        : [];
      rentalCtx = {
        id: r.id,
        clientId: r.clientId ?? null,
        clientName: cl?.name ?? null,
        startAt: r.startAt,
      };
    }
  }
  return {
    ...job,
    scooter: scooter
      ? { id: scooter.id, name: scooter.name, model: scooter.model }
      : null,
    rental: rentalCtx,
    progress: progressRows.map((p) => ({
      ...p,
      photos: photosByProgress.get(p.id) ?? [],
    })),
  };
}

/**
 * Создаёт repair_job для скутера на основе damage_report (если задан) ИЛИ
 * пустой джоб для ручной отправки в ремонт. Идемпотентно: если уже есть
 * незакрытый job для этого скутера — возвращает его, не создаёт новый.
 *
 * Экспортируется для использования из damage-reports route (auto-create
 * при sendScooterToRepair=true).
 */
export async function ensureRepairJobForScooter(opts: {
  scooterId: number;
  rentalId?: number | null;
  damageReportId?: number | null;
  createdByUserId?: number | null;
}): Promise<number> {
  const [existing] = await db
    .select()
    .from(repairJobs)
    .where(
      and(
        eq(repairJobs.scooterId, opts.scooterId),
        eq(repairJobs.status, "in_progress"),
      ),
    );
  if (existing) {
    // Если уже есть открытый job — обновляем damageReportId если он
    // привязан к более свежему акту. Так оператор видит чек-лист по
    // последнему ущербу даже если предыдущий ремонт не закрыли.
    if (
      opts.damageReportId &&
      existing.damageReportId !== opts.damageReportId
    ) {
      await db
        .update(repairJobs)
        .set({
          damageReportId: opts.damageReportId,
          rentalId: opts.rentalId ?? existing.rentalId,
          updatedAt: new Date(),
        })
        .where(eq(repairJobs.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await db
    .insert(repairJobs)
    .values({
      scooterId: opts.scooterId,
      rentalId: opts.rentalId ?? null,
      damageReportId: opts.damageReportId ?? null,
      status: "in_progress",
      createdByUserId: opts.createdByUserId ?? null,
    })
    .returning();
  // Если есть damageReport — наполняем чек-лист его позициями.
  if (opts.damageReportId) {
    const items = await db
      .select()
      .from(damageReportItems)
      .where(eq(damageReportItems.reportId, opts.damageReportId))
      .orderBy(asc(damageReportItems.sortOrder), asc(damageReportItems.id));
    if (items.length > 0) {
      await db.insert(repairProgress).values(
        items.map((it, i) => ({
          repairJobId: created!.id,
          damageReportItemId: it.id,
          title: it.name,
          qty: it.quantity,
          priceSnapshot: it.finalPrice,
          done: false,
          notes: it.comment ?? null,
          sortOrder: i,
        })),
      );
    }
  }
  return created!.id;
}

export async function repairJobsRoutes(app: FastifyInstance) {
  /** Список активных и завершённых ремонтов. ?status=active|completed|all */
  app.get<{ Querystring: { status?: string; scooterId?: string } }>(
    "/",
    async (req) => {
      const status = req.query.status ?? "all";
      const scooterId = req.query.scooterId ? Number(req.query.scooterId) : null;
      const conditions = [];
      if (status === "active") conditions.push(eq(repairJobs.status, "in_progress"));
      else if (status === "completed")
        conditions.push(eq(repairJobs.status, "completed"));
      if (scooterId && Number.isFinite(scooterId))
        conditions.push(eq(repairJobs.scooterId, scooterId));
      const where = conditions.length === 0 ? undefined : and(...conditions);
      const rows = where
        ? await db
            .select()
            .from(repairJobs)
            .where(where)
            .orderBy(desc(repairJobs.startedAt))
        : await db
            .select()
            .from(repairJobs)
            .orderBy(desc(repairJobs.startedAt));
      const full = await Promise.all(rows.map((r) => loadJobFull(r.id)));
      return { items: full.filter(Boolean) };
    },
  );

  /** Получить один job (с прогрессом). */
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id))
      return reply.code(400).send({ error: "bad id" });
    const job = await loadJobFull(id);
    if (!job) return reply.code(404).send({ error: "not found" });
    return job;
  });

  /** Создать job вручную (для случая когда оператор отправил скутер в repair
   *  без акта о повреждениях через карточку скутера). */
  app.post("/", async (req, reply) => {
    const schema = z
      .object({
        scooterId: z.number().int().positive(),
        rentalId: z.number().int().positive().nullable().optional(),
        damageReportId: z.number().int().positive().nullable().optional(),
      })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success)
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    const userId = getUserId(req);
    const jobId = await ensureRepairJobForScooter({
      scooterId: parsed.data.scooterId,
      rentalId: parsed.data.rentalId ?? null,
      damageReportId: parsed.data.damageReportId ?? null,
      createdByUserId: userId,
    });
    await logActivity(req, {
      entity: "repair_job",
      entityId: jobId,
      action: "created",
      summary: `Открыт ремонт скутера #${parsed.data.scooterId}`,
    });
    return await loadJobFull(jobId);
  });

  /** Обновить пункт чек-листа: done и/или notes. */
  app.patch<{ Params: { progressId: string } }>(
    "/progress/:progressId",
    async (req, reply) => {
      const id = Number(req.params.progressId);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          done: z.boolean().optional(),
          notes: z.string().max(2000).nullable().optional(),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const [row] = await db
        .select()
        .from(repairProgress)
        .where(eq(repairProgress.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });
      const userId = getUserId(req);
      const next: Partial<typeof repairProgress.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (parsed.data.notes !== undefined)
        next.notes = parsed.data.notes ?? null;
      if (parsed.data.done !== undefined) {
        next.done = parsed.data.done;
        next.completedAt = parsed.data.done ? new Date() : null;
        next.completedByUserId = parsed.data.done ? userId : null;
      }
      await db
        .update(repairProgress)
        .set(next)
        .where(eq(repairProgress.id, id));
      return await loadJobFull(row.repairJobId);
    },
  );

  /** Добавить пользовательский пункт чек-листа (без привязки к damage_item). */
  app.post<{ Params: { jobId: string } }>(
    "/:jobId/progress",
    async (req, reply) => {
      const jobId = Number(req.params.jobId);
      if (!Number.isFinite(jobId))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          title: z.string().min(1).max(200),
          notes: z.string().max(2000).nullable().optional(),
          /** v0.4.0: количество и снимок цены — приходят из прайс-пикера. */
          qty: z.number().int().min(1).max(99).optional(),
          priceSnapshot: z.number().int().min(0).optional(),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      // sort_order = текущее количество пунктов
      const existing = await db
        .select({ id: repairProgress.id })
        .from(repairProgress)
        .where(eq(repairProgress.repairJobId, jobId));
      await db.insert(repairProgress).values({
        repairJobId: jobId,
        title: parsed.data.title,
        qty: parsed.data.qty ?? 1,
        priceSnapshot: parsed.data.priceSnapshot ?? 0,
        done: false,
        notes: parsed.data.notes ?? null,
        sortOrder: existing.length,
      });
      return await loadJobFull(jobId);
    },
  );

  /** Удалить пункт чек-листа (только пользовательские; пункты от акта тоже
   *  можно удалить — это просто отметка прогресса, акт не трогаем). */
  app.delete<{ Params: { progressId: string } }>(
    "/progress/:progressId",
    async (req, reply) => {
      const id = Number(req.params.progressId);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(repairProgress)
        .where(eq(repairProgress.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });
      // Удалим связанные фото из S3
      const photos = await db
        .select()
        .from(repairProgressPhotos)
        .where(eq(repairProgressPhotos.progressId, id));
      for (const p of photos) {
        await removeObject(p.fileKey).catch(() => {});
      }
      await db.delete(repairProgress).where(eq(repairProgress.id, id));
      return await loadJobFull(row.repairJobId);
    },
  );

  /** Загрузить фото к пункту чек-листа. multipart/form-data с полем 'file'. */
  app.post<{ Params: { progressId: string } }>(
    "/progress/:progressId/photos",
    async (req, reply) => {
      const id = Number(req.params.progressId);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(repairProgress)
        .where(eq(repairProgress.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });
      const parts = req.parts({
        limits: { fileSize: MAX_PHOTO_SIZE, files: 1 },
      });
      let fileBuf: Buffer | null = null;
      let fileName = "photo";
      let mimeType = "application/octet-stream";
      for await (const part of parts) {
        if (part.type === "file") {
          fileBuf = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        }
      }
      if (!fileBuf)
        return reply.code(400).send({ error: "file required" });
      if (!mimeType.startsWith("image/")) {
        return reply.code(400).send({
          error: "only_images",
          message: "К пункту ремонта прикрепляются только изображения.",
        });
      }
      const key = makeFileKey(`repairs/${row.repairJobId}/${id}`, fileName);
      await putObject(key, fileBuf, mimeType);
      const userId = getUserId(req);
      const [photo] = await db
        .insert(repairProgressPhotos)
        .values({
          progressId: id,
          fileKey: key,
          fileName,
          mimeType,
          size: fileBuf.length,
          uploadedByUserId: userId,
        })
        .returning();
      return reply.code(201).send(photo);
    },
  );

  /** Удалить фото. */
  app.delete<{ Params: { photoId: string } }>(
    "/photos/:photoId",
    async (req, reply) => {
      const id = Number(req.params.photoId);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(repairProgressPhotos)
        .where(eq(repairProgressPhotos.id, id));
      if (!row) return reply.code(404).send({ error: "not found" });
      await removeObject(row.fileKey).catch(() => {});
      await db
        .delete(repairProgressPhotos)
        .where(eq(repairProgressPhotos.id, id));
      return reply.code(204).send();
    },
  );

  /** Закрыть ремонт: status='completed', completedAt=now, скутер →
   *  rental_pool (или другой выбранный). */
  app.post<{ Params: { id: string } }>(
    "/:id/complete",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const schema = z
        .object({
          /** Куда вернуть скутер. По умолчанию — rental_pool. */
          newScooterStatus: z
            .enum([
              "ready",
              "rental_pool",
              "repair",
              "buyout",
              "for_sale",
              "sold",
              "disassembly",
            ])
            .default("rental_pool"),
          note: z.string().max(2000).optional().nullable(),
        })
        .strict();
      const parsed = schema.safeParse(req.body);
      if (!parsed.success)
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      const [job] = await db
        .select()
        .from(repairJobs)
        .where(eq(repairJobs.id, id));
      if (!job) return reply.code(404).send({ error: "not found" });
      if (job.status === "completed") {
        return reply.code(409).send({
          error: "already_completed",
          message: "Этот ремонт уже закрыт.",
        });
      }
      const userId = getUserId(req);
      await db.transaction(async (tx) => {
        await tx
          .update(repairJobs)
          .set({
            status: "completed",
            completedAt: new Date(),
            completedByUserId: userId,
            note: parsed.data.note ?? job.note,
            updatedAt: new Date(),
          })
          .where(eq(repairJobs.id, id));
        // Скутер — в выбранный статус
        await tx
          .update(scooters)
          .set({ baseStatus: parsed.data.newScooterStatus })
          .where(eq(scooters.id, job.scooterId));
      });
      const [scooter] = await db
        .select({ name: scooters.name })
        .from(scooters)
        .where(eq(scooters.id, job.scooterId));
      await logActivity(req, {
        entity: "repair_job",
        entityId: id,
        action: "completed",
        summary: `Ремонт закрыт: ${scooter?.name ?? "скутер"} → ${parsed.data.newScooterStatus}`,
        meta: { newScooterStatus: parsed.data.newScooterStatus },
      });
      return await loadJobFull(id);
    },
  );

  // void нужен чтобы линтер не ругался на неиспользуемые импорты в путях
  // где идут только определения (например, isNull).
  void isNull;
  void damageReports;
}
