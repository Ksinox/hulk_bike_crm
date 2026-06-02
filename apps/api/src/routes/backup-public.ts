import type { FastifyInstance } from "fastify";

/**
 * Публичный (без session-cookie) endpoint off-site бэкапа.
 *
 * Раньше backup-download жил в diagRoutes под protectedApp → GitHub Action
 * без cookie всегда получал 401 "unauthorized" (глобальный requireAuth
 * срабатывал ещё до preValidation роута). Поэтому off-site бэкап не работал.
 *
 * Авторизация здесь — собственный токен в query (?token=), сравнивается с env
 * BACKUP_TOKEN. Cookie не нужна — GitHub Action не залогинен. Если
 * BACKUP_TOKEN не задан — endpoint не активен (503).
 *
 * Монтируется в index.ts с префиксом /api/_diag, ВНЕ protectedApp.
 */
export async function backupPublicRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { token?: string } }>(
    "/backup-download",
    async (req, reply) => {
      const expected = process.env.BACKUP_TOKEN;
      if (!expected) {
        return reply.code(503).send({ error: "backup_token_not_configured" });
      }
      if (req.query.token !== expected) {
        return reply.code(401).send({ error: "bad_token" });
      }

      const { runBackup, downloadLatestBackup } = await import(
        "../services/backup.js"
      );
      // Свежий дамп: если за сегодня ещё нет — снимаем сейчас, чтобы не
      // отдавать вчерашний.
      try {
        await runBackup();
      } catch {
        // runBackup упал — попробуем отдать последний из MinIO.
      }
      const buf = await downloadLatestBackup();
      if (!buf) {
        return reply.code(500).send({ error: "no_backup_available" });
      }
      const today = new Date().toISOString().slice(0, 10);
      reply
        .header("Content-Type", "application/gzip")
        .header(
          "Content-Disposition",
          `attachment; filename="hulk-backup-${today}.json.gz"`,
        );
      return reply.send(buf);
    },
  );
}
