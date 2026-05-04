-- v0.4.1 — глобальные настройки приложения.
--
-- Простой key-value стор. Сейчас единственное использование — день
-- старта расчётного периода (`billing_period_start_day`). Дальше сюда
-- могут переехать и другие director-настраиваемые параметры (предел
-- штрафа, дефолтные тарифы, etc).

CREATE TABLE IF NOT EXISTS "app_settings" (
    "key" text PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_by_user_id" bigint
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "app_settings"
    ADD CONSTRAINT "app_settings_updated_by_user_id_users_id_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

INSERT INTO "app_settings" ("key", "value")
    VALUES ('billing_period_start_day', '15')
    ON CONFLICT (key) DO NOTHING;
