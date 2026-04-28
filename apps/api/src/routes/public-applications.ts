import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  clientApplicationFiles,
  clientApplications,
} from "../db/schema.js";
import { makeFileKey, putObject, removeObject } from "../storage/index.js";
import { logActivity } from "../services/activityLog.js";

/**
 * Публичный API для заявок (анкет) клиентов.
 * Регистрируется ВНЕ блока с requireAuth (см. apps/api/src/index.ts).
 *
 * Поток:
 *  1. POST   /applications              — создаёт draft, возвращает {id, uploadToken}
 *  2. PATCH  /applications/:id          — обновляет поля (header X-Upload-Token)
 *  3. POST   /applications/:id/files    — multipart, kind + file
 *  4. DELETE /applications/:id/files/:kind
 *  5. POST   /applications/:id/submit   — финальная отправка, токен сжигается
 *
 * Защита от спама: rate-limit per-IP, honeypot-поле, mime-whitelist на файлах.
 */

/** Поля, которые клиент может заполнить через публичную форму. */
const ApplicationFieldsBody = z
  .object({
    name: z.string().min(1).max(200).optional().nullable(),
    phone: z.string().min(1).max(30).optional().nullable(),
    extraPhone: z.string().max(30).optional().nullable(),
    isForeigner: z.boolean().optional(),
    passportRaw: z.string().max(2000).optional().nullable(),
    birthDate: z.string().optional().nullable(),
    passportSeries: z.string().max(10).optional().nullable(),
    passportNumber: z.string().max(20).optional().nullable(),
    passportIssuedOn: z.string().optional().nullable(),
    passportIssuer: z.string().max(500).optional().nullable(),
    passportDivisionCode: z.string().max(20).optional().nullable(),
    passportRegistration: z.string().max(500).optional().nullable(),
    liveAddress: z.string().max(500).optional().nullable(),
    sameAddress: z.boolean().optional(),
    /** Honeypot — реальные клиенты это поле не видят и не заполняют. */
    honeypot: z.string().max(100).optional().nullable(),
  })
  .strict();

const FileKindEnum = z.enum([
  "passport_main",
  "passport_reg",
  "license",
  "selfie",
]);

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/heic",
  "image/heif",
  "application/pdf",
]);

const TOKEN_TTL_HOURS = 24;
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

function tokenExpiry(): Date {
  return new Date(Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000);
}

/** Проверка X-Upload-Token. Возвращает заявку или null если невалиден/истёк. */
async function authorizeByToken(applicationId: number, token: string | undefined) {
  if (!token) return null;
  const [row] = await db
    .select()
    .from(clientApplications)
    .where(eq(clientApplications.id, applicationId));
  if (!row) return null;
  if (row.uploadToken !== token) return null;
  if (!row.uploadTokenExpiresAt) return null;
  if (row.uploadTokenExpiresAt.getTime() < Date.now()) return null;
  return row;
}

