import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import { sql } from "drizzle-orm";
import { config, isProd } from "./config.js";
import { closeDb, db } from "./db/index.js";
import { clientsRoutes } from "./routes/clients.js";
import { scootersRoutes } from "./routes/scooters.js";
import { rentalsRoutes } from "./routes/rentals.js";
import { paymentsRoutes } from "./routes/payments.js";
import { incidentsRoutes } from "./routes/incidents.js";
import { tasksRoutes } from "./routes/tasks.js";
import { filesRoutes } from "./routes/files.js";
import { clientDocumentsRoutes } from "./routes/client-documents.js";
import { scooterDocumentsRoutes } from "./routes/scooter-documents.js";
import { authRoutes } from "./routes/auth.js";
import { usersRoutes } from "./routes/users.js";
import { scooterModelsRoutes } from "./routes/scooter-models.js";
import { equipmentRoutes } from "./routes/equipment.js";
import { scooterMaintenanceRoutes } from "./routes/scooter-maintenance.js";
import { activityRoutes } from "./routes/activity.js";
import { rentalDocumentsRoutes } from "./routes/rental-documents.js";
import { priceListRoutes } from "./routes/price-list.js";
import { damageReportsRoutes } from "./routes/damage-reports.js";
import { repairJobsRoutes } from "./routes/repair-jobs.js";
import { documentTemplatesRoutes } from "./routes/document-templates.js";
import { publicRoutes } from "./routes/public.js";
import { publicApplicationsRoutes } from "./routes/public-applications.js";
import { clientApplicationsRoutes } from "./routes/client-applications.js";
import authPlugin, { requireAuth } from "./auth/plugin.js";
import { ensureBucket } from "./storage/index.js";
import rateLimit from "@fastify/rate-limit";

