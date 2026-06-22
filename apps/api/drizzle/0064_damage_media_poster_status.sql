-- Видео ущерба: серверное перекодирование (H.264 MP4) + кадр-обложка.
--   poster_key — ключ JPEG-обложки (кадр из видео) в MinIO;
--   status     — 'processing' пока ffmpeg перекодирует, потом 'ready'.
-- Для фото status сразу 'ready', poster_key = NULL.
ALTER TABLE "damage_report_media" ADD COLUMN IF NOT EXISTS "poster_key" text;
ALTER TABLE "damage_report_media" ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'ready';
