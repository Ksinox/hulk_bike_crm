ALTER TYPE "public"."scooter_base_status" ADD VALUE 'disassembly';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "activity_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" bigint,
	"user_name" text DEFAULT 'система' NOT NULL,
	"user_role" text,
	"entity" text NOT NULL,
	"entity_id" bigint,
	"action" text NOT NULL,
	"summary" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "equipment_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar_key" text,
	"avatar_file_name" text,
	"quick_pick" boolean DEFAULT true NOT NULL,
	"price" integer DEFAULT 0 NOT NULL,
	"is_free" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipment_items_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scooter_maintenance" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scooter_id" bigint NOT NULL,
	"kind" text DEFAULT 'other' NOT NULL,
	"performed_on" date NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"mileage" integer,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scooter_models" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"avatar_key" text,
	"avatar_file_name" text,
	"quick_pick" boolean DEFAULT false NOT NULL,
	"short_rate" integer DEFAULT 1300 NOT NULL,
	"week_rate" integer DEFAULT 500 NOT NULL,
	"month_rate" integer DEFAULT 400 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scooter_models_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "deposit_item" text;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "equipment_json" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "confirm_contract_signed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "confirm_rent_paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rentals" ADD COLUMN "confirm_deposit_received" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scooters" ADD COLUMN "model_id" bigint;--> statement-breakpoint
ALTER TABLE "scooters" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scooters" ADD COLUMN "archived_by" text;--> statement-breakpoint
ALTER TABLE "scooters" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "scooters" ADD COLUMN "deleted_by" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scooter_maintenance" ADD CONSTRAINT "scooter_maintenance_scooter_id_scooters_id_fk" FOREIGN KEY ("scooter_id") REFERENCES "public"."scooters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_created_idx" ON "activity_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_entity_idx" ON "activity_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "activity_log_user_idx" ON "activity_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooter_maintenance_scooter_idx" ON "scooter_maintenance" USING btree ("scooter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooter_maintenance_date_idx" ON "scooter_maintenance" USING btree ("performed_on");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooter_models_quick_pick_idx" ON "scooter_models" USING btree ("quick_pick");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooters_model_id_idx" ON "scooters" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooters_archived_idx" ON "scooters" USING btree ("archived_at");