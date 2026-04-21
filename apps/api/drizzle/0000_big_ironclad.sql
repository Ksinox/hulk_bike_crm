CREATE TYPE "public"."client_doc_kind" AS ENUM('photo', 'passport', 'license', 'extra');--> statement-breakpoint
CREATE TYPE "public"."client_source" AS ENUM('avito', 'repeat', 'ref', 'maps', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_confirmer_role" AS ENUM('boss', 'manager');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'card', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."payment_type" AS ENUM('rent', 'deposit', 'fine', 'damage', 'refund');--> statement-breakpoint
CREATE TYPE "public"."rental_source_channel" AS ENUM('avito', 'repeat', 'ref', 'passing', 'other');--> statement-breakpoint
CREATE TYPE "public"."rental_status" AS ENUM('new_request', 'meeting', 'active', 'overdue', 'returning', 'completed', 'completed_damage', 'cancelled', 'police', 'court');--> statement-breakpoint
CREATE TYPE "public"."scooter_base_status" AS ENUM('ready', 'repair', 'buyout', 'for_sale', 'sold');--> statement-breakpoint
CREATE TYPE "public"."scooter_doc_kind" AS ENUM('pts', 'sts', 'osago', 'purchase');--> statement-breakpoint
CREATE TYPE "public"."scooter_model" AS ENUM('jog', 'gear', 'honda', 'tank');--> statement-breakpoint
CREATE TYPE "public"."tariff_period" AS ENUM('short', 'week', 'month');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('director', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "client_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"kind" "client_doc_kind" NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"title" text,
	"comment" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "clients" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"extra_phone" text,
	"rating" integer DEFAULT 80 NOT NULL,
	"source" "client_source" DEFAULT 'other' NOT NULL,
	"added_on" date DEFAULT now() NOT NULL,
	"comment" text,
	"blacklisted" boolean DEFAULT false NOT NULL,
	"blacklist_reason" text,
	"blacklist_at" date,
	"blacklist_by" text,
	"unreachable" boolean DEFAULT false NOT NULL,
	"birth_date" date,
	"passport_series" text,
	"passport_number" text,
	"passport_issued_on" date,
	"passport_issuer" text,
	"passport_division_code" text,
	"passport_registration" text,
	"license_number" text,
	"license_categories" text,
	"license_issued_on" date,
	"license_expires_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rental_id" bigint NOT NULL,
	"type" "payment_type" NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"paid_at" timestamp with time zone,
	"scheduled_on" date,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rental_incidents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rental_id" bigint NOT NULL,
	"scooter_id" bigint,
	"type" text NOT NULL,
	"occurred_on" date NOT NULL,
	"damage" integer DEFAULT 0 NOT NULL,
	"paid_toward_damage" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rental_tasks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"rental_id" bigint,
	"client_id" bigint,
	"title" text NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rentals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"client_id" bigint NOT NULL,
	"scooter_id" bigint,
	"parent_rental_id" bigint,
	"status" "rental_status" DEFAULT 'new_request' NOT NULL,
	"source_channel" "rental_source_channel",
	"tariff_period" "tariff_period" NOT NULL,
	"rate" integer NOT NULL,
	"deposit" integer DEFAULT 2000 NOT NULL,
	"deposit_returned" boolean,
	"start_at" timestamp with time zone NOT NULL,
	"end_planned_at" timestamp with time zone NOT NULL,
	"end_actual_at" timestamp with time zone,
	"days" integer NOT NULL,
	"sum" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"contract_uploaded" boolean DEFAULT false NOT NULL,
	"payment_confirmed_by" "payment_confirmer_role",
	"payment_confirmed_by_name" text,
	"payment_confirmed_at" timestamp with time zone,
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"damage_amount" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "return_inspections" (
	"rental_id" bigint NOT NULL,
	"inspected_on" date NOT NULL,
	"condition_ok" boolean NOT NULL,
	"equipment_ok" boolean NOT NULL,
	"deposit_returned" boolean NOT NULL,
	"mileage_at_return" integer,
	"damage_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "return_inspections_rental_id_pk" PRIMARY KEY("rental_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scooter_documents" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scooter_id" bigint NOT NULL,
	"kind" "scooter_doc_kind" NOT NULL,
	"file_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"osago_valid_until" date,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scooters" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model" "scooter_model" NOT NULL,
	"vin" text,
	"engine_no" text,
	"mileage" integer DEFAULT 0 NOT NULL,
	"base_status" "scooter_base_status" DEFAULT 'ready' NOT NULL,
	"purchase_date" date,
	"purchase_price" integer,
	"last_oil_change_mileage" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scooters_name_unique" UNIQUE("name"),
	CONSTRAINT "scooters_vin_unique" UNIQUE("vin")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"login" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'admin' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_login_unique" UNIQUE("login")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "client_documents" ADD CONSTRAINT "client_documents_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rental_incidents" ADD CONSTRAINT "rental_incidents_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rental_incidents" ADD CONSTRAINT "rental_incidents_scooter_id_scooters_id_fk" FOREIGN KEY ("scooter_id") REFERENCES "public"."scooters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rental_tasks" ADD CONSTRAINT "rental_tasks_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rental_tasks" ADD CONSTRAINT "rental_tasks_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals" ADD CONSTRAINT "rentals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rentals" ADD CONSTRAINT "rentals_scooter_id_scooters_id_fk" FOREIGN KEY ("scooter_id") REFERENCES "public"."scooters"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "return_inspections" ADD CONSTRAINT "return_inspections_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scooter_documents" ADD CONSTRAINT "scooter_documents_scooter_id_scooters_id_fk" FOREIGN KEY ("scooter_id") REFERENCES "public"."scooters"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_documents_client_idx" ON "client_documents" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_phone_idx" ON "clients" USING btree ("phone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_name_idx" ON "clients" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_blacklisted_idx" ON "clients" USING btree ("blacklisted");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "clients_unreachable_idx" ON "clients" USING btree ("unreachable");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_rental_idx" ON "payments" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_paid_idx" ON "payments" USING btree ("paid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_incidents_rental_idx" ON "rental_incidents" USING btree ("rental_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_incidents_scooter_idx" ON "rental_incidents" USING btree ("scooter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_tasks_due_idx" ON "rental_tasks" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rental_tasks_done_idx" ON "rental_tasks" USING btree ("done");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_client_idx" ON "rentals" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_scooter_idx" ON "rentals" USING btree ("scooter_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_status_idx" ON "rentals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_parent_idx" ON "rentals" USING btree ("parent_rental_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rentals_end_planned_idx" ON "rentals" USING btree ("end_planned_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooter_documents_scooter_idx" ON "scooter_documents" USING btree ("scooter_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scooter_documents_scooter_kind_uq" ON "scooter_documents" USING btree ("scooter_id","kind");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooters_model_idx" ON "scooters" USING btree ("model");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooters_base_status_idx" ON "scooters" USING btree ("base_status");