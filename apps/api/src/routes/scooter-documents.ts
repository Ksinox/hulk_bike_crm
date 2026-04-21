import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { scooterDocuments } from "../db/schema.js";
import { makeFileKey, putObject, removeObject } from "../storage/index.js";

const KindEnum = z.enum(["pts", "sts", "osago", "purchase"]);

const MAX_FILE_SIZE = 15 * 1024 * 1024;

export async function scooterDocumentsRoutes(app: FastifyInstance) {
  // GET /api/scooter-documents?scooterId=123
  app.get<{ Querystring: { scooterId?: string } }>("/", async (req, reply) => {
    const scooterId = req.query.scooterId ? Number(req.query.scooterId) : null;
    if (!scooterId || !Number.isFinite(scooterId)) {
      return reply.code(400).send({ error: "scooterId required" });
    }
    const rows = await db
      .select()
      .from(scooterDocuments)
      .where(eq(scooterDocuments.scooterId, scooterId))
      .orderBy(scooterDocuments.kind);
    return { items: rows };
  });

  // POST /api/scooter-documents/upload (multipart)
  //   поля: scooterId, kind, osagoValidUntil? (YYYY-MM-DD для kind=osago), file
  app.post("/upload", async (req, reply) => {
    const parts = req.parts({ limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
    let scooterId: number | null = null;
    let kind: string | null = null;
    let osagoValidUntil: string | undefined;
    let fileBuf: Buffer | null = null;
    let fileName = "file";
    let mimeType = "application/octet-stream";

    for await (const part of parts) {
      if (part.type === "file") {
        fileBuf = await part.toBuffer();
        fileName = part.filename;
        mimeType = part.mimetype;
      } else if (part.type === "field") {
        if (part.fieldname === "scooterId") {
          scooterId = Number(part.value);
        } else if (part.fieldname === "kind") {
          kind = String(part.value);
        } else if (part.fieldname === "osagoValidUntil") {
          const v = String(part.value);
          if (v) osagoValidUntil = v;
        }
      }
    }
    if (!scooterId || !Number.isFinite(scooterId)) {
      return reply.code(400).send({ error: "scooterId required" });
    }
    const parsedKind = KindEnum.safeParse(kind);
    if (!parsedKind.success) {
      return reply.code(400).send({ error: "bad kind" });
    }
    if (!fileBuf) {
      return reply.code(400).send({ error: "file required" });
    }

    const key = makeFileKey(`scooters/${scooterId}/${parsedKind.data}`, fileName);
    await putObject(key, fileBuf, mimeType);

    // Если уже был документ такого типа — сохраняем в БД старый ключ для удаления
    const [existing] = await db
      .select()
      .from(scooterDocuments)
      .where(
        and(
          eq(scooterDocuments.scooterId, scooterId),
          eq(scooterDocuments.kind, parsedKind.data),
        ),
      );

    let row;
    if (existing) {
      [row] = await db
        .update(scooterDocuments)
        .set({
          fileKey: key,
          fileName,
          mimeType,
          size: fileBuf.length,
          osagoValidUntil: osagoValidUntil ?? existing.osagoValidUntil,
        })
        .where(eq(scooterDocuments.id, existing.id))
        .returning();
      // удалить старый файл из хранилища
      await removeObject(existing.fileKey).catch(() => {});
    } else {
      [row] = await db
        .insert(scooterDocuments)
        .values({
          scooterId,
          kind: parsedKind.data,
          fileKey: key,
          fileName,
          mimeType,
          size: fileBuf.length,
          osagoValidUntil: osagoValidUntil ?? null,
        })
        .returning();
    }

    return reply.code(201).send(row);
  });

  // PATCH /api/scooter-documents/:id — обновить osagoValidUntil без замены файла
  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const schema = z
      .object({ osagoValidUntil: z.string().nullable().optional() })
      .strict();
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation", issues: parsed.error.issues });
    }
    const [row] = await db
      .update(scooterDocuments)
      .set({
        osagoValidUntil: parsed.data.osagoValidUntil ?? null,
      })
      .where(eq(scooterDocuments.id, id))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // DELETE /api/scooter-documents/:id
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db
      .select()
      .from(scooterDocuments)
      .where(eq(scooterDocuments.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });
    await removeObject(row.fileKey).catch(() => {});
    await db.delete(scooterDocuments).where(eq(scooterDocuments.id, id));
    return { ok: true };
  });
}