export async function publicApplicationsRoutes(app: FastifyInstance) {
  /* POST /api/public/applications
   * Создаёт черновик. Honeypot-поле непустое → возвращаем фейк-id (бот не поймёт). */
  app.post<{ Body: unknown }>(
    "/applications",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const parsed = ApplicationFieldsBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }

      // Honeypot-проверка: настоящий клиент это поле не заполняет
      if (parsed.data.honeypot && parsed.data.honeypot.trim().length > 0) {
        return reply
          .code(201)
          .send({ applicationId: 0, uploadToken: "blocked" });
      }

      const token = generateToken();
      const expiresAt = tokenExpiry();
      const userAgent = (req.headers["user-agent"] ?? "").toString().slice(0, 500);
      const ipAddress = (req.ip ?? "").toString().slice(0, 64);

      const [row] = await db
        .insert(clientApplications)
        .values({
          status: "draft",
          ...stripHoneypot(parsed.data),
          uploadToken: token,
          uploadTokenExpiresAt: expiresAt,
          userAgent,
          ipAddress,
        })
        .returning({ id: clientApplications.id });

      if (!row) return reply.code(500).send({ error: "insert failed" });

      return reply.code(201).send({
        applicationId: row.id,
        uploadToken: token,
        expiresAt: expiresAt.toISOString(),
      });
    },
  );

  /* PATCH /api/public/applications/:id
   * Обновляет поля черновика. X-Upload-Token обязателен.
   * Только status='draft' (после submit правки запрещены). */
  app.patch<{ Params: { id: string }; Body: unknown }>(
    "/applications/:id",
    { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: "bad id" });
      }
      const token = req.headers["x-upload-token"];
      const tokenStr = Array.isArray(token) ? token[0] : token;
      const app = await authorizeByToken(id, tokenStr);
      if (!app) return reply.code(401).send({ error: "invalid_token" });
      if (app.status !== "draft") {
        return reply.code(409).send({ error: "already_submitted" });
      }

      const parsed = ApplicationFieldsBody.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: "validation", issues: parsed.error.issues });
      }

      await db
        .update(clientApplications)
        .set({
          ...stripHoneypot(parsed.data),
          updatedAt: new Date(),
        })
        .where(eq(clientApplications.id, id));

      return reply.code(200).send({ ok: true });
    },
  );

  /* POST /api/public/applications/:id/files (multipart)
   * Загрузка одного файла (kind + file). Если файл этого kind уже есть — старый удаляется. */
  app.post<{ Params: { id: string } }>(
    "/applications/:id/files",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: "bad id" });
      }
      const tokenHeader = req.headers["x-upload-token"];
      const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
      const application = await authorizeByToken(id, token);
      if (!application) return reply.code(401).send({ error: "invalid_token" });
      if (application.status !== "draft") {
        return reply.code(409).send({ error: "already_submitted" });
      }

      const parts = req.parts({
        limits: { fileSize: MAX_FILE_SIZE, files: 1 },
      });
      let kind: string | null = null;
      let fileBuf: Buffer | null = null;
      let fileName = "file";
      let mimeType = "application/octet-stream";

      for await (const part of parts) {
        if (part.type === "file") {
          fileBuf = await part.toBuffer();
          fileName = part.filename;
          mimeType = part.mimetype;
        } else if (part.type === "field" && part.fieldname === "kind") {
          kind = String(part.value);
        }
      }

      const parsedKind = FileKindEnum.safeParse(kind);
      if (!parsedKind.success) {
        return reply.code(400).send({ error: "bad_kind" });
      }
      if (!fileBuf) {
        return reply.code(400).send({ error: "file_required" });
      }
      if (!ALLOWED_MIME.has(mimeType.toLowerCase())) {
        return reply.code(415).send({
          error: "unsupported_media_type",
          allowed: Array.from(ALLOWED_MIME),
        });
      }

      // Если файл такого kind уже есть — удаляем старый перед записью нового.
      const [existing] = await db
        .select()
        .from(clientApplicationFiles)
        .where(
          and(
            eq(clientApplicationFiles.applicationId, id),
            eq(clientApplicationFiles.kind, parsedKind.data),
          ),
        );
      if (existing) {
        await removeObject(existing.fileKey).catch(() => {
          /* файл мог уже исчезнуть */
        });
        await db
          .delete(clientApplicationFiles)
          .where(eq(clientApplicationFiles.id, existing.id));
      }

      const fileKey = makeFileKey(
        `applications/${id}/${parsedKind.data}`,
        fileName,
      );
      await putObject(fileKey, fileBuf, mimeType);

      const [row] = await db
        .insert(clientApplicationFiles)
        .values({
          applicationId: id,
          kind: parsedKind.data,
          fileKey,
          fileName,
          mimeType,
          size: fileBuf.length,
        })
        .returning({
          id: clientApplicationFiles.id,
          kind: clientApplicationFiles.kind,
          fileName: clientApplicationFiles.fileName,
          size: clientApplicationFiles.size,
        });

      // Тронем updatedAt у заявки — менеджеру виден последний апдейт.
      await db
        .update(clientApplications)
        .set({ updatedAt: new Date() })
        .where(eq(clientApplications.id, id));

      return reply.code(201).send(row);
    },
  );

  /* DELETE /api/public/applications/:id/files/:kind
   * Удалить ранее загруженный файл (для перезагрузки). */
  app.delete<{ Params: { id: string; kind: string } }>(
    "/applications/:id/files/:kind",
    { config: { rateLimit: { max: 30, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: "bad id" });
      }
      const tokenHeader = req.headers["x-upload-token"];
      const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
      const application = await authorizeByToken(id, token);
      if (!application) return reply.code(401).send({ error: "invalid_token" });
      if (application.status !== "draft") {
        return reply.code(409).send({ error: "already_submitted" });
      }

      const parsedKind = FileKindEnum.safeParse(req.params.kind);
      if (!parsedKind.success) {
        return reply.code(400).send({ error: "bad_kind" });
      }

      const [existing] = await db
        .select()
        .from(clientApplicationFiles)
        .where(
          and(
            eq(clientApplicationFiles.applicationId, id),
            eq(clientApplicationFiles.kind, parsedKind.data),
          ),
        );
      if (!existing) return reply.code(404).send({ error: "not_found" });

      await removeObject(existing.fileKey).catch(() => {
        /* файл мог уже исчезнуть */
      });
      await db
        .delete(clientApplicationFiles)
        .where(eq(clientApplicationFiles.id, existing.id));

      return reply.code(200).send({ ok: true });
    },
  );

  /* POST /api/public/applications/:id/submit
   * Финальная отправка. Серверная валидация обязательных полей.
   * После успеха: status='new', uploadToken обнуляется (правки запрещены). */
  app.post<{ Params: { id: string } }>(
    "/applications/:id/submit",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return reply.code(400).send({ error: "bad id" });
      }
      const tokenHeader = req.headers["x-upload-token"];
      const token = Array.isArray(tokenHeader) ? tokenHeader[0] : tokenHeader;
      const application = await authorizeByToken(id, token);
      if (!application) return reply.code(401).send({ error: "invalid_token" });
      if (application.status !== "draft") {
        return reply.code(409).send({ error: "already_submitted" });
      }

      // Соберём список ошибок валидации
      const issues: string[] = [];
      if (!application.name?.trim()) issues.push("name");
      if (!application.phone?.trim()) issues.push("phone");
      if (!application.birthDate) issues.push("birthDate");

      const sameAddr = application.sameAddress ?? true;
      if (!sameAddr && !application.liveAddress?.trim()) {
        issues.push("liveAddress");
      }

      const files = await db
        .select()
        .from(clientApplicationFiles)
        .where(eq(clientApplicationFiles.applicationId, id));
      const haveKinds = new Set(files.map((f) => f.kind));

      if (application.isForeigner) {
        if (!application.passportRaw?.trim()) issues.push("passportRaw");
        if (!haveKinds.has("passport_main")) issues.push("file:passport_main");
        if (!haveKinds.has("selfie")) issues.push("file:selfie");
      } else {
        if (!application.passportSeries?.trim()) issues.push("passportSeries");
        if (!application.passportNumber?.trim()) issues.push("passportNumber");
        if (!application.passportIssuedOn) issues.push("passportIssuedOn");
        if (!application.passportIssuer?.trim()) issues.push("passportIssuer");
        if (!application.passportRegistration?.trim())
          issues.push("passportRegistration");
        if (!haveKinds.has("passport_main")) issues.push("file:passport_main");
        if (!haveKinds.has("passport_reg")) issues.push("file:passport_reg");
        if (!haveKinds.has("selfie")) issues.push("file:selfie");
      }
      // Фото ВУ обязательно для всех
      if (!haveKinds.has("license")) issues.push("file:license");

      if (issues.length > 0) {
        return reply.code(400).send({ error: "incomplete", missing: issues });
      }

      await db
        .update(clientApplications)
        .set({
          status: "new",
          submittedAt: new Date(),
          uploadToken: null,
          uploadTokenExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(clientApplications.id, id));

      // Лог в активность — для ленты на дашборде менеджеров
      await logActivity(req, {
        entity: "client",
        entityId: id,
        action: "application_submitted",
        summary: `Новая заявка от «${application.name}» · ${application.phone}`,
      });

      return reply.code(200).send({ ok: true });
    },
  );
}

/** Вырезает honeypot из тела перед записью в БД (поле для ботов, не часть данных). */
function stripHoneypot<T extends { honeypot?: string | null }>(data: T) {
  const { honeypot, ...rest } = data;
  void honeypot;
  return rest;
}
