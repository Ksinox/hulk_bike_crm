CREATE TABLE IF NOT EXISTS "parking_sessions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rental_id" bigint NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"days" integer NOT NULL,
	"rate_per_day" integer DEFAULT 250 NOT NULL,
	"free_first_day" boolean DEFAULT true NOT NULL,
	"amount" integer NOT NULL,
	"paid_amount" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_by_user_id" bigint,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "parking_sessions" ADD CONSTRAINT "parking_sessions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parking_sessions_rental_idx" ON "parking_sessions" ("rental_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "parking_sessions_status_idx" ON "parking_sessions" ("status");
