-- Публичные заявки клиентов (как Google Forms).
-- Постоянная ссылка /apply, любой может заполнить — каждый заход = новая заявка.
-- Поля зеркалят clients (только клиентские, без менеджерских source/blacklist/license-данных).
-- Менеджер при «Оформить» создаёт клиента и переносит файлы из applications в client_documents.

DO $$ BEGIN
 CREATE TYPE "client_application_status" AS ENUM ('draft', 'new', 'viewed', 'cancelled');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 CREATE TYPE "client_application_file_kind" AS ENUM ('passport_main', 'passport_reg', 'license', 'selfie');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "client_applications" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"status" "client_application_status" DEFAULT 'draft' NOT NULL,
	"name" text,
	"phone" text,
	"extra_phone" text,
	"is_foreigner" boolean DEFAULT false NOT NULL,
	"passport_raw" text,
	"birth_date" date,
	"passport_series" text,
	"passport_number" text,
	"passport_issued_on" date,
	"passport_issuer" text,
	"passport_division_code" text,
	"passport_registration" text,
	"live_address" text,
	"same_address" boolean DEFAULT true NOT NULL,
	"upload_token" text,
	"upload_token_expires_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"submitted_at" timestamp with time zone,
	"user_agent" text,
	"ip_address" text,
	"honeypot" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_applications_status_idx" ON "client_applications" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_applications_created_idx" ON "client_applications" ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_applications_token_idx" ON "client_applications" ("upload_token");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "client_application_files" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"application_id" bigint NOT NULL,
	"kind" "client_application_file_kind" NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "client_application_files" ADD CONSTRAINT "client_application_files_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."client_applications"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "client_application_files_application_idx" ON "client_application_files" ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "client_application_files_app_kind_uq" ON "client_application_files" ("application_id", "kind");
