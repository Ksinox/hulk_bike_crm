/**
 * Утилиты для работы с файлами в MinIO через API.
 */

const BASE =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4000";

/** URL для <img src> — стриминг из MinIO через /api/files/*. */
export function fileUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `${BASE}/api/files/${encodeURI(key)}`;
}
