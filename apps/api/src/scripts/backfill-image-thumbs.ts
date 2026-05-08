/**
 * Backfill: для всех существующих картинок в MinIO (clientDocuments,
 * scooterDocuments, repairProgressPhotos, clientApplicationFiles)
 * генерируем view+thumb варианты, если их ещё нет.
 *
 * Запуск:
 *   pnpm --filter api exec tsx src/scripts/backfill-image-thumbs.ts
 *
 * Идемпотентно: проверяет наличие variantKey в MinIO через statObject;
 * если уже есть — пропускает. Можно гонять сколько угодно раз.
 *
 * Логи в консоль: для каждого файла «OK» / «skip (already)» / «not image»
 * / «error: …». В конце сводка.
 */
import { db } from "../db/index.js";
import {
  clientDocuments,
  scooterDocuments,
  repairProgressPhotos,
  clientApplicationFiles,
} from "../db/schema.js";
import { getObjectStream, statObject } from "../storage/index.js";
import {
  generateImageVariants,
  isProcessableImage,
  variantKey,
} from "../storage/image.js";
import { putObject } from "../storage/index.js";

type Stats = {
  total: number;
  ok: number;
  skipped: number;
  notImage: number;
  errors: number;
};

async function streamToBuffer(
  stream: NodeJS.ReadableStream,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function processOne(
  fileKey: string,
  mimeType: string,
  stats: Stats,
): Promise<void> {
  stats.total++;
  if (!isProcessableImage(mimeType)) {
    stats.notImage++;
    return;
  }
  const thumbKey = variantKey(fileKey, "thumb");
  const viewKey = variantKey(fileKey, "view");
  // Если оба варианта уже есть — пропускаем.
  let hasThumb = false;
  let hasView = false;
  try {
    await statObject(thumbKey);
    hasThumb = true;
  } catch {
    /* нет */
  }
  try {
    await statObject(viewKey);
    hasView = true;
  } catch {
    /* нет */
  }
  if (hasThumb && hasView) {
    stats.skipped++;
    console.log(`skip (already) ${fileKey}`);
    return;
  }
  // Скачиваем оригинал и генерим варианты.
  try {
    const origStream = await getObjectStream(fileKey);
    const buf = await streamToBuffer(origStream);
    const variants = await generateImageVariants(buf, mimeType);
    if (!variants) {
      stats.errors++;
      console.warn(`error (sharp returned null): ${fileKey}`);
      return;
    }
    if (!hasThumb) {
      await putObject(thumbKey, variants.thumb, "image/jpeg");
    }
    if (!hasView) {
      await putObject(viewKey, variants.view, "image/jpeg");
    }
    stats.ok++;
    console.log(`OK ${fileKey}`);
  } catch (err) {
    stats.errors++;
    console.error(`error ${fileKey}:`, err);
  }
}

async function main(): Promise<void> {
  const stats: Stats = {
    total: 0,
    ok: 0,
    skipped: 0,
    notImage: 0,
    errors: 0,
  };

  // 1. client_documents — паспорта/ВУ/доп.
  console.log("\n— client_documents —");
  const cdocs = await db
    .select({ fileKey: clientDocuments.fileKey, mimeType: clientDocuments.mimeType })
    .from(clientDocuments);
  for (const r of cdocs) await processOne(r.fileKey, r.mimeType, stats);

  // 2. scooter_documents — ПТС/СТС/ОСАГО/фото.
  console.log("\n— scooter_documents —");
  const sdocs = await db
    .select({ fileKey: scooterDocuments.fileKey, mimeType: scooterDocuments.mimeType })
    .from(scooterDocuments);
  for (const r of sdocs) await processOne(r.fileKey, r.mimeType, stats);

  // 3. repair_progress_photos — фото к чек-листу ремонта.
  console.log("\n— repair_progress_photos —");
  const rphotos = await db
    .select({ fileKey: repairProgressPhotos.fileKey, mimeType: repairProgressPhotos.mimeType })
    .from(repairProgressPhotos);
  for (const r of rphotos) await processOne(r.fileKey, r.mimeType, stats);

  // 4. client_application_files — фото из публичной анкеты.
  console.log("\n— client_application_files —");
  const afiles = await db
    .select({ fileKey: clientApplicationFiles.fileKey, mimeType: clientApplicationFiles.mimeType })
    .from(clientApplicationFiles);
  for (const r of afiles) await processOne(r.fileKey, r.mimeType, stats);

  console.log("\n— summary —");
  console.log(`total processed: ${stats.total}`);
  console.log(`  generated:     ${stats.ok}`);
  console.log(`  skipped:       ${stats.skipped} (variants already exist)`);
  console.log(`  not image:     ${stats.notImage}`);
  console.log(`  errors:        ${stats.errors}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("backfill failed:", err);
    process.exit(1);
  });
