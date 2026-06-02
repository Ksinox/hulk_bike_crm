import type { FastifyInstance } from "fastify";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "../db/index.js";
import { scooterModels, equipmentItems, users } from "../db/schema.js";
import { getObjectStream, statObject } from "../storage/index.js";
import { variantKey } from "../storage/image.js";

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
  /**
   * Bootstrap-эндпоинт для пустых БД (preview/staging).
   * POST /api/public/bootstrap-users
   *
   * Гейтинг (ВСЕ три условия должны выполниться):
   *  1. env `ALLOW_BOOTSTRAP_USERS=1` — явный opt-in. Без него эндпоинт
   *     возвращает 404 «как будто его нет». На проде этот флаг не
   *     выставляется → эндпоинт невидим.
   *  2. в env заданы SEED_CREATOR_PASSWORD / SEED_DIRECTOR_PASSWORD /
   *     SEED_ADMIN_PASSWORD.
   *  3. таблица users пуста.
   *
   * Тройная защита: даже если кто-то случайно выставит SEED_* на проде,
   * без ALLOW_BOOTSTRAP_USERS эндпоинт не отзовётся.
   */
  app.post("/bootstrap-users", async (_req, reply) => {
    if (process.env.ALLOW_BOOTSTRAP_USERS !== "1") {
      return reply.code(404).send({ error: "not_found" });
    }
    const creatorPw = process.env.SEED_CREATOR_PASSWORD;
    const directorPw = process.env.SEED_DIRECTOR_PASSWORD;
    const adminPw = process.env.SEED_ADMIN_PASSWORD;
    if (!creatorPw || !directorPw || !adminPw) {
      return reply.code(503).send({ error: "seed_env_not_set" });
    }
    const existing = await db.select({ c: sql<number>`count(*)` }).from(users);
    const count = Number(existing[0]?.c ?? 0);
    if (count > 0) {
      return reply.code(409).send({ error: "users_already_exist", count });
    }
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
    return { created: 3, logins: ["ruslan", "director", "admin"] };
  });

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
        fuelLPer100Km: scooterModels.fuelLPer100Km,
        coolingType: scooterModels.coolingType,
        note: scooterModels.note,
      })
      .from(scooterModels)
      .where(
        and(
          isNotNull(scooterModels.avatarKey),
          ne(scooterModels.avatarKey, ""),
          // Неактивные модели на лендинге не показываем
          eq(scooterModels.active, true),
        ),
      )
      .orderBy(scooterModels.id);

    return {
      items: rows.map((r) => ({
        ...r,
        // Drizzle отдаёт numeric строкой — на лендинге удобнее число.
        tankVolumeL: r.tankVolumeL == null ? null : Number(r.tankVolumeL),
        fuelLPer100Km: r.fuelLPer100Km == null ? null : Number(r.fuelLPer100Km),
        avatarUrl: `/api/public/scooter-models/${r.id}/avatar`,
      })),
    };
  });

  /* GET /api/public/rental-models
   * G3: модели для шага «Что хотите арендовать» в публичной анкете.
   * Возвращает ВСЕ АКТИВНЫЕ модели (в отличие от /scooter-models, аватар
   * необязателен — карточка покажет фолбэк). Отключение модели (active=false)
   * в каталоге «Скутеры → Модели» автоматически убирает её из анкеты. */
  app.get("/rental-models", async () => {
    const rows = await db
      .select({
        id: scooterModels.id,
        name: scooterModels.name,
        dayRate: scooterModels.dayRate,
        shortRate: scooterModels.shortRate,
        weekRate: scooterModels.weekRate,
        monthRate: scooterModels.monthRate,
        avatarKey: scooterModels.avatarKey,
      })
      .from(scooterModels)
      .where(eq(scooterModels.active, true))
      .orderBy(scooterModels.id);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        dayRate: r.dayRate,
        shortRate: r.shortRate,
        weekRate: r.weekRate,
        monthRate: r.monthRate,
        avatarUrl:
          r.avatarKey && r.avatarKey !== ""
            ? `/api/public/scooter-models/${r.id}/avatar`
            : null,
      })),
    };
  });

  /**
   * Стрим аватарки модели. Без авторизации — лендинг публичный.
   * Берём свежий avatarKey из БД, не доверяем клиенту.
   *
   * v0.4.62: ?variant=thumb|view — серверная sharp-генерация
   * (см. storage/image.ts). Лендинг просит view (≤2000px, ~300 КБ)
   * вместо тяжёлого оригинала аватарки. При отсутствии varianta —
   * silently fallback на оригинал, чтобы не побить старые модели до
   * backfill'а.
   */
  app.get<{
    Params: { id: string };
    Querystring: { variant?: "thumb" | "view" };
  }>(
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

      let key = row.avatarKey;
      let meta;
      if (req.query.variant === "thumb" || req.query.variant === "view") {
        const derived = variantKey(row.avatarKey, req.query.variant);
        try {
          meta = await statObject(derived);
          key = derived;
        } catch {
          try {
            meta = await statObject(row.avatarKey);
          } catch {
            return reply.code(404).send({ error: "not found" });
          }
        }
      } else {
        try {
          meta = await statObject(row.avatarKey);
        } catch {
          return reply.code(404).send({ error: "not found" });
        }
      }

      const stream = await getObjectStream(key);
      reply
        .header("Content-Type", meta.mimeType)
        .header("Content-Length", meta.size)
        // v0.4.62: на лендинге аватарки моделей меняются редко;
        // вариант-ключ content-addressed (одна и та же derived-картинка
        // для одного и того же avatarKey). Бампаем кеш до 7 дней —
        // браузер обычного посетителя не дёргает аватарки заново при
        // каждом скролле. После замены avatarKey в админке поменяется
        // и derived-ключ → кеш мгновенно инвалидируется.
        .header("Cache-Control", "public, max-age=604800, immutable")
        .header("Cross-Origin-Resource-Policy", "cross-origin");
      return reply.send(stream);
    },
  );

  /* GET /api/public/equipment
   * G3: экипировка для шага «Что хотите арендовать» в публичной анкете.
   * Все позиции каталога (у экипировки нет флага active). quickPick — выше. */
  app.get("/equipment", async () => {
    const rows = await db
      .select({
        id: equipmentItems.id,
        name: equipmentItems.name,
        price: equipmentItems.price,
        isFree: equipmentItems.isFree,
        quickPick: equipmentItems.quickPick,
        avatarKey: equipmentItems.avatarKey,
      })
      .from(equipmentItems)
      .orderBy(equipmentItems.id);
    return {
      items: rows.map((r) => ({
        id: r.id,
        name: r.name,
        price: r.price,
        isFree: r.isFree,
        avatarUrl:
          r.avatarKey && r.avatarKey !== ""
            ? `/api/public/equipment/${r.id}/avatar`
            : null,
      })),
    };
  });

  /* Стрим аватарки экипировки (зеркало модели). Без авторизации. */
  app.get<{
    Params: { id: string };
    Querystring: { variant?: "thumb" | "view" };
  }>("/equipment/:id/avatar", async (req, reply) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return reply.code(400).send({ error: "bad id" });
    const [row] = await db
      .select({ avatarKey: equipmentItems.avatarKey })
      .from(equipmentItems)
      .where(eq(equipmentItems.id, id));
    if (!row || !row.avatarKey)
      return reply.code(404).send({ error: "not found" });

    let key = row.avatarKey;
    let meta;
    if (req.query.variant === "thumb" || req.query.variant === "view") {
      const derived = variantKey(row.avatarKey, req.query.variant);
      try {
        meta = await statObject(derived);
        key = derived;
      } catch {
        try {
          meta = await statObject(row.avatarKey);
        } catch {
          return reply.code(404).send({ error: "not found" });
        }
      }
    } else {
      try {
        meta = await statObject(row.avatarKey);
      } catch {
        return reply.code(404).send({ error: "not found" });
      }
    }
    const stream = await getObjectStream(key);
    reply
      .header("Content-Type", meta.mimeType)
      .header("Content-Length", meta.size)
      .header("Cache-Control", "public, max-age=604800, immutable")
      .header("Cross-Origin-Resource-Policy", "cross-origin");
    return reply.send(stream);
  });
}
