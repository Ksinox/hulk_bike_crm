/**
 * Чистка медиа-сирот ущерба (Part B — eager upload).
 *
 * Когда оператор открывает «Зафиксировать ущерб», прикладывает фото/видео и
 * НЕ сохраняет акт (закрыл вкладку — draft-токен в sessionStorage пропал),
 * медиа остаётся «сиротой»: report_id IS NULL + draft_token IS NOT NULL.
 * Раз в 6 часов удаляем таких сирот старше суток — и записи в БД, и объекты
 * из хранилища (включая image-варианты thumb/view и постер видео).
 *
 * Идемпотентно. Привязанные к акту медиа (report_id IS NOT NULL) не трогаем,
 * как и свежих сирот (вдруг форма ещё открыта и токен жив).
 */
import { db } from "../db/index.js";
import { damageReportMedia } from "../db/schema.js";
import { removeObject } from "../storage/index.js";
import { and, eq, inArray, isNotNull, isNull, lt } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import {
  isVideoInFlight,
  reprocessStuckVideo,
} from "./damageVideoProcessor.js";

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000; // раз в 6 часов
const MAX_AGE_HOURS = 24;
const BATCH = 500;

// Свежим видео даём дожаться СВОИМ транскодом (этот же процесс) — не лезем.
const REPROCESS_GRACE_MIN = 1.5;
// Дольше этого перезапуски не помогли (битый вход) — сдаёмся, оставляем
// оригинал ready (нативно открывается). Таймаут одного транскода — 4 мин.
const GIVEUP_MIN = 10;
const RECOVERY_INTERVAL_MS = 60 * 1000; // дожим — раз в минуту

async function tickCleanup(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - MAX_AGE_HOURS * 60 * 60 * 1000);
    const orphans = await db
      .select({
        id: damageReportMedia.id,
        fileKey: damageReportMedia.fileKey,
        posterKey: damageReportMedia.posterKey,
      })
      .from(damageReportMedia)
      .where(
        and(
          isNull(damageReportMedia.reportId),
          isNotNull(damageReportMedia.draftToken),
          lt(damageReportMedia.uploadedAt, cutoff),
        ),
      )
      .limit(BATCH);
    if (orphans.length === 0) return;

    for (const m of orphans) {
      // removeObject сам чистит image-варианты (thumb/view); для видео — no-op.
      await removeObject(m.fileKey).catch(() => {});
      if (m.posterKey) await removeObject(m.posterKey).catch(() => {});
    }
    const ids = orphans.map((m) => m.id);
    await db.delete(damageReportMedia).where(inArray(damageReportMedia.id, ids));
    console.log(
      `[damage-media-cleanup] удалено сирот: ${orphans.length} (ids: ${ids
        .slice(0, 20)
        .join(",")}${orphans.length > 20 ? "…" : ""})`,
    );
  } catch (e) {
    console.error(
      "[damage-media-cleanup] tick failed:",
      (e as Error).message ?? e,
    );
  }
}

/**
 * Дожать «зависшие» видео ущерба — устойчивость к рестартам.
 *
 * Транскод запускается fire-and-forget ВНУТРИ процесса API. Если процесс
 * перезапустился (деплой/краш/OOM) посреди перекодировки — задача умирает,
 * видео навсегда висит в "processing" (спиннер «готовим версию…» вечно). Так
 * НЕ делают крупные сервисы: там очередь задач (BullMQ/SQS) переживает рестарт
 * и перезапускает упавшие джобы. У нас единицы видео в день → Redis-очередь
 * избыточна; делаем устойчивость на самой БД:
 *
 *   • берём processing-видео старше grace (свежие — ещё в работе своего процесса);
 *   • что прямо сейчас жуёт ЭТОТ процесс (isVideoInFlight) — пропускаем;
 *   • старше GIVEUP — сдаёмся (оставляем оригинал ready, не зацикливаемся на
 *     битом входе);
 *   • остальные (осиротевшие рестартом) — ПЕРЕЗАПУСКАЕМ транскод.
 *
 * sweeping-гард не даёт тикам наслаиваться (один транскод за раз — бережём CPU
 * слабого сервера); inFlight-гард в самом процессоре исключает двойной запуск.
 */
let sweeping = false;
async function recoverStuckProcessingVideos(): Promise<void> {
  if (sweeping) return;
  sweeping = true;
  try {
    const graceCutoff = new Date(Date.now() - REPROCESS_GRACE_MIN * 60 * 1000);
    const giveupAt = Date.now() - GIVEUP_MIN * 60 * 1000;
    const stuck = await db
      .select({
        id: damageReportMedia.id,
        fileKey: damageReportMedia.fileKey,
        fileName: damageReportMedia.fileName,
        uploadedAt: damageReportMedia.uploadedAt,
      })
      .from(damageReportMedia)
      .where(
        and(
          eq(damageReportMedia.kind, "video"),
          eq(damageReportMedia.status, "processing"),
          lt(damageReportMedia.uploadedAt, graceCutoff),
        ),
      )
      .limit(BATCH);
    for (const row of stuck) {
      if (isVideoInFlight(row.id)) continue;
      if (new Date(row.uploadedAt).getTime() < giveupAt) {
        await db
          .update(damageReportMedia)
          .set({ status: "ready" })
          .where(eq(damageReportMedia.id, row.id))
          .catch(() => {});
        console.log(
          `[damage-video] сдались на видео ${row.id} (>${GIVEUP_MIN}мин) — оставили оригинал ready`,
        );
      } else {
        console.log(`[damage-video] дожимаем осиротевшее видео ${row.id}`);
        await reprocessStuckVideo(
          console as unknown as FastifyBaseLogger,
          row,
        ).catch((e) =>
          console.error(
            `[damage-video] reprocess ${row.id} failed:`,
            (e as Error).message ?? e,
          ),
        );
      }
    }
  } catch (e) {
    console.error(
      "[damage-video-recovery] tick failed:",
      (e as Error).message ?? e,
    );
  } finally {
    sweeping = false;
  }
}

/**
 * Запускает scheduler: чистка сирот (раз в 6ч) + разморозка зависших видео
 * (через 20с после старта — быстро лечим осиротевших после деплоя, далее
 * каждые 5 минут).
 */
export function scheduleDamageMediaCleanup(): void {
  setTimeout(tickCleanup, 45_000);
  setInterval(tickCleanup, TICK_INTERVAL_MS);
  // Дожиматель видео: первый прогон через 15с после старта (быстро
  // перезапускаем транскоды, осиротевшие деплоем), далее раз в минуту.
  setTimeout(recoverStuckProcessingVideos, 15_000);
  setInterval(recoverStuckProcessingVideos, RECOVERY_INTERVAL_MS);
  // eslint-disable-next-line no-console
  console.log(
    "damage-media-cleanup: активирован (чистка сирот 6ч + дожим видео 1мин)",
  );
}
