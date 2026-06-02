import type { FastifyInstance } from "fastify";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { rentalDocumentSnapshots } from "../db/schema.js";
import {
  DOCUMENT_LABEL,
  loadBundle,
  renderDocumentHtml,
  renderDocumentHtmlForWord,
  type DocumentType,
} from "../documents/render.js";
import {
  getObjectStream,
  makeFileKey,
  putObject,
  removeObject,
} from "../storage/index.js";
import { logActivity } from "../services/activityLog.js";

const TypeEnum = z.enum([
  "contract",
  "contract_full",
  "contract_full_intl",
  "act_transfer",
  "act_return",
  "act_swap",
  "purchase_deposit",
]);

export async function rentalDocumentsRoutes(app: FastifyInstance) {
  /**
   * GET /api/rentals/:id/document/:type?format=html|docx
   *
   * Возвращает документ, сгенерированный из шаблона с подставленными данными
   * rental/client/scooter/model + реквизитами арендодателя.
   *
   * format=html — text/html, открывается в новой вкладке, есть кнопка печати.
   * format=docx — application/vnd.openxmlformats-officedocument.wordprocessingml.document
   *               скачивается как Word-файл. Владелец может открыть в Word и подкорректировать.
   */
  app.get<{
    Params: { id: string; type: string };
    Querystring: { format?: string };
  }>("/rentals/:id/document/:type", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });

    const parsedType = TypeEnum.safeParse(req.params.type);
    if (!parsedType.success)
      return reply.code(400).send({ error: "bad type" });
    const type = parsedType.data as DocumentType;

    const bundle = await loadBundle(id);
    if (!bundle) return reply.code(404).send({ error: "rental not found" });

    const format = req.query.format === "docx" ? "docx" : "html";

    // v0.6.16: HTML-предпросмотр НЕ логируем — это не действие, лишь просмотр.
    // Логируем только скачивание Word-копии (фактическое действие оператора).
    if (format === "docx") {
      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "document_downloaded",
        summary: `Скачан документ «${DOCUMENT_LABEL[type]}» (Word) по аренде #${id}`,
        meta: { type, format },
      });
    }

    if (format === "html") {
      const html = await renderDocumentHtml(type, bundle);
      // Убираем X-Frame-Options, выставленный helmet'ом, чтобы CRM (другой
      // поддомен crm.hulkbike.ru) могла встроить документ в iframe. Это
      // безопасно: документ — чистый HTML без JS и форм, clickjacking-угрозы нет.
      // Cache-Control: no-store — документ собирается из живых данных
      // (rental/client/scooter/model), и кэш промежуточных прокси/браузера
      // мог показывать устаревшую версию (старый паспорт, старый пробег).
      // Каждое нажатие «Просмотреть» = свежая выборка из БД.
      reply
        .header("Content-Type", "text/html; charset=utf-8")
        .header("Cache-Control", "no-store, no-cache, must-revalidate")
        .header("Pragma", "no-cache")
        .header("Expires", "0")
        .removeHeader("X-Frame-Options")
        .header(
          "Content-Security-Policy",
          "frame-ancestors 'self' https://crm.hulkbike.ru https://crm.104-128-128-96.sslip.io",
        );
      return reply.send(html);
    }

    /**
     * Word-версия: отдаём HTML с MIME application/msword и расширением .doc.
     * Этот формат (HTML-Word) Word открывает как обычный документ, сохраняет
     * форматирование, можно редактировать и печатать. Выбрали вместо .docx
     * потому что конвертеры HTML→DOCX в Node нестабильны на сложной вёрстке.
     */
    const wordHtml = await renderDocumentHtmlForWord(type, bundle);
    const filename = `${docFilename(type, id)}.doc`;
    reply
      .header("Content-Type", "application/msword; charset=utf-8")
      .header("Cache-Control", "no-store, no-cache, must-revalidate")
      .header("Pragma", "no-cache")
      .header("Expires", "0")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    return reply.send(wordHtml);
  });

  /**
   * POST /api/rentals/:id/document/:type/snapshot
   *
   * Замораживает текущий рендер документа: HTML + Word-версию кладёт в
   * S3, в таблице rental_document_snapshots создаёт запись. Дальше через
   * GET снапшоты можно открывать в превью или скачивать — даже если
   * аренда поменялась (новый паспорт клиента, продление и т.п.),
   * сохранённый файл остаётся как был на момент сохранения.
   */
  app.post<{ Params: { id: string; type: string } }>(
    "/rentals/:id/document/:type/snapshot",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const parsedType = TypeEnum.safeParse(req.params.type);
      if (!parsedType.success)
        return reply.code(400).send({ error: "bad type" });
      const type = parsedType.data as DocumentType;

      const bundle = await loadBundle(id);
      if (!bundle) return reply.code(404).send({ error: "rental not found" });

      const html = await renderDocumentHtml(type, bundle);
      const wordHtml = await renderDocumentHtmlForWord(type, bundle);

      const baseFilename = docFilename(type, id);
      const htmlKey = makeFileKey(
        `rentals/${id}/documents`,
        `${baseFilename}.html`,
      );
      const docxKey = makeFileKey(
        `rentals/${id}/documents`,
        `${baseFilename}.doc`,
      );
      const htmlBuf = Buffer.from(html, "utf-8");
      const wordBuf = Buffer.from(wordHtml, "utf-8");
      await putObject(htmlKey, htmlBuf, "text/html; charset=utf-8");
      await putObject(docxKey, wordBuf, "application/msword; charset=utf-8");

      const now = new Date();
      const titleDate = `${String(now.getDate()).padStart(2, "0")}.${String(
        now.getMonth() + 1,
      ).padStart(2, "0")}.${now.getFullYear()}`;
      const title = `${DOCUMENT_LABEL[type]} от ${titleDate}`;

      const userLogin = (req as { user?: { login?: string } }).user?.login;

      const [row] = await db
        .insert(rentalDocumentSnapshots)
        .values({
          rentalId: id,
          docType: type,
          title,
          htmlFileKey: htmlKey,
          docxFileKey: docxKey,
          size: htmlBuf.length,
          savedByUserLogin: userLogin ?? null,
        })
        .returning();
      if (!row) return reply.code(500).send({ error: "insert failed" });

      await logActivity(req, {
        entity: "rental",
        entityId: id,
        action: "document_saved",
        summary: `Сохранён документ «${title}» по аренде #${String(id).padStart(4, "0")}`,
        meta: { snapshotId: row.id, type },
      });

      return row;
    },
  );

  /**
   * GET /api/rentals/:id/document-snapshots
   * Список сохранённых снапшотов аренды (для UI «История документов»).
   */
  app.get<{ Params: { id: string } }>(
    "/rentals/:id/document-snapshots",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });
      const rows = await db
        .select()
        .from(rentalDocumentSnapshots)
        .where(eq(rentalDocumentSnapshots.rentalId, id))
        .orderBy(desc(rentalDocumentSnapshots.savedAt));
      return { items: rows };
    },
  );

  /**
   * GET /api/rental-document-snapshots/:snapshotId/file?format=html|docx
   * Стримит сохранённый файл из S3.
   */
  app.get<{
    Params: { snapshotId: string };
    Querystring: { format?: string };
  }>(
    "/rental-document-snapshots/:snapshotId/file",
    async (req, reply) => {
      const snapshotId = Number(req.params.snapshotId);
      if (!Number.isFinite(snapshotId))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(rentalDocumentSnapshots)
        .where(eq(rentalDocumentSnapshots.id, snapshotId));
      if (!row) return reply.code(404).send({ error: "not found" });

      const format = req.query.format === "docx" ? "docx" : "html";
      const fileKey =
        format === "docx" ? row.docxFileKey : row.htmlFileKey;
      if (!fileKey) return reply.code(404).send({ error: "no such format" });

      const stream = await getObjectStream(fileKey);
      if (format === "html") {
        reply
          .header("Content-Type", "text/html; charset=utf-8")
          .removeHeader("X-Frame-Options")
          .header(
            "Content-Security-Policy",
            "frame-ancestors 'self' https://crm.hulkbike.ru https://crm.104-128-128-96.sslip.io",
          );
      } else {
        const filename = `${docFilename(row.docType as DocumentType, row.rentalId)}.doc`;
        reply
          .header("Content-Type", "application/msword; charset=utf-8")
          .header(
            "Content-Disposition",
            `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
          );
      }
      return reply.send(stream);
    },
  );

  /**
   * DELETE /api/rental-document-snapshots/:snapshotId
   * Удаляет снапшот: сначала из S3, потом запись из БД.
   */
  app.delete<{ Params: { snapshotId: string } }>(
    "/rental-document-snapshots/:snapshotId",
    async (req, reply) => {
      const snapshotId = Number(req.params.snapshotId);
      if (!Number.isFinite(snapshotId))
        return reply.code(400).send({ error: "bad id" });
      const [row] = await db
        .select()
        .from(rentalDocumentSnapshots)
        .where(eq(rentalDocumentSnapshots.id, snapshotId));
      if (!row) return reply.code(404).send({ error: "not found" });

      try {
        await removeObject(row.htmlFileKey);
      } catch {
        /* файл уже удалён или сбой — продолжаем с БД */
      }
      if (row.docxFileKey) {
        try {
          await removeObject(row.docxFileKey);
        } catch {
          /* noop */
        }
      }
      await db
        .delete(rentalDocumentSnapshots)
        .where(eq(rentalDocumentSnapshots.id, snapshotId));

      await logActivity(req, {
        entity: "rental",
        entityId: row.rentalId,
        action: "document_snapshot_deleted",
        summary: `Удалён сохранённый документ «${row.title}» по аренде #${String(row.rentalId).padStart(4, "0")}`,
      });
      return { ok: true };
    },
  );
}

function docFilename(type: DocumentType, rentalId: number): string {
  const map: Record<DocumentType, string> = {
    contract: `Договор_проката_№${rentalId}`,
    contract_full: `Договор_проката_и_акт_№${rentalId}`,
    contract_full_intl: `Договор_проката_и_акт_иностранец_№${rentalId}`,
    act_transfer: `Акт_приёма-передачи_№${rentalId}`,
    act_return: `Акт_возврата_№${rentalId}`,
    act_swap: `Акт_замены_скутера_№${rentalId}`,
    purchase_deposit: `Договор_задатка_№${rentalId}`,
  };
  return map[type];
}
