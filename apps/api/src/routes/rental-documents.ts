import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  DOCUMENT_LABEL,
  loadBundle,
  renderDocumentHtml,
  renderDocumentHtmlForWord,
  type DocumentType,
} from "../documents/render.js";
import { logActivity } from "../services/activityLog.js";

const TypeEnum = z.enum([
  "contract",
  "act_transfer",
  "act_return",
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

    await logActivity(req, {
      entity: "rental",
      entityId: id,
      action: "document_generated",
      summary: `Сформирован документ «${DOCUMENT_LABEL[type]}» по аренде #${id}${format === "docx" ? " (Word)" : " (предпросмотр)"}`,
      meta: { type, format },
    });

    if (format === "html") {
      const html = renderDocumentHtml(type, bundle);
      reply.header("Content-Type", "text/html; charset=utf-8");
      return reply.send(html);
    }

    /**
     * Word-версия: отдаём HTML с MIME application/msword и расширением .doc.
     * Этот формат (HTML-Word) Word открывает как обычный документ, сохраняет
     * форматирование, можно редактировать и печатать. Выбрали вместо .docx
     * потому что конвертеры HTML→DOCX в Node нестабильны на сложной вёрстке.
     */
    const wordHtml = renderDocumentHtmlForWord(type, bundle);
    const filename = `${docFilename(type, id)}.doc`;
    reply
      .header("Content-Type", "application/msword; charset=utf-8")
      .header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      );
    return reply.send(wordHtml);
  });
}

function docFilename(type: DocumentType, rentalId: number): string {
  const map: Record<DocumentType, string> = {
    contract: `Договор_проката_№${rentalId}`,
    act_transfer: `Акт_приёма-передачи_№${rentalId}`,
    act_return: `Акт_возврата_№${rentalId}`,
    purchase_deposit: `Договор_задатка_№${rentalId}`,
  };
  return map[type];
}
