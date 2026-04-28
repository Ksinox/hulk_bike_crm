-- Пользовательские шаблоны документов (договор, акты, выписка).
-- kind='override' заменяет системный шаблон при рендере;
-- kind='custom' — самостоятельный пользовательский шаблон.

CREATE TABLE IF NOT EXISTS "document_templates" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template_key" text NOT NULL,
	"kind" text DEFAULT 'override' NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"created_by_user_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_templates_key_idx" ON "document_templates" ("template_key");
