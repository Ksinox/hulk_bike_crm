-- Part B: eager upload медиа ущерба ДО создания акта.
-- report_id становится nullable (медиа-«сирота» до привязки), добавляем
-- draft_token — по нему фронт грузит медиа новой формы и привязывает их к
-- акту при сохранении. Крон чистит сирот старше суток.
ALTER TABLE "damage_report_media" ALTER COLUMN "report_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "damage_report_media" ADD COLUMN IF NOT EXISTS "draft_token" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "damage_report_media_draft_token_idx" ON "damage_report_media" ("draft_token");
