-- Правки 7.0 (19.09), п.2: механики сторонних ремонтов.
-- Механик — не учётка CRM (как менеджер продаж): имя и процент с конечной
-- прибыли ремонта. Процент копируется в наряд, когда механика назначают, —
-- смена процента в справочнике не переписывает прошлые ремонты.
CREATE TABLE IF NOT EXISTS "service_mechanics" (
  "id" bigserial PRIMARY KEY,
  "name" text NOT NULL,
  "percent" integer NOT NULL DEFAULT 0,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "mechanic_id" bigint REFERENCES "service_mechanics"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "mechanic_percent" integer;
