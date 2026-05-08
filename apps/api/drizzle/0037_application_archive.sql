-- Группа E — Архив заявок: расширение enum статусов + связь с клиентом.
--
-- Что делает:
--   1. Добавляет 3 новых значения в client_application_status:
--      accepted (заявка оформлена в клиента), rejected (отклонена менеджером),
--      spam (помечена как спам/бот).
--   2. Добавляет поле client_id (FK на clients) — заполняется при convert.
--      ON DELETE SET NULL: если клиента удалили, заявка остаётся в архиве,
--      но без ссылки на клиента (история).
--   3. Финализирующие таймстампы: accepted_at / rejected_at / spam_at.
--   4. Поля для причины отклонения/спама (короткий текст + код-пресет).
--
-- Идемпотентно: ALTER TYPE ADD VALUE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS.

ALTER TYPE client_application_status ADD VALUE IF NOT EXISTS 'accepted';
--> statement-breakpoint
ALTER TYPE client_application_status ADD VALUE IF NOT EXISTS 'rejected';
--> statement-breakpoint
ALTER TYPE client_application_status ADD VALUE IF NOT EXISTS 'spam';
--> statement-breakpoint

ALTER TABLE client_applications
  ADD COLUMN IF NOT EXISTS client_id bigint REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS spam_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejection_reason_code text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS client_applications_client_idx
  ON client_applications (client_id);
