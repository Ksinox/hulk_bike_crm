import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "../config.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Прогоняет SQL-миграции из папки ./drizzle.
 *
 * Запускается:
 *   • локально — `pnpm --filter api db:migrate`
 *   • на Dokploy — pre-launch перед `node dist/index.js`
 *
 * УСТОЙЧИВОСТЬ К РАССИНХРОНУ:
 *   Если drizzle-журнал миграций разошёлся с фактической схемой
 *   (например миграция применялась через прошлые сборки, потом её
 *   пересоздавали с другим хешем), стандартный `migrate()` падает —
 *   и контейнер на Dokploy уходит в restart loop, API становится 502.
 *
 *   Чтобы не лежать на проде: если основной migrate бросает
 *   «уже существует / уже применена», переходим в self-healing режим —
 *   читаем .sql файлы и применяем по statement, ловя ошибки 42701
 *   (column already exists), 42710 (object already exists), 42P07
 *   (relation already exists), 42P16 (invalid table definition).
 *   Эти ошибки означают что нужное состояние уже есть → продолжаем.
 */
async function main() {
  const migrationClient = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);

  console.log("▶ Применяем миграции (drizzle migrator)...");
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✓ Миграции применены штатно.");
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    console.warn("⚠ Штатная миграция упала:", msg);
    console.warn("  Переходим в self-healing режим (idempotent SQL).");
    await applyMigrationsIdempotent(migrationClient);
    console.log("✓ Self-healing миграции завершены.");
  }

  await migrationClient.end();
}

/**
 * Идемпотентное применение всех .sql файлов из ./drizzle.
 * Игнорирует ошибки «уже существует» — они означают что нужное состояние
 * в БД уже достигнуто. Любую другую ошибку — прокидываем дальше.
 */
async function applyMigrationsIdempotent(
  sql: postgres.Sql<Record<string, never>>,
): Promise<void> {
  const dir = path.resolve("./drizzle");
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 0000_*, 0001_*, ... — лексикографически совпадает с порядком

  // Коды ошибок, которые означают «состояние уже есть, идём дальше»
  const benignCodes = new Set([
    "42701", // duplicate_column
    "42710", // duplicate_object
    "42P07", // duplicate_table
    "23505", // unique_violation (запись уже в журнале миграций)
  ]);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = await readFile(fullPath, "utf-8");
    // drizzle разделяет statements маркером --> statement-breakpoint
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code && benignCodes.has(code)) {
          // Идемпотентно — пропускаем
          console.log(`  · ${file}: пропущено (${code})`);
          continue;
        }
        // Реальная ошибка — пробрасываем
        console.error(`  ✗ ${file}: ${(e as Error).message}`);
        throw e;
      }
    }
    console.log(`  ✓ ${file}`);
  }
}

main().catch((e) => {
  console.error("✗ Ошибка миграций:", e);
  process.exit(1);
});
