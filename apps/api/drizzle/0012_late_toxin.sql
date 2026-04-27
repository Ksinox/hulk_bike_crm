CREATE TABLE IF NOT EXISTS "price_groups" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"has_two_prices" boolean DEFAULT false NOT NULL,
	"price_a_label" text DEFAULT 'Цена' NOT NULL,
	"price_b_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"group_id" bigint NOT NULL,
	"name" text NOT NULL,
	"price_a" integer,
	"price_b" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "price_items" ADD CONSTRAINT "price_items_group_id_price_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."price_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "price_items_group_idx" ON "price_items" USING btree ("group_id");