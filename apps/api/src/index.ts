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

  // ==== API ROUTES ====
  await app.register(clientsRoutes, { prefix: "/api/clients" });
  await app.register(scootersRoutes, { prefix: "/api/scooters" });
  await app.register(rentalsRoutes, { prefix: "/api/rentals" });
  await app.register(paymentsRoutes, { prefix: "/api/payments" });
  await app.register(incidentsRoutes, { prefix: "/api/incidents" });
  await app.register(tasksRoutes, { prefix: "/api/tasks" });
  await app.register(clientDocumentsRoutes, { prefix: "/api/client-documents" });
  await app.register(scooterDocumentsRoutes, { prefix: "/api/scooter-documents" });
  await app.register(filesRoutes, { prefix: "/api/files" });

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
