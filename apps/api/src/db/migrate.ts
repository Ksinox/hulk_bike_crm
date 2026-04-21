import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { config } from "../config.js";

/**
 * Прогоняет SQL-миграции из папки ./drizzle.
 * Запускается:
 *   • локально — `pnpm --filter api db:migrate`
 *   • на Dokploy — как Pre-deploy команда перед стартом api
 */
async function main() {
  const migrationClient = postgres(config.databaseUrl, { max: 1 });
  const db = drizzle(migrationClient);
  console.log("▶ Применяем миграции...");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ Миграции применены.");
  await migrationClient.end();
}

main().catch((e) => {
  console.error("✗ Ошибка миграций:", e);
  process.exit(1);
});
