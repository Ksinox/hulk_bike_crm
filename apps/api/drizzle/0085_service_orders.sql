-- Сторонние ремонты (06.09): заказ-наряды на чужую технику + прайс работ.
ALTER TABLE "price_groups" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'damage';

CREATE TABLE IF NOT EXISTS "service_orders" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "number" integer NOT NULL,
  "status" text NOT NULL DEFAULT 'in_work',
  "client_id" bigint REFERENCES "clients"("id") ON DELETE set null,
  "customer_name" text NOT NULL,
  "customer_phone" text,
  "vehicle" text NOT NULL,
  "vehicle_number" text,
  "complaint" text,
  "note" text,
  "accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "payment_method" text,
  "paid_amount" integer,
  "master_user_id" bigint REFERENCES "users"("id") ON DELETE set null,
  "created_by_user_id" bigint REFERENCES "users"("id") ON DELETE set null,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "service_orders_number_idx" ON "service_orders" ("number");
CREATE INDEX IF NOT EXISTS "service_orders_status_idx" ON "service_orders" ("status");
CREATE INDEX IF NOT EXISTS "service_orders_accepted_idx" ON "service_orders" ("accepted_at");

CREATE TABLE IF NOT EXISTS "service_order_items" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "order_id" bigint NOT NULL REFERENCES "service_orders"("id") ON DELETE cascade,
  "kind" text NOT NULL,
  "price_item_id" bigint REFERENCES "price_items"("id") ON DELETE set null,
  "name" text NOT NULL,
  "qty" integer NOT NULL DEFAULT 1,
  "price" integer NOT NULL DEFAULT 0,
  "cost" integer NOT NULL DEFAULT 0,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "service_order_items_order_idx" ON "service_order_items" ("order_id");
