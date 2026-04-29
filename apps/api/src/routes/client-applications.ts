import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  clientApplicationFiles,
  clientApplications,
  clientDocuments,
  clients,
} from "../db/schema.js";
import {
  copyObject,
  getObjectStream,
  makeFileKey,
  removeObject,
  statObject,
} from "../storage/index.js";
import { logActivity } from "../services/activityLog.js";
import { CreateClientBody } from "./clients.js";

/**
 * Защищённый API для работы со списком публичных заявок.
 * Регистрируется ВНУТРИ requireAuth — только менеджеры/директор видят.
 */

const FileKindEnum = z.enum([
  "passport_main",
  "passport_reg",
  "license",
  "selfie",
]);
type AppFileKind = z.infer<typeof FileKindEnum>;

/** Маппинг kind заявки → kind в client_documents + title.
 *  Селфи становится главным фото клиента (аватаркой). */
const FILE_KIND_MAP: Record<
  AppFileKind,
  { kind: "photo" | "passport" | "license" | "extra"; title: string }
> = {
  passport_main: { kind: "passport", title: "Паспорт (главный разворот)" },
  passport_reg: { kind: "passport", title: "Паспорт (прописка)" },
  license: { kind: "license", title: "Водительское удостоверение" },
  selfie: { kind: "photo", title: "Селфи" },
};

/** Body для convert — поля клиента + флаги «оставить файл этого вида». */
const ConvertBody = CreateClientBody.extend({
  keepFiles: z
    .object({
      passport_main: z.boolean().optional(),
      passport_reg: z.boolean().optional(),
      license: z.boolean().optional(),
      selfie: z.boolean().optional(),
    })
    .optional(),
});

