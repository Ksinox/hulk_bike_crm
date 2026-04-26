import postgres from "postgres";
import { config } from "../config.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Миграции БД — идемпотентный SQL apply.
 *
 * Запускается:
 *   • локально — `pnpm --filter api db:migrate`
 *   • на Dokploy — pre-launch перед `node dist/index.js`
 *
 * Почему НЕ drizzle-migrator:
 *   Drizzle ведёт собственный журнал в __drizzle_migrations. Если ALTER TABLE
 *   падает на середине, журнал уже соврал что «применено». При следующем
 *   запуске drizzle думает «ничего делать не нужно», а реальная схема
 *   рассинхронизирована — API падает 500 на любых SELECT.
 *
 *   Мы используем idempotent apply: каждая миграция накатывается всегда,
 *   но errors кодов 42701/42710/42P07 (already exists) игнорируются.
 *   Любая другая ошибка прокидывается и провалит startup — Docker
 *   рестартанёт, в логах будет понятная причина.
 */
async function main() {
  const client = postgres(config.databaseUrl, { max: 1 });

  console.log("▶ Idempotent migration apply...");
  await applyMigrationsIdempotent(client);
  console.log("✓ Миграции применены.");

  await client.end();
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
    .sort();

  // Коды ошибок, которые означают «состояние уже есть, идём дальше»
  const benignCodes = new Set([
    "42701", // duplicate_column
    "42710", // duplicate_object (enum value, etc)
    "42P07", // duplicate_table
    "23505", // unique_violation
    "42P16", // invalid_table_definition (если ALTER уже применён)
  ]);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = await readFile(fullPath, "utf-8");
    // drizzle разделяет statements маркером --> statement-breakpoint
    const statements = content
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    let appliedCount = 0;
    let skippedCount = 0;
    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
        appliedCount++;
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code && benignCodes.has(code)) {
          skippedCount++;
          continue;
        }
        console.error(`  ✗ ${file}: ${(e as Error).message}`);
        throw e;
      }
    }
    if (appliedCount > 0 || skippedCount > 0) {
      console.log(
        `  ${file}: ${appliedCount} applied, ${skippedCount} skipped (already done)`,
      );
    }
  }
}

main().catch((e) => {
  console.error("✗ Ошибка миграций:", e);
  process.exit(1);
});