async function bootstrap() {
  const app = Fastify({
    logger: isProd
      ? true
      : {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss" },
          },
        },
  });

  await app.register(authPlugin);
  await app.register(helmet, { contentSecurityPolicy: false });
  // Rate-limit плагин: глобально выключен, лимиты включаются точечно
  // в конкретных роутах (только публичные эндпоинты заявок).
  await app.register(rateLimit, {
    global: false,
    max: 30,
    timeWindow: "1 hour",
  });
  await app.register(multipart, {
    limits: {
      fileSize: 15 * 1024 * 1024, // 15 МБ на файл
      files: 1,
    },
  });
  await app.register(cors, {
    origin: (origin, cb) => {
      // Разрешаем запросы без Origin (curl, health-проверки, server-to-server)
      if (!origin) return cb(null, true);
      // Electron-приложение грузит бандл через file:// — Chromium шлёт
      // Origin: null. Разрешаем, иначе авто-обновлённый .exe не сможет
      // обращаться к API.
      if (origin === "null") return cb(null, true);
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS: origin ${origin} не разрешён`), false);
    },
    credentials: true,
  });

  // ==== health ====
  // Глубокий healthcheck: проверяем что БД отвечает И что ключевые
  // колонки на месте (по одной строке из таблиц с недавно добавленными
  // колонками). Если схема рассинхронизирована — здесь упадёт 500,
  // и Dokploy/Docker не отметит контейнер healthy → НЕ переключит
  // трафик на сломанный билд. Старый рабочий контейнер останется живым.
  app.get("/health", async (_req, reply) => {
    try {
      // Проверяем колонки введённые недавними миграциями.
      // Если хоть одной нет — миграция не накатилась, контейнер unhealthy.
      await db.execute(sql`
        SELECT
          (SELECT count(*) FROM clients WHERE source_custom IS NULL OR source_custom IS NOT NULL) AS c1,
          (SELECT count(*) FROM rentals WHERE archived_at IS NULL OR archived_at IS NOT NULL) AS c2,
          (SELECT count(*) FROM scooter_models WHERE active = true OR active = false) AS c3,
          (SELECT count(*) FROM scooter_models WHERE day_rate >= 0) AS c4,
          (SELECT count(*) FROM client_applications WHERE status::text IS NOT NULL) AS c5,
          (SELECT count(*) FROM scooter_models WHERE avatar_thumb_key IS NULL OR avatar_thumb_key IS NOT NULL) AS c6
        LIMIT 1
      `);
      return { ok: true, env: config.env };
    } catch (e) {
      reply.code(503);
      return {
        ok: false,
        env: config.env,
        error: "schema_check_failed",
        message: (e as Error).message ?? "unknown",
      };
    }
  });

  // ==== AUTH ROUTES (без требования авторизации) ====
  await app.register(authRoutes, { prefix: "/api/auth" });

  // ==== PUBLIC ROUTES (без авторизации) ====
  // Раздаются на лендинг hulkbike.ru. Только то, что безопасно
  // показывать клиентам (модели с аватарками + сами аватарки).
  await app.register(publicRoutes, { prefix: "/api/public" });
  // Публичные заявки клиентов (анкета по постоянной ссылке /apply).
  // Все эндпоинты с rate-limit per-IP, защищены X-Upload-Token.
  await app.register(publicApplicationsRoutes, { prefix: "/api/public" });

  // ==== PROTECTED API ROUTES ====
  // Все нижеследующие роуты требуют авторизацию через cookie hulk_session.
  // Файлы (стрим из MinIO) — тоже защищаем.
  await app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", requireAuth);
    await protectedApp.register(clientsRoutes, { prefix: "/api/clients" });
    await protectedApp.register(scootersRoutes, { prefix: "/api/scooters" });
    await protectedApp.register(rentalsRoutes, { prefix: "/api/rentals" });
    await protectedApp.register(paymentsRoutes, { prefix: "/api/payments" });
    await protectedApp.register(incidentsRoutes, { prefix: "/api/incidents" });
    await protectedApp.register(tasksRoutes, { prefix: "/api/tasks" });
    await protectedApp.register(clientDocumentsRoutes, {
      prefix: "/api/client-documents",
    });
    // Список публичных заявок (для менеджеров) + конвертация заявки в клиента
    await protectedApp.register(clientApplicationsRoutes, {
      prefix: "/api/client-applications",
    });
    await protectedApp.register(scooterDocumentsRoutes, {
      prefix: "/api/scooter-documents",
    });
    await protectedApp.register(filesRoutes, { prefix: "/api/files" });
    // Сотрудники (защита на уровне конкретных роутов — только director/creator)
    await protectedApp.register(usersRoutes, { prefix: "/api/users" });
    // Каталоги
    await protectedApp.register(scooterModelsRoutes, { prefix: "/api/scooter-models" });
    await protectedApp.register(equipmentRoutes, { prefix: "/api/equipment" });
    await protectedApp.register(scooterMaintenanceRoutes, {
      prefix: "/api/scooter-maintenance",
    });
    // Журнал действий
    await protectedApp.register(activityRoutes, { prefix: "/api/activity" });
    // v0.4.1: глобальные настройки приложения
    const { appSettingsRoutes } = await import("./routes/app-settings.js");
    await protectedApp.register(appSettingsRoutes, {
      prefix: "/api/app-settings",
    });
    // Диагностика — только creator
    const { diagRoutes } = await import("./routes/diag.js");
    await protectedApp.register(diagRoutes, { prefix: "/api/_diag" });
    // Генерация документов по аренде (договор, акты)
    await protectedApp.register(rentalDocumentsRoutes, { prefix: "/api" });
    // Прейскурант (справочник цен)
    await protectedApp.register(priceListRoutes, { prefix: "/api/price-list" });
    // Акты о повреждениях
    await protectedApp.register(damageReportsRoutes, {
      prefix: "/api/damage-reports",
    });
    // Ремонты — журнал ремонтов скутеров с чек-листом и фото
    await protectedApp.register(repairJobsRoutes, {
      prefix: "/api/repair-jobs",
    });
    // Пользовательские шаблоны документов (overrides + custom)
    await protectedApp.register(documentTemplatesRoutes, {
      prefix: "/api/document-templates",
    });
  });

  // Проверить/создать бакет при старте (не блокируем — если MinIO
  // не отвечает, первая загрузка файла попробует снова)
  ensureBucket().catch((e) => {
    app.log.warn({ err: e }, "MinIO ensureBucket failed (проверь S3_* переменные)");
  });

  // ==== graceful shutdown ====
  const shutdown = async (signal: string) => {
    app.log.info(`Получен ${signal} — завершаем работу...`);
    try {
      await app.close();
      await closeDb();
      process.exit(0);
    } catch (e) {
      app.log.error({ err: e }, "Ошибка при shutdown");
      process.exit(1);
    }
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`🐎 Халк Байк API слушает на ${config.host}:${config.port}`);

  // Бэкапы БД: раз в сутки JSON.gz в MinIO. Не блокирует старт.
  const { scheduleDailyBackup } = await import("./services/backup.js");
  scheduleDailyBackup();
}

bootstrap().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
