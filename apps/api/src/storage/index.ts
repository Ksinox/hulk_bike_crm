import { randomUUID } from "node:crypto";
import { Client as MinioClient } from "minio";
import { config } from "../config.js";

/**
 * Единый клиент для S3-совместимого хранилища (MinIO в dev/prod, при желании
 * Cloudflare R2 / Backblaze B2 — работает тот же протокол).
 */
export const s3 = new MinioClient({
  endPoint: config.s3.endpoint,
  port: config.s3.port,
  useSSL: config.s3.useSSL,
  accessKey: config.s3.accessKey,
  secretKey: config.s3.secretKey,
});

let bucketReady = false;

/** Создаёт бакет, если его нет. Идемпотентно. */
export async function ensureBucket(): Promise<void> {
  if (bucketReady) return;
  const exists = await s3.bucketExists(config.s3.bucket).catch(() => false);
  if (!exists) {
    await s3.makeBucket(config.s3.bucket);
  }
  bucketReady = true;
}

/** Сгенерировать уникальный ключ внутри бакета */
export function makeFileKey(kind: string, originalName: string): string {
  const ext = extOf(originalName);
  const uid = randomUUID();
  return `${kind}/${uid}${ext}`;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i < 0) return "";
  return name.slice(i).toLowerCase();
}

/** Загрузить буфер в хранилище */
export async function putObject(
  key: string,
  data: Buffer,
  mimeType: string,
): Promise<void> {
  await ensureBucket();
  await s3.putObject(config.s3.bucket, key, data, data.length, {
    "Content-Type": mimeType,
  });
}

/** Получить поток для чтения файла */
export async function getObjectStream(key: string): Promise<NodeJS.ReadableStream> {
  return s3.getObject(config.s3.bucket, key);
}

/** Удалить файл */
export async function removeObject(key: string): Promise<void> {
  await s3.removeObject(config.s3.bucket, key);
}

/** Метаданные файла */
export async function statObject(key: string): Promise<{
  size: number;
  mimeType: string;
}> {
  const stat = await s3.statObject(config.s3.bucket, key);
  return {
    size: stat.size,
    mimeType: stat.metaData?.["content-type"] ?? "application/octet-stream",
  };
}
