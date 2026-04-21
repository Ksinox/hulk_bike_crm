import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { config } from "../config.js";
import * as schema from "./schema.js";

/**
 * Единственное подключение к Postgres на процесс.
 * postgres-js управляет пулом сам; для serverless имел бы другие параметры.
 */
const client = postgres(config.databaseUrl, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(client, { schema, logger: !config.env.includes("prod") });

export { schema };

/** Аккуратно закрыть подключение (при SIGTERM). */
export async function closeDb(): Promise<void> {
  await client.end({ timeout: 5 });
}
