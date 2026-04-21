import postgres from "postgres";
import { config, isProd } from "../config.js";

/**
 * Полный сброс dev-БД: DROP SCHEMA public CASCADE → CREATE SCHEMA public.
 * После этого надо прогнать миграции заново (db:migrate) и seed (db:seed).
 *
 * Никогда не запускается в production — проверяем по NODE_ENV.
 */
async function main() {
  if (isProd) {
    console.error(
      "✗ db:reset запрещён в production. Используйте db:migrate для обновления схемы.",
    );
    process.exit(1);
  }
  const client = postgres(config.databaseUrl, { max: 1 });
  console.log("⚠ Удаляем схему public...");
  await client.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await client.unsafe("CREATE SCHEMA public");
  await client.end();
  console.log("✓ Схема public очищена. Теперь: pnpm --filter api db:migrate");
}

main().catch((e) => {
  console.error("✗ Ошибка db:reset:", e);
  process.exit(1);
});
