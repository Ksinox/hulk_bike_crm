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
import { and, inArray, isNotNull, isNull, lt } from "drizzle-orm";

const TICK_INTERVAL_MS = 6 * 60 * 60 * 1000; // раз в 6 часов
const MAX_AGE_HOURS = 24;
const BATCH = 500;

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
 * Запускает scheduler чистки: первый прогон через 45 секунд после старта,
 * далее раз в 6 часов.
 */
export function scheduleDamageMediaCleanup(): void {
  setTimeout(tickCleanup, 45_000);
  setInterval(tickCleanup, TICK_INTERVAL_MS);
  // eslint-disable-next-line no-console
  console.log("damage-media-cleanup: активирован (раз в 6 часов)");
}
