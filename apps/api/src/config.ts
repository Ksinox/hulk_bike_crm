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
  s3: {
    endpoint: process.env.S3_ENDPOINT ?? "localhost",
    port: Number(process.env.S3_PORT ?? 9000),
    useSSL: process.env.S3_USE_SSL === "true",
    accessKey: process.env.S3_ACCESS_KEY ?? "hulkminio",
    secretKey: process.env.S3_SECRET_KEY ?? "hulkminio_dev_password",
    bucket: process.env.S3_BUCKET ?? "hulk-docs",
  },
  auth: {
    jwtSecret:
      process.env.JWT_SECRET ??
      "dev-only-hulk-jwt-secret-change-me-in-production",
    /** Комбинация клавиш для разблокировки тайла creator'а на экране входа */
    creatorUnlockSequence:
      process.env.CREATOR_UNLOCK_SEQUENCE ?? "ksinox",
  },
} as const;

export const isProd = config.env === "production";
