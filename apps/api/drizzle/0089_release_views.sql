-- Показ обновления (15.09, релиз 2.0): кто из сотрудников посмотрел экран
-- «Что изменилось», сколько раз отложил, какие подсказки на месте закрыл и в
-- какие новые разделы уже заходил. Хранится на сервере, чтобы показ не
-- зависел от устройства и директор видел «кто посмотрел».
CREATE TABLE IF NOT EXISTS "release_views" (
  "id" bigserial PRIMARY KEY,
  "user_id" bigint NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "version" text NOT NULL,
  "status" text NOT NULL DEFAULT 'postponed',
  "postponed_count" integer NOT NULL DEFAULT 0,
  "cards_seen" integer NOT NULL DEFAULT 0,
  "hints_done" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "sections_visited" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "release_views_user_version_unique"
  ON "release_views" ("user_id", "version");