export async function clientApplicationsRoutes(app: FastifyInstance) {
  /* GET /api/client-applications?status=new|viewed|all
   * По умолчанию — new + viewed (что менеджеру нужно видеть). */
  app.get<{ Querystring: { status?: string } }>("/", async (req) => {
    const status = req.query.status ?? "active";
    const allowed: ("new" | "viewed")[] =
      status === "new"
        ? ["new"]
        : status === "viewed"
          ? ["viewed"]
          : ["new", "viewed"];

    const apps = await db
      .select()
      .from(clientApplications)
      .where(inArray(clientApplications.status, allowed))
      .orderBy(desc(clientApplications.submittedAt));

    if (apps.length === 0) return { items: [] };

    const ids = apps.map((a) => a.id);
    const files = await db
      .select()
      .from(clientApplicationFiles)
      .where(inArray(clientApplicationFiles.applicationId, ids));

    const filesByApp = new Map<number, typeof files>();
    for (const f of files) {
      const arr = filesByApp.get(f.applicationId) ?? [];
      arr.push(f);
      filesByApp.set(f.applicationId, arr);
    }

    return {
      items: apps.map((a) => ({
        ...a,
        // НЕ отдаём fileKey/uploadToken наружу
        uploadToken: undefined,
        files: (filesByApp.get(a.id) ?? []).map((f) => ({
          id: f.id,
          kind: f.kind,
          fileName: f.fileName,
          mimeType: f.mimeType,
          size: f.size,
          uploadedAt: f.uploadedAt,
        })),
      })),
    };
  });

  /* GET /api/client-applications/:id — деталь */
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

    const [row] = await db
      .select()
      .from(clientApplications)
      .where(eq(clientApplications.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });

    const files = await db
      .select()
      .from(clientApplicationFiles)
      .where(eq(clientApplicationFiles.applicationId, id));

    return {
      ...row,
      uploadToken: undefined,
      files: files.map((f) => ({
        id: f.id,
        kind: f.kind,
        fileName: f.fileName,
        mimeType: f.mimeType,
        size: f.size,
        uploadedAt: f.uploadedAt,
      })),
    };
  });

  /* GET /api/client-applications/:id/files/:kind — стрим файла из MinIO */
  app.get<{ Params: { id: string; kind: string } }>(
    "/:id/files/:kind",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
      const parsedKind = FileKindEnum.safeParse(req.params.kind);
      if (!parsedKind.success)
        return reply.code(400).send({ error: "bad_kind" });

      const [file] = await db
        .select()
        .from(clientApplicationFiles)
        .where(
          and(
            eq(clientApplicationFiles.applicationId, id),
            eq(clientApplicationFiles.kind, parsedKind.data),
          ),
        );
      if (!file) return reply.code(404).send({ error: "not_found" });

      let meta;
      try {
        meta = await statObject(file.fileKey);
      } catch {
        return reply.code(404).send({ error: "not_found" });
      }

      const stream = await getObjectStream(file.fileKey);
      reply
        .header("Content-Type", meta.mimeType)
        .header("Content-Length", meta.size)
        // fileKey содержит UUID — файл не меняется до удаления заявки.
        // Поэтому кешируем агрессивно (24 ч + immutable), чтобы повторное
        // открытие модалки заявки не дёргало MinIO заново.
        .header("Cache-Control", "private, max-age=86400, immutable")
        // ETag на основе ключа MinIO — браузер сам делает 304 при revalidation.
        .header("ETag", `"${file.fileKey}"`)
        // helmet по умолчанию ставит CORP: same-origin → блокирует <img>
        // на crm.hulkbike.ru (web) при загрузке с api.hulkbike.ru (api).
        // Разрешаем cross-origin — браузер поверит CORS-заголовкам.
        .header("Cross-Origin-Resource-Policy", "cross-origin");
      return reply.send(stream);
    },
  );

  /* POST /api/client-applications/:id/mark-viewed
   * Идемпотентно: если уже viewed/cancelled — ничего не меняет. */
  app.post<{ Params: { id: string } }>("/:id/mark-viewed", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    await db
      .update(clientApplications)
      .set({ status: "viewed", viewedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(clientApplications.id, id),
          eq(clientApplications.status, "new"),
        ),
      );
    return { ok: true };
  });

  /* POST /api/client-applications/:id/convert
   * Создаёт клиента из заявки + переносит файлы из applications/* в clients/*.
   * После успеха заявка удаляется. */
  app.post<{ Params: { id: string }; Body: unknown }>(
    "/:id/convert",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

      const parsed = ConvertBody.safeParse(req.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }
      const { keepFiles, ...clientFields } = parsed.data;
      const keep = keepFiles ?? {
        passport_main: true,
        passport_reg: true,
        license: true,
        selfie: true,
      };

      // Проверяем заявку и собираем файлы ДО транзакции
      const [appRow] = await db
        .select()
        .from(clientApplications)
        .where(eq(clientApplications.id, id));
      if (!appRow) return reply.code(404).send({ error: "not_found" });
      if (appRow.status !== "new" && appRow.status !== "viewed") {
        return reply.code(409).send({ error: "wrong_status", status: appRow.status });
      }

      const appFiles = await db
        .select()
        .from(clientApplicationFiles)
        .where(eq(clientApplicationFiles.applicationId, id));

      // Сначала создаём клиента — нам нужен newClientId для ключей в MinIO
      const [newClient] = await db
        .insert(clients)
        .values({
          ...clientFields,
          source: clientFields.source ?? "other",
          rating: clientFields.rating ?? 80,
        })
        .returning();
      if (!newClient) {
        return reply.code(500).send({ error: "client_insert_failed" });
      }

      // Копируем keep-файлы в новые ключи + создаём client_documents
      const copiedKeys: string[] = []; // для отката если что
      try {
        for (const file of appFiles) {
          const keepThis = keep[file.kind as AppFileKind] !== false;
          if (!keepThis) continue;

          const map = FILE_KIND_MAP[file.kind as AppFileKind];
          const newKey = makeFileKey(
            `clients/${newClient.id}/${map.kind}`,
            file.fileName,
          );
          await copyObject(file.fileKey, newKey);
          copiedKeys.push(newKey);

          await db.insert(clientDocuments).values({
            clientId: newClient.id,
            kind: map.kind,
            fileKey: newKey,
            fileName: file.fileName,
            mimeType: file.mimeType,
            size: file.size,
            title: map.title,
          });
        }
      } catch (e) {
        // Откат: удаляем уже скопированное и созданного клиента
        for (const k of copiedKeys) {
          await removeObject(k).catch(() => {});
        }
        await db.delete(clientDocuments).where(eq(clientDocuments.clientId, newClient.id));
        await db.delete(clients).where(eq(clients.id, newClient.id));
        req.log.error({ err: e, applicationId: id }, "convert copy failed");
        return reply.code(500).send({ error: "file_copy_failed" });
      }

      // Удаляем старые ключи в MinIO (после успешного копирования всех keep)
      for (const file of appFiles) {
        await removeObject(file.fileKey).catch(() => {});
      }

      // Удаляем заявку и её files (cascade сделает client_application_files)
      await db.delete(clientApplications).where(eq(clientApplications.id, id));

      await logActivity(req, {
        entity: "client",
        entityId: newClient.id,
        action: "created_from_application",
        summary: `Создан клиент «${newClient.name}» из заявки #${id}`,
      });

      return reply.code(201).send(newClient);
    },
  );

  /* DELETE /api/client-applications/:id — удалить (фейк/спам). */
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

    const [appRow] = await db
      .select()
      .from(clientApplications)
      .where(eq(clientApplications.id, id));
    if (!appRow) return reply.code(404).send({ error: "not_found" });

    const files = await db
      .select()
      .from(clientApplicationFiles)
      .where(eq(clientApplicationFiles.applicationId, id));

    for (const f of files) {
      await removeObject(f.fileKey).catch(() => {});
    }

    await db.delete(clientApplications).where(eq(clientApplications.id, id));

    await logActivity(req, {
      entity: "client",
      entityId: id,
      action: "application_deleted",
      summary: `Удалена заявка #${id}${appRow.name ? ` (${appRow.name})` : ""}`,
    });

    return { ok: true };
  });
}
