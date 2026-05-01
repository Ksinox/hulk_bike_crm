-- v0.2.94 — модуль «Ремонты»: журнал ремонтов скутеров с чек-листом и фото.
--
-- repair_jobs — один ремонт = один цикл «скутер ушёл в repair → готов к аренде».
--   Создаётся автоматически при создании damage_report с sendScooterToRepair=true,
--   ИЛИ ручным переводом скутера в статус 'repair' (не реализовано в этой
--   миграции, но возможно позже — endpoint открытый).
--
-- repair_progress — пункт чек-листа ремонта. Снимок имени из damage_report_items
--   (на случай если позицию из акта удалят), флаг done и заметка оператора.
--
-- repair_progress_photos — фото повреждения / что починено. Многие к одному.

CREATE TABLE IF NOT EXISTS "repair_jobs" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "scooter_id" bigint NOT NULL,
    "rental_id" bigint,
    "damage_report_id" bigint,
    "status" text DEFAULT 'in_progress' NOT NULL,
    "started_at" timestamp with time zone DEFAULT now() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_by_user_id" bigint,
    "completed_by_user_id" bigint,
    "note" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_scooter_id_scooters_id_fk" FOREIGN KEY ("scooter_id") REFERENCES "public"."scooters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_damage_report_id_damage_reports_id_fk" FOREIGN KEY ("damage_report_id") REFERENCES "public"."damage_reports"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_jobs" ADD CONSTRAINT "repair_jobs_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "repair_jobs_scooter_idx" ON "repair_jobs" ("scooter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "repair_jobs_status_idx" ON "repair_jobs" ("status");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "repair_progress" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "repair_job_id" bigint NOT NULL,
    "damage_report_item_id" bigint,
    "title" text NOT NULL,
    "qty" integer DEFAULT 1 NOT NULL,
    "price_snapshot" integer DEFAULT 0 NOT NULL,
    "done" boolean DEFAULT false NOT NULL,
    "notes" text,
    "completed_at" timestamp with time zone,
    "completed_by_user_id" bigint,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_progress" ADD CONSTRAINT "repair_progress_repair_job_id_repair_jobs_id_fk" FOREIGN KEY ("repair_job_id") REFERENCES "public"."repair_jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_progress" ADD CONSTRAINT "repair_progress_damage_report_item_id_damage_report_items_id_fk" FOREIGN KEY ("damage_report_item_id") REFERENCES "public"."damage_report_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_progress" ADD CONSTRAINT "repair_progress_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "repair_progress_job_idx" ON "repair_progress" ("repair_job_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "repair_progress_photos" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "progress_id" bigint NOT NULL,
    "file_key" text NOT NULL,
    "file_name" text NOT NULL,
    "mime_type" text NOT NULL,
    "size" integer DEFAULT 0 NOT NULL,
    "uploaded_by_user_id" bigint,
    "uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_progress_photos" ADD CONSTRAINT "repair_progress_photos_progress_id_repair_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."repair_progress"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "repair_progress_photos" ADD CONSTRAINT "repair_progress_photos_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "repair_progress_photos_progress_idx" ON "repair_progress_photos" ("progress_id");
