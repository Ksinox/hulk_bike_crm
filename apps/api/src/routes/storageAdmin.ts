import type { FastifyInstance } from "fastify";
import { statfs } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { s3 } from "../storage/index.js";
import { config } from "../config.js";

/**
 * «Хранилище» — обзор места: сколько занято БД, сколько файлами (по
 * категориям), сколько на диске сервера. Плюс файловый браузер по бакету
 * (в стиле Яндекс.Диска: папки-префиксы → файлы). Только creator/director.
 *
 * ВАЖНО: серверные/системные части мы НЕ трогаем — показываем их как
 * «прочее/система» (диск минус БД минус файлы), чтобы было видно сколько
 * реально занимает наше хранилище и сколько осталось.
 */

function isCreatorOrDirector(role: string): boolean {
  return role === "creator" || role === "director";
}

/** Человекочитаемые названия категорий по верхнему префиксу ключа. */
const CATEGORY_LABEL: Record<string, string> = {
  applications: "Заявки (анкеты)",
  clients: "Документы клиентов",
  repairs: "Фото ремонтов",
  damages: "Фото/видео ущерба",
  scooters: "Фото скутеров",
  models: "Аватары моделей",
  equipment: "Аватары экипировки",
  backups: "Бэкапы",
};

/** Это сгенерированный вариант (thumb/view) — не показываем в браузере. */
function isVariant(name: string): boolean {
  return /\.__(thumb|view)__\.webp$/i.test(name);
}

type BucketObject = { name?: string; prefix?: string; size?: number; lastModified?: Date };

/** Прочитать поток листинга бакета в массив (minio отдаёт Stream). */
function collectList(
  prefix: string,
  recursive: boolean,
): Promise<BucketObject[]> {
  return new Promise((resolve, reject) => {
    const out: BucketObject[] = [];
    const stream = s3.listObjectsV2(config.s3.bucket, prefix, recursive);
    stream.on("data", (o: BucketObject) => out.push(o));
    stream.on("end", () => resolve(out));
    stream.on("error", reject);
  });
}

export async function storageAdminRoutes(app: FastifyInstance) {
  /**
   * GET /api/storage/stats — сводка по месту.
   *  • db.size           — размер базы (pg_database_size);
   *  • files.size+byCategory — суммарный объём бакета и разбивка по категориям
   *    (включая сгенерированные thumb/view — это реальное место);
   *  • disk              — диск сервера (best-effort statfs), может быть
   *    диском контейнера, потому помечен и используется лишь как ориентир.
   */
  app.get("/stats", async (req, reply) => {
    if (!isCreatorOrDirector(req.user.role)) {
      return reply.code(403).send({ error: "forbidden" });
    }

    // Размер БД.
    let dbSize = 0;
    try {
      const rows = (await db.execute(
        sql`SELECT pg_database_size(current_database())::bigint AS size`,
      )) as unknown as Array<{ size: string | number }>;
      dbSize = Number(rows?.[0]?.size ?? 0);
    } catch {
      /* ignore — покажем 0 */
    }

    // Бакет: суммарный объём + разбивка по верхнему префиксу.
    const byCat = new Map<string, { count: number; size: number }>();
    let totalCount = 0;
    let totalSize = 0;
    try {
      const objs = await collectList("", true);
      for (const o of objs) {
        if (!o.name) continue;
        const size = o.size ?? 0;
        const cat = o.name.split("/")[0] || "прочее";
        const e = byCat.get(cat) ?? { count: 0, size: 0 };
        e.count += 1;
        e.size += size;
        byCat.set(cat, e);
        totalCount += 1;
        totalSize += size;
      }
    } catch {
      /* ignore — бакет может быть пуст/недоступен */
    }

    // Диск сервера (best-effort).
    let disk: { total: number; free: number; used: number } | null = null;
    try {
      const st = await statfs("/");
      const total = Number(st.blocks) * Number(st.bsize);
      const free = Number(st.bavail) * Number(st.bsize);
      disk = { total, free, used: total - free };
    } catch {
      /* ignore */
    }

    return {
      bucket: config.s3.bucket,
      db: { size: dbSize },
      files: {
        count: totalCount,
        size: totalSize,
        byCategory: [...byCat.entries()]
          .map(([key, v]) => ({
            key,
            label: CATEGORY_LABEL[key] ?? key,
            count: v.count,
            size: v.size,
          }))
          .sort((a, b) => b.size - a.size),
      },
      disk,
    };
  });

  /**
   * GET /api/storage/list?prefix= — файловый браузер (как Яндекс.Диск).
   * Не-рекурсивно: возвращает подпапки (общие префиксы) и файлы текущего
   * уровня. Сгенерированные thumb/view-варианты скрываем (это служебные).
   */
  app.get<{ Querystring: { prefix?: string } }>(
    "/list",
    async (req, reply) => {
      if (!isCreatorOrDirector(req.user.role)) {
        return reply.code(403).send({ error: "forbidden" });
      }
      const prefix = String(req.query.prefix ?? "");
      const objs = await collectList(prefix, false).catch(() => []);
      const folders: Array<{ prefix: string; name: string; label?: string }> =
        [];
      const files: Array<{
        key: string;
        name: string;
        size: number;
        lastModified: string | null;
      }> = [];
      for (const o of objs) {
        if (o.prefix) {
          const name = o.prefix.slice(prefix.length).replace(/\/$/, "");
          folders.push({
            prefix: o.prefix,
            name,
            label: prefix === "" ? (CATEGORY_LABEL[name] ?? undefined) : undefined,
          });
        } else if (o.name && !isVariant(o.name)) {
          files.push({
            key: o.name,
            name: o.name.slice(prefix.length),
            size: o.size ?? 0,
            lastModified: o.lastModified
              ? new Date(o.lastModified).toISOString()
              : null,
          });
        }
      }
      folders.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      return { prefix, folders, files };
    },
  );
}
