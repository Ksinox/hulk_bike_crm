/**
 * Утилиты для работы с файлами в MinIO через API.
 */

const BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

/**
 * URL для `<img src>` — стриминг из MinIO через /api/files/*.
 * variant:
 *   "thumb" — миниатюра ≤400×400 (~30 КБ) для гридов и аватарок
 *   "view"  — превью ≤2000×2000 (~300 КБ) для попапов
 *   undefined — оригинал (для скачивания)
 *
 * Если у объекта нет нужного варианта (legacy-загрузка до v0.4.61),
 * сервер silently fallback'ает на оригинал — UI не сломается.
 */
export function fileUrl(
  key: string | null | undefined,
  opts: { variant?: "thumb" | "view" } = {},
): string | null {
  if (!key) return null;
  const qs = opts.variant ? `?variant=${opts.variant}` : "";
  return `${BASE}/api/files/${encodeURI(key)}${qs}`;
}
