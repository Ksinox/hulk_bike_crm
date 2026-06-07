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
import { parkingRoutes } from "./routes/parking.js";
import { stickersRoutes } from "./routes/stickers.js";
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
import bcrypt from "bcryptjs";
import { users } from "./db/schema.js";
import { seedPriceListIfEmpty } from "./routes/price-list.js";

/**
 * Bootstrap-юзеры. На preview/staging-окружениях БД создаётся чистая,
 * и без хотя бы одного пользователя залогиниться нельзя. Если в env
 * заданы SEED_CREATOR_PASSWORD / SEED_DIRECTOR_PASSWORD /
 * SEED_ADMIN_PASSWORD И таблица users пуста — создаём трёх
 * стандартных юзеров (ruslan/director/admin). Идемпотентно: если
 * пользователи уже есть, ничего не делает. На проде env-переменные
 * не выставлены, поэтому эффекта нет.
 */
async function bootstrapUsersIfEmpty(): Promise<void> {
  // Тройная защита от случайного срабатывания на проде:
  // 1) явный флаг ALLOW_BOOTSTRAP_USERS=1
  // 2) SEED_* env vars выставлены
  // 3) таблица users пуста
  if (process.env.ALLOW_BOOTSTRAP_USERS !== "1") return;
  const creatorPw = process.env.SEED_CREATOR_PASSWORD;
  const directorPw = process.env.SEED_DIRECTOR_PASSWORD;
  const adminPw = process.env.SEED_ADMIN_PASSWORD;
  if (!creatorPw || !directorPw || !adminPw) return;
  const existing = await db.select({ c: sql<number>`count(*)` }).from(users);
  if (Number(existing[0]?.c ?? 0) > 0) return;
  const hash = (pw: string) => bcrypt.hashSync(pw, 10);
  await db.insert(users).values([
    {
      name: "Руслан",
      login: "ruslan",
      passwordHash: hash(creatorPw),
      role: "creator",
      avatarColor: "purple",
    },
    {
      name: "Директор",
      login: "director",
      passwordHash: hash(directorPw),
      role: "director",
      avatarColor: "blue",
    },
    {
      name: "Администратор",
      login: "admin",
      passwordHash: hash(adminPw),
      role: "admin",
      avatarColor: "green",
    },
  ]);
  // eslint-disable-next-line no-console
  console.log("[bootstrap-users] создано 3 стандартных юзера (ruslan/director/admin)");
}

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
  // Off-site бэкап для GitHub Action — без session-cookie, своя token-авторизация
  // (?token=BACKUP_TOKEN). Должен жить ВНЕ protectedApp, иначе 401 без cookie.
  const { backupPublicRoutes } = await import("./routes/backup-public.js");
  await app.register(backupPublicRoutes, { prefix: "/api/_diag" });

  // ==== PROTECTED API ROUTES ====
  // Все нижеследующие роуты требуют авторизацию через cookie hulk_session.
  // Файлы (стрим из MinIO) — тоже защищаем.
  await app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", requireAuth);
    await protectedApp.register(clientsRoutes, { prefix: "/api/clients" });
    await protectedApp.register(scootersRoutes, { prefix: "/api/scooters" });
    await protectedApp.register(rentalsRoutes, { prefix: "/api/rentals" });
    await protectedApp.register(parkingRoutes, { prefix: "/api/rentals" });
    await protectedApp.register(stickersRoutes, { prefix: "/api/stickers" });
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
    // v0.7: расчётный период с историей якорей (anchors) — перенесён из main.
    const { billingPeriodRoutes } = await import("./routes/billing-period.js");
    await protectedApp.register(billingPeriodRoutes, {
      prefix: "/api/billing-period",
    });
    // Диагностика — только creator
    const { diagRoutes } = await import("./routes/diag.js");
    await protectedApp.register(diagRoutes, { prefix: "/api/_diag" });
    // Ревизор рассинхрона sum vs rent-платежи — только creator/director
    const { diagReconcileRoutes } = await import("./routes/diagReconcile.js");
    await protectedApp.register(diagReconcileRoutes, { prefix: "/api/_diag" });
    // Хранилище — обзор места (БД/файлы/диск) + файловый браузер; creator/director
    const { storageAdminRoutes } = await import("./routes/storageAdmin.js");
    await protectedApp.register(storageAdminRoutes, { prefix: "/api/storage" });
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
    // v0.8: модуль «Должники» (порт из main в v0.6)
    const { debtorsRoutes } = await import("./routes/debtors.js");
    await protectedApp.register(debtorsRoutes, { prefix: "/api/debtors" });
  });

  // Проверить/создать бакет при старте (не блокируем — если MinIO
  // не отвечает, первая загрузка файла попробует снова)
  ensureBucket().catch((e) => {
    app.log.warn({ err: e }, "MinIO ensureBucket failed (проверь S3_* переменные)");
  });

  // Bootstrap дефолтных юзеров если БД пустая (для preview/staging).
  bootstrapUsersIfEmpty().catch((e) => {
    app.log.warn({ err: e }, "bootstrapUsersIfEmpty failed");
  });

  // Bootstrap дефолтного прейскуранта если БД пустая. Идемпотентно.
  // Гейтится тем же ALLOW_BOOTSTRAP_USERS, чтобы на проде не сработало.
  if (process.env.ALLOW_BOOTSTRAP_USERS === "1") {
    seedPriceListIfEmpty()
      .then((seeded) => {
        if (seeded) console.log("[bootstrap-pricelist] прейскурант засеян");
      })
      .catch((e) => {
        app.log.warn({ err: e }, "seedPriceListIfEmpty failed");
      });
  }

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

  // v0.5: автоархивация completed-аренд из прошлых расчётных периодов.
  // Cron перевода active→overdue удалён — просрочка computed на фронте.
  const { scheduleRentalArchive } = await import(
    "./services/overdueScheduler.js"
  );
  scheduleRentalArchive();

  // v0.9.4: разовая сверка легаси app_settings.billing_period_start_day с
  // актуальным якорём расчётного периода. Поле устарело (источник правды —
  // billing_period_anchors), но если оно осталось рассинхронизированным
  // (напр. на старом preview лежало '3' при якоре 15) — путало UI и cron.
  // Приводим к якорю идемпотентно; на проде, где уже совпадает, — no-op.
  // Не блокирует старт.
  void (async () => {
    try {
      await db.execute(sql`
        UPDATE app_settings
           SET value = a.rule_start_day::text
          FROM (
            SELECT rule_start_day
              FROM billing_period_anchors
             WHERE effective_from <= (now() AT TIME ZONE 'Europe/Moscow')::date
             ORDER BY effective_from DESC
             LIMIT 1
          ) a
         WHERE app_settings.key = 'billing_period_start_day'
           AND app_settings.value IS DISTINCT FROM a.rule_start_day::text
      `);
    } catch (e) {
      console.warn(
        "[billing-legacy-reconcile] пропущено:",
        (e as Error).message ?? e,
      );
    }
  })();
}

bootstrap().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
