import type { FastifyBaseLogger } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { damageReportMedia } from "../db/schema.js";
import { transcodeVideo } from "../storage/video.js";
import {
  getObjectBuffer,
  makeFileKey,
  putObject,
  removeObject,
} from "../storage/index.js";
import { putObjectWithImageVariants } from "../storage/image.js";

/**
 * Обработчик видео ущерба + устойчивость к рестартам.
 *
 * ПРОБЛЕМА, которую лечим: транскод запускался fire-and-forget ВНУТРИ процесса
 * API. Если процесс перезапускался (деплой / краш / OOM) посреди перекодировки —
 * задача умирала, видео навсегда застревало в "processing". Так делают НЕ в
 * крупных сервисах: там очередь задач (BullMQ/SQS) переживает рестарт и
 * перезапускает упавшие джобы. У нас объёмы маленькие (единицы видео в день),
 * поэтому Redis-очередь избыточна — делаем «лёгкую» устойчивость на самой БД:
 *
 *   • строка damage_report_media со status='processing' = и есть «джоба»;
 *   • inFlight (этот сет) — что прямо сейчас жуёт ЭТОТ процесс (чтобы не
 *     запускать второй транскод того же видео);
 *   • «дожиматель» (damageMediaCleanup) периодически находит осиротевшие
 *     processing-видео (не in-flight, старше grace) и перезапускает их.
 *
 * На рестарте сет пуст → всё, что было processing, честно перезапустится.
 */
const inFlight = new Set<number>();

export function isVideoInFlight(id: number): boolean {
  return inFlight.has(id);
}

/**
 * Перекодирование одного видео: ffmpeg → H.264 MP4 (+ обложка), подмена записи
 * (fileKey→mp4, status=ready), удаление оригинала. H.264 внутри transcodeVideo
 * ремуксится без потерь (быстро), прочее — транскодируется. При ошибке оставляем
 * оригинал и помечаем ready (нативно хотя бы открывается).
 *
 * Гард по inFlight делает вызов идемпотентным: повторный запуск, пока идёт
 * первый, — no-op.
 */
export async function processDamageVideo(
  log: FastifyBaseLogger,
  mediaId: number,
  keyPrefix: string,
  buf: Buffer,
  fileName: string,
  origKey: string,
): Promise<void> {
  if (inFlight.has(mediaId)) return;
  inFlight.add(mediaId);
  try {
    const { mp4, poster } = await transcodeVideo(buf, fileName);
    const base = fileName.replace(/\.[^.]+$/, "") || "video";
    const mp4Key = makeFileKey(keyPrefix, `${base}.mp4`);
    await putObject(mp4Key, mp4, "video/mp4");
    let posterKey: string | null = null;
    if (poster) {
      posterKey = makeFileKey(keyPrefix, `${base}.jpg`);
      await putObjectWithImageVariants(posterKey, poster, "image/jpeg");
    }
    await db
      .update(damageReportMedia)
      .set({
        fileKey: mp4Key,
        posterKey,
        mimeType: "video/mp4",
        size: mp4.length,
        status: "ready",
      })
      .where(eq(damageReportMedia.id, mediaId));
    if (origKey !== mp4Key) await removeObject(origKey).catch(() => {});
    log.info({ mediaId }, "damage video transcoded");
  } catch (e) {
    log.error({ err: e, mediaId }, "damage video transcode failed");
    await db
      .update(damageReportMedia)
      .set({ status: "ready" })
      .where(eq(damageReportMedia.id, mediaId))
      .catch(() => {});
  } finally {
    inFlight.delete(mediaId);
  }
}

/**
 * Дожать «зависшее» видео: читаем оригинал из MinIO по текущему fileKey и
 * запускаем перекодирование заново. Для видео, осиротевших рестартом API.
 */
export async function reprocessStuckVideo(
  log: FastifyBaseLogger,
  row: { id: number; fileKey: string; fileName: string },
): Promise<void> {
  if (inFlight.has(row.id)) return;
  const origKey = row.fileKey;
  const slash = origKey.lastIndexOf("/");
  const keyPrefix = slash >= 0 ? origKey.slice(0, slash) : "damages";
  const buf = await getObjectBuffer(origKey);
  await processDamageVideo(log, row.id, keyPrefix, buf, row.fileName, origKey);
}
