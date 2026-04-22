/**
 * Разовый seed только пользователей (таблица users).
 * Используется в проде после первого деплоя, когда БД уже засеяна клиентами/скутерами.
 *
 * Запуск:
 *   SEED_CREATOR_PASSWORD=... SEED_DIRECTOR_PASSWORD=... SEED_ADMIN_PASSWORD=... \
 *   FORCE_SEED=1 \
 *   pnpm db:seed:users
 */
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { closeDb, db } from "../db/index.js";
import { users } from "../db/schema.js";

async function main() {
  const creatorPw = process.env.SEED_CREATOR_PASSWORD;
  const directorPw = process.env.SEED_DIRECTOR_PASSWORD;
  const adminPw = process.env.SEED_ADMIN_PASSWORD;
  if (!creatorPw || !directorPw || !adminPw) {
    console.error(
      "✗ Задай SEED_CREATOR_PASSWORD / SEED_DIRECTOR_PASSWORD / SEED_ADMIN_PASSWORD в env",
    );
    process.exit(1);
  }

  const existing = await db.select({ c: sql<number>`count(*)` }).from(users);
  if (Number(existing[0]?.c ?? 0) > 0 && process.env.FORCE_SEED !== "1") {
    console.error(
      `✗ В таблице users уже есть записи. Если точно хочешь перезалить — FORCE_SEED=1`,
    );
    process.exit(1);
  }

  const hash = (pw: string) => bcrypt.hashSync(pw, 10);

  // Используем onConflictDoUpdate, чтобы можно было разово «перехешировать»
  // пароль если запустили с FORCE_SEED и уже есть юзеры с теми же логинами.
  await db
    .insert(users)
    .values([
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
    ])
    .onConflictDoUpdate({
      target: users.login,
      set: {
        passwordHash: sql`excluded.password_hash`,
        name: sql`excluded.name`,
        role: sql`excluded.role`,
        avatarColor: sql`excluded.avatar_color`,
        active: sql`true`,
      },
    });

  console.log("✓ Пользователи созданы/обновлены.");
  await closeDb();
}

main().catch(async (e) => {
  console.error("✗ Ошибка:", e);
  await closeDb().catch(() => {});
  process.exit(1);
});
