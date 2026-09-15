-- Пункт 1: ключ директора — очередь подтверждений защищённых действий.
CREATE TABLE IF NOT EXISTS "approval_requests" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "action" text NOT NULL,
  "summary" text NOT NULL,
  "details_json" jsonb,
  "payload_json" jsonb,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_by_user_id" bigint,
  "requested_by_name" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" bigint,
  "resolved_by_name" text,
  "consumed_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approval_requests_status_idx" ON "approval_requests" ("status","created_at");
