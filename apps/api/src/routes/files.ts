import type { FastifyInstance } from "fastify";
import { getObjectStream, statObject } from "../storage/index.js";

/**
 * Стриминг файла из MinIO через api.
 *
 * Почему через api, а не pre-signed URL напрямую в MinIO:
 *   • MinIO внутри приватной compose/Dokploy-сети, наружу не торчит
 *   • дальше поверх можно навесить проверку роли/сессии
 *   • единый домен — проще CORS
 *
 * disposition=attachment → принудительное скачивание (кнопка «Скачать»)
 * disposition=inline     → просмотр в браузере (кнопка «Открыть»)
 */
export async function filesRoutes(app: FastifyInstance) {
  app.get<{
    Params: { "*": string };
    Querystring: { filename?: string; disposition?: "inline" | "attachment" };
  }>("/*", async (req, reply) => {
    const key = req.params["*"];
    if (!key) return reply.code(400).send({ error: "bad key" });

    let meta;
    try {
      meta = await statObject(key);
    } catch {
      return reply.code(404).send({ error: "not found" });
    }

    const stream = await getObjectStream(key);
    const filename = req.query.filename ?? key.split("/").pop() ?? "file";
    const disposition = req.query.disposition ?? "inline";
    const safe = encodeURIComponent(filename);

    reply
      .header("Content-Type", meta.mimeType)
      .header("Content-Length", meta.size)
      .header(
        "Content-Disposition",
        `${disposition}; filename*=UTF-8''${safe}`,
      )
      // v0.4.32: ключ объекта в MinIO content-addressed (новая загрузка =
      // новый ключ), значит файл по конкретному key никогда не меняется.
      // Раньше max-age=300 заставлял браузер каждый раз перепроверять
      // картинки — пользователь видел подгрузку при каждом наведении/
      // открытии карточки. Теперь 7 дней + immutable: один раз скачали —
      // дальше из кэша мгновенно.
      .header("Cache-Control", "private, max-age=604800, immutable")
      // helmet по умолчанию ставит CORP=same-origin, что ломает <img> на
      // соседнем поддомене web. Для файлов разрешаем cross-origin-встраивание
      // (доступ к самому роуту по-прежнему контролирует CORS + авторизация).
      .header("Cross-Origin-Resource-Policy", "cross-origin");

    return reply.send(stream);
  });
}
