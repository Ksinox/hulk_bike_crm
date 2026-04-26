import { gzipSync } from "node:zlib";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { s3 } from "../storage/index.js";
import { config } from "../config.js";

/**
 * Резервное копирование БД в MinIO.
 *
 * Стратегия (минимально-достаточная для disaster recovery):
 *   1. Дампим SELECT * для каждой бизнес-таблицы → один большой JSON.
 *   2. Сжимаем gzip.
 *   3. Заливаем в бакет hulk-backups с ключом backups/YYYY-MM-DD.json.gz.
 *   4. Удаляем дампы старше 30 дней.
 *
 * Восстановление:
 *   • прогнать миграции (создаст пустые таблицы);
 *   • скачать .json.gz, разжать, INSERT-нуть записи назад.
 *   Скрипт восстановления в scripts/restore_from_backup.py.
 *
 * Запуск:
 *   • Авто: каждый час setInterval проверяет, был ли уже backup сегодня.
 *     Если нет — делает. Привязки к 3:00 UTC нет — нам важна идемпотентность,
 *     не точное время.
 *   • Руками: POST /api/_diag/backup (creator-only).
 */

const BACKUP_BUCKET = "hulk-backups";

/** Таблицы, которые бэкапим. Порядок важен для restore по FK. */
const TABLES_IN_ORDER = [
  "users",
  "scooter_models",
  "equipment_items",
  "scooters",
  "clients",
  "rentals",
  "payments",
  "return_inspections",
  "client_documents",
  "scooter_documents",
  "scooter_maintenance",
  "rental_incidents",
  "rental_tasks",
  "activity_log",
];

/** Делает дамп всей БД и заливает в MinIO. Возвращает ключ объекта. */
export async function runBackup(): Promise<{
  key: string;
  sizeBytes: number;
  rows: number;
}> {
  await ensureBackupBucket();

  const dump: Record<string, unknown[]> = {};
  let totalRows = 0;
  for (const table of TABLES_IN_ORDER) {
    try {
      const rows = await db.execute(
        sql.raw(`SELECT * FROM "${table}" ORDER BY 1`),
      );
      dump[table] = rows as unknown[];
      totalRows += (rows as unknown[]).length;
    } catch (e) {
      // Таблица отсутствует — пропускаем (например, в early dev до миграций).
      dump[table] = [];
      console.warn(
        `backup: пропущена таблица ${table}: ${(e as Error).message}`,
      );
    }
  }

  const meta = {
    version: 1,
    createdAt: new Date().toISOString(),
    rows: totalRows,
  };
  const json = JSON.stringify({ meta, data: dump });
  const gz = gzipSync(json);

  const key = `backups/${dateKey(new Date())}.json.gz`;
  await s3.putObject(BACKUP_BUCKET, key, gz, gz.length, {
    "Content-Type": "application/gzip",
  });

  console.log(
    `✓ backup: ${key} — ${totalRows} строк, ${(gz.length / 1024).toFixed(1)} KB`,
  );

  // Подчищаем старые
  await pruneOldBackups();

  return { key, sizeBytes: gz.length, rows: totalRows };
}

/** Проверяет был ли уже бэкап сегодня. */
export async function hasBackupForToday(): Promise<boolean> {
  await ensureBackupBucket();
  const today = dateKey(new Date());
  return new Promise((resolve, reject) => {
    let found = false;
    const stream = s3.listObjectsV2(
      BACKUP_BUCKET,
      `backups/${today}`,
      true,
    );
    stream.on("data", () => {
      found = true;
    });
    stream.on("end", () => resolve(found));
    stream.on("error", reject);
  });
}

/** Удаляет дампы старше N дней. */
async function pruneOldBackups(retentionDays = 30): Promise<void> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  const toDelete: string[] = [];
  await new Promise<void>((resolve, reject) => {
    const stream = s3.listObjectsV2(BACKUP_BUCKET, "backups/", true);
    stream.on("data", (obj) => {
      // ключ: backups/YYYY-MM-DD.json.gz
      const m = obj.name?.match(/backups\/(\d{4}-\d{2}-\d{2})/);
      if (!m) return;
      const d = new Date(m[1]!);
      if (Number.isFinite(d.getTime()) && d < cutoff) {
        toDelete.push(obj.name!);
      }
    });
    stream.on("end", () => resolve());
    stream.on("error", reject);
  });

  for (const name of toDelete) {
    await s3.removeObject(BACKUP_BUCKET, name).catch(() => undefined);
  }
  if (toDelete.length > 0) {
    console.log(`backup prune: удалено ${toDelete.length} старых дампов`);
  }
}

async function ensureBackupBucket(): Promise<void> {
  const exists = await s3.bucketExists(BACKUP_BUCKET).catch(() => false);
  if (!exists) {
    await s3.makeBucket(BACKUP_BUCKET).catch(() => undefined);
  }
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Запускает «scheduler»: при старте API делает backup если за сегодня его
 * ещё не было, потом раз в час проверяет. Использует флаг hasBackupForToday
 * — если контейнер несколько раз перезапустится за день, лишние дампы
 * не создадутся.
 *
 * Использует voidConfig для подавления unused warning, если backup отключён.
 */
export function scheduleDailyBackup(): void {
  const enabled =
    config.env === "production" || process.env.BACKUP_ENABLED === "true";
  if (!enabled) {
    console.log("backup: scheduler выключен (env != production)");
    return;
  }

  const tick = async () => {
    try {
      const has = await hasBackupForToday();
      if (!has) {
        await runBackup();
      }
    } catch (e) {
      console.error("backup tick error:", (e as Error).message ?? e);
    }
  };

  // Первая проверка через 60 секунд после старта (чтобы API успел
  // подняться и отвечать на /health). Потом каждый час.
  setTimeout(tick, 60_000);
  setInterval(tick, 60 * 60 * 1000);
  console.log("backup: scheduler активирован (раз в сутки)");
}
