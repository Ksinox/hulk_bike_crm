-- Миграция-добивка: добавляет недостающие объекты к v0.2.51-v0.2.53.
-- В drizzle-kit перегенерации потерялись изменения price_groups.scooter_model_id
-- и таблицы damage_reports/damage_report_items. Эта миграция идемпотентно
-- доводит схему до целевого состояния. Все ошибки «уже существует»
-- игнорируются self-healing migrate.ts (коды 42701, 42P07, 42710).

ALTER TABLE "price_groups" ADD COLUMN "scooter_model_id" bigint;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "price_groups" ADD CONSTRAINT "price_groups_scooter_model_id_scooter_models_id_fk" FOREIGN KEY ("scooter_model_id") REFERENCES "public"."scooter_models"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "price_groups_model_idx" ON "price_groups" ("scooter_model_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "damage_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rental_id" bigint NOT NULL,
	"created_by_user_id" bigint,
	"total" integer DEFAULT 0 NOT NULL,
	"deposit_covered" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "damage_reports" ADD CONSTRAINT "damage_reports_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "damage_reports_rental_idx" ON "damage_reports" ("rental_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "damage_report_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" bigint NOT NULL,
	"price_item_id" bigint,
	"name" text NOT NULL,
	"original_price" integer NOT NULL,
	"final_price" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"comment" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "damage_report_items" ADD CONSTRAINT "damage_report_items_report_id_damage_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."damage_reports"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "damage_report_items" ADD CONSTRAINT "damage_report_items_price_item_id_price_items_id_fk" FOREIGN KEY ("price_item_id") REFERENCES "public"."price_items"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "damage_report_items_report_idx" ON "damage_report_items" ("report_id");
