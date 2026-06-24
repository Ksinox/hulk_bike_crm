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

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000; // раз в 6 часов
const MAX_AGE_HOURS = 24;
const BATCH = 500;

// Видео в "processing" дольше этого считаем осиротевшим (рестарт оборвал
// фоновый транскод). Таймаут транскода — 4 мин, так что 10 мин безопасно.
const PROCESSING_STALE_MIN = 10;
const RECOVERY_INTERVAL_MS = 5 * 60 * 1000; // разморозка — каждые 5 минут

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
 * Разморозка «зависших» видео ущерба.
 *
 * processDamageVideo (fire-and-forget) ставит status=ready и при успешном
 * транскоде, И при ошибке/таймауте (оставляя оригинал). Запись остаётся в
 * "processing" ТОЛЬКО если процесс API умер на полпути — деплой, рестарт или
 * краш оборвали фоновую задачу до того, как она обновила статус. Тогда в
 * лайтбоксе спиннер «готовим версию…» крутится вечно, хотя оригинал давно на
 * месте и проигрывается.
 *
 * Лечим: видео в "processing" старше PROCESSING_STALE_MIN считаем осиротевшим
 * и помечаем ready (оригинал доступен, откроется нативно; HEVC-перекодирование
 * не случилось, но это лучше вечного спиннера). Идемпотентно.
 */
async function recoverStuckProcessingVideos(): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - PROCESSING_STALE_MIN * 60 * 1000);
    const recovered = await db
      .update(damageReportMedia)
      .set({ status: "ready" })
      .where(
        and(
          eq(damageReportMedia.kind, "video"),
          eq(damageReportMedia.status, "processing"),
          lt(damageReportMedia.uploadedAt, cutoff),
        ),
      )
      .returning({ id: damageReportMedia.id });
    if (recovered.length > 0) {
      console.log(
        `[damage-media-recovery] разморожено зависших видео: ${
          recovered.length
        } (ids: ${recovered
          .map((r) => r.id)
          .slice(0, 20)
          .join(",")}${recovered.length > 20 ? "…" : ""})`,
      );
    }
  } catch (e) {
    console.error(
      "[damage-media-recovery] tick failed:",
      (e as Error).message ?? e,
    );
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
  setTimeout(recoverStuckProcessingVideos, 20_000);
  setInterval(recoverStuckProcessingVideos, RECOVERY_INTERVAL_MS);
  // eslint-disable-next-line no-console
  console.log(
    "damage-media-cleanup: активирован (чистка сирот 6ч + разморозка видео 5мин)",
  );
}
