import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { db } from "../db/index.js";
import { scooterModels } from "../db/schema.js";
import { getObjectStream, statObject } from "../storage/index.js";

/**
 * Публичный API для лендинга hulkbike.ru.
 *
 * НЕ требует cookie/JWT — раздаётся свободно. Возвращаем только то, что
 * безопасно показывать клиентам:
 *   • модели с заполненной аватаркой (без аватарки — на лендинг не идут);
 *   • поля name, тарифы, note;
 *   • стрим самой аватарки (через api, не из MinIO напрямую — MinIO в
 *     приватной сети Dokploy).
 *
 * Регистрируется в index.ts ВНЕ блока с requireAuth.
 */
export async function publicRoutes(app: FastifyInstance) {
  /** Список моделей для витрины: только те, у кого есть аватарка. */
  app.get("/scooter-models", async () => {
    const rows = await db
      .select({
        id: scooterModels.id,
        name: scooterModels.name,
        shortRate: scooterModels.shortRate,
        weekRate: scooterModels.weekRate,
        monthRate: scooterModels.monthRate,
        maxSpeedKmh: scooterModels.maxSpeedKmh,
        tankVolumeL: scooterModels.tankVolumeL,
        coolingType: scooterModels.coolingType,
        note: scooterModels.note,
      })
      .from(scooterModels)
      .where(
        and(
          isNotNull(scooterModels.avatarKey),
          ne(scooterModels.avatarKey, ""),
        ),
      )
      .orderBy(scooterModels.id);

    return {
      items: rows.map((r) => ({
        ...r,
        // Drizzle отдаёт numeric строкой — на лендинге удобнее число.
        tankVolumeL: r.tankVolumeL == null ? null : Number(r.tankVolumeL),
        avatarUrl: `/api/public/scooter-models/${r.id}/avatar`,
      })),
    };
  });

  /**
   * Стрим аватарки модели. Без авторизации — лендинг публичный.
   * Берём свежий avatarKey из БД, не доверяем клиенту.
   */
  app.get<{ Params: { id: string } }>(
    "/scooter-models/:id/avatar",
    async (req, reply) => {
      const id = Number(req.params.id);
      if (!Number.isFinite(id))
        return reply.code(400).send({ error: "bad id" });

      const [row] = await db
        .select({
          avatarKey: scooterModels.avatarKey,
          avatarFileName: scooterModels.avatarFileName,
        })
        .from(scooterModels)
        .where(eq(scooterModels.id, id));
      if (!row || !row.avatarKey)
        return reply.code(404).send({ error: "not found" });

      let meta;
      try {
        meta = await statObject(row.avatarKey);
      } catch {
        return reply.code(404).send({ error: "not found" });
      }

      const stream = await getObjectStream(row.avatarKey);
      reply
        .header("Content-Type", meta.mimeType)
        .header("Content-Length", meta.size)
        .header("Cache-Control", "public, max-age=300")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
      return reply.send(stream);
    },
  );
}
