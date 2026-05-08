import type { FastifyInstance } from "fastify";
import { getObjectStream, statObject } from "../storage/index.js";
import { variantKey } from "../storage/image.js";

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
 *
 * v0.4.61: поддержка вариантов изображений.
 *   ?variant=thumb  — миниатюра ≤400×400 (для гридов)
 *   ?variant=view   — превью ≤2000×2000 (для попапа)
 *   (без параметра) — оригинал, как и раньше
 *
 * Если запрошенный вариант отсутствует в MinIO (legacy-файл загружен
 * до v0.4.61, sharp ещё не прогенерировал варианты) — fallback на
 * оригинал. Так старые карточки клиентов продолжают показывать паспорта,
 * пока не выполнится backfill-скрипт.
 */
export async function filesRoutes(app: FastifyInstance) {
  app.get<{
    Params: { "*": string };
    Querystring: {
      filename?: string;
      disposition?: "inline" | "attachment";
      variant?: "thumb" | "view";
    };
  }>("/*", async (req, reply) => {
    const origKey = req.params["*"];
    if (!origKey) return reply.code(400).send({ error: "bad key" });

    // Если запросили variant — пробуем сначала derived-ключ, при отсутствии
    // молча падаем на оригинал. Это даёт обратную совместимость со старыми
    // загрузками без вариантов.
    let key = origKey;
    let meta;
    if (req.query.variant === "thumb" || req.query.variant === "view") {
      const derived = variantKey(origKey, req.query.variant);
      try {
        meta = await statObject(derived);
        key = derived;
      } catch {
        // Вариант не сгенерирован — берём оригинал.
        try {
          meta = await statObject(origKey);
        } catch {
          return reply.code(404).send({ error: "not found" });
        }
      }
    } else {
      try {
        meta = await statObject(origKey);
      } catch {
        return reply.code(404).send({ error: "not found" });
      }
    }

    const stream = await getObjectStream(key);
    const filename =
      req.query.filename ?? origKey.split("/").pop() ?? "file";
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
