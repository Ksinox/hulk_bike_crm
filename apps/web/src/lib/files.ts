/**
 * Утилиты для работы с файлами в MinIO через API.
 */

const BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

/**
 * URL для `<img src>` — стриминг из MinIO через /api/files/*.
 * variant:
 *   "thumb" — миниатюра ≤400×400 (~25 КБ WebP) для гридов и аватарок
 *   "view"  — превью ≤2000×2000 (~250 КБ WebP) для попапов
 *   undefined — оригинал (для скачивания)
 *
 * Если у объекта нет нужного варианта (legacy-загрузка до v0.4.61),
 * сервер silently fallback'ает на оригинал — UI не сломается.
 *
 * v0.4.63: cache-buster `&v=webp` нужен чтобы браузер не вернул из
 * 7-дневного кеша старый JPEG-вариант (где альфа была заплющена в
 * чёрный фон).
 */
export function fileUrl(
  key: string | null | undefined,
  opts: { variant?: "thumb" | "view" } = {},
): string | null {
  if (!key) return null;
  const qs = opts.variant ? `?variant=${opts.variant}&v=webp` : "";
  return `${BASE}/api/files/${encodeURI(key)}${qs}`;
}
