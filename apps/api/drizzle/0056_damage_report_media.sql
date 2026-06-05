-- v0.8.x: фото/видео повреждений к акту ущерба.
-- Оператор прикладывает прямо при приёмке (с камеры телефона) — заменяет
-- ручную фиксацию в Telegram. Фото получают thumb/view-варианты,
-- видео хранится как есть. Идемпотентно (CREATE TABLE IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS damage_report_media (
  id bigserial PRIMARY KEY,
  report_id bigint NOT NULL REFERENCES damage_reports(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'photo',
  file_key text NOT NULL,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size integer NOT NULL DEFAULT 0,
  duration_sec integer,
  uploaded_by_user_id bigint REFERENCES users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS damage_report_media_report_idx
  ON damage_report_media(report_id);
