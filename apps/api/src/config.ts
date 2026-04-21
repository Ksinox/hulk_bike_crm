import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Переменная окружения ${name} не задана. Скопируйте apps/api/.env.example в .env и заполните.`,
    );
  }
  return v;
}

export const config = {
  databaseUrl: required("DATABASE_URL"),
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "0.0.0.0",
  env: (process.env.NODE_ENV ?? "development") as
    | "development"
    | "staging"
    | "production",
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

export const isProd = config.env === "production";
