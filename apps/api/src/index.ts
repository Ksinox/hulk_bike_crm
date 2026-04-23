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
import authPlugin, { requireAuth } from "./auth/plugin.js";
import { ensureBucket } from "./storage/index.js";

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
  app.get("/health", async () => ({ ok: true, env: config.env }));

  // Проверка что DB отвечает и схема применена
  app.get("/health/db", async () => {
    const rows = await db.execute(sql`select 1 as ok`);
    return { ok: rows.length === 1 };
  });

  // ==== AUTH ROUTES (без требования авторизации) ====
  await app.register(authRoutes, { prefix: "/api/auth" });

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
}

bootstrap().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
