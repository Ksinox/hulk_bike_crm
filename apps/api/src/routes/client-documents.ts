import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { clientDocuments } from "../db/schema.js";
import { makeFileKey, putObject, removeObject } from "../storage/index.js";

const KindEnum = z.enum(["photo", "passport", "license", "extra"]);

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 МБ — достаточно для скана паспорта

export async function clientDocumentsRoutes(app: FastifyInstance) {
  // GET /api/client-documents?clientId=123
  app.get<{ Querystring: { clientId?: string } }>("/", async (req, reply) => {
    const clientId = req.query.clientId ? Number(req.query.clientId) : null;
    if (!clientId || !Number.isFinite(clientId)) {
      return reply.code(400).send({ error: "clientId required" });
    }
    const rows = await db
      .select()
      .from(clientDocuments)
      .where(eq(clientDocuments.clientId, clientId))
      .orderBy(clientDocuments.id);
    return { items: rows };
  });

  // POST /api/client-documents/upload (multipart)
  //   поля: clientId, kind, title?, comment?, file
  app.post("/upload", async (req, reply) => {
    const parts = req.parts({ limits: { fileSize: MAX_FILE_SIZE, files: 1 } });
    let clientId: number | null = null;
    let kind: string | null = null;
    let title: string | undefined;
    let comment: string | undefined;
    let fileBuf: Buffer | null = null;
    let fileName = "file";
    let mimeType = "application/octet-stream";

    for await (const part of parts) {
      if (part.type === "file") {
        fileBuf = await part.toBuffer();
        fileName = part.filename;
        mimeType = part.mimetype;
      } else if (part.type === "field") {
        if (part.fieldname === "clientId") {
          clientId = Number(part.value);
        } else if (part.fieldname === "kind") {
          kind = String(part.value);
        } else if (part.fieldname === "title") {
          title = String(part.value);
        } else if (part.fieldname === "comment") {
          comment = String(part.value);
        }
      }
    }
    if (!clientId || !Number.isFinite(clientId)) {
      return reply.code(400).send({ error: "clientId required" });
    }
    const parsedKind = KindEnum.safeParse(kind);
    if (!parsedKind.success) {
      return reply.code(400).send({ error: "bad kind" });
    }
    if (!fileBuf) {
      return reply.code(400).send({ error: "file required" });
    }

    const key = makeFileKey(`clients/${clientId}/${parsedKind.data}`, fileName);
    await putObject(key, fileBuf, mimeType);

    const [row] = await db
      .insert(clientDocuments)
      .values({
        clientId,
        kind: parsedKind.data,
        fileKey: key,
        fileName,
        mimeType,
        size: fileBuf.length,
        title,
        comment,
      })
      .returning();

    return reply.code(201).send(row);
  });

  // DELETE /api/client-documents/:id
  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db
      .select()
      .from(clientDocuments)
      .where(eq(clientDocuments.id, id));
    if (!row) return reply.code(404).send({ error: "not found" });

    await removeObject(row.fileKey).catch(() => {
      /* игнорим если файл уже исчез */
    });
    await db.delete(clientDocuments).where(eq(clientDocuments.id, id));
    return { ok: true };
  });

  // Подавить неиспользуемые импорты
  void and;
}
