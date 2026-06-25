-- Этап 2 акта о повреждениях: версионность + защита от подделки.
-- damage_report_revisions — иммутабельный журнал снимков акта (создание = ревизия
-- 1, каждая правка = новая ревизия). Хэш-цепочка prev_hash → content_hash не даёт
-- подделать историю незаметно. damage_reports получает номер текущей ревизии,
-- head-хэш и автора последней правки. Колонки/таблица — идемпотентно.
ALTER TABLE "damage_reports" ADD COLUMN IF NOT EXISTS "revision_no" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "damage_reports" ADD COLUMN IF NOT EXISTS "content_hash" text;
--> statement-breakpoint
ALTER TABLE "damage_reports" ADD COLUMN IF NOT EXISTS "updated_by_user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "damage_report_revisions" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "report_id" bigint NOT NULL REFERENCES "damage_reports"("id") ON DELETE CASCADE,
  "revision_no" integer NOT NULL,
  "total" integer NOT NULL,
  "deposit_covered" integer NOT NULL,
  "note" text,
  "items_json" jsonb NOT NULL,
  "client_agreement" text NOT NULL,
  "edited_by_user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "edited_by_user_name" text,
  "prev_hash" text,
  "content_hash" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "damage_report_revisions_report_idx" ON "damage_report_revisions" ("report_id");
