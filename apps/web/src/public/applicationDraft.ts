/**
 * Локальное сохранение черновика анкеты.
 *
 * Ключевая идея: форма заполняется через несколько экранов и потенциально
 * минут 5-10. Если клиент случайно закроет вкладку или потеряет связь —
 * не хочется терять введённые данные. localStorage хранит снимок до тех
 * пор пока заявка не отправлена (или TTL токена не истёк, тогда чистим).
 */

import type { ApplicationFields, FileKind } from "./applicationApi";

const STORAGE_KEY = "hulk-application-draft";

export type DraftSnapshot = {
  applicationId: number | null;
  uploadToken: string | null;
  expiresAt: string | null;
  fields: ApplicationFields;
  step: number;
  /** Какие файлы уже загружены (только метаданные, сами файлы в MinIO). */
  uploadedKinds: FileKind[];
  savedAt: string;
};

export function loadDraft(): DraftSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    // Проверяем срок жизни токена — если истёк, считаем что черновика нет
    if (parsed.expiresAt) {
      const expires = new Date(parsed.expiresAt).getTime();
      if (Number.isFinite(expires) && expires < Date.now()) return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(snapshot: DraftSnapshot): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* квота, приватный режим — игнор */
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* */
  }
}
