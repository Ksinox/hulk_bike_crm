-- Блок «Продажи» (задание заказчика 31.08).
--
-- Задача блока: видеть, какая техника стоит в продаже, вести сделку по
-- шагам (клиент → скутер → цена → менеджер → договор → подпись), считать
-- показатели продаж (единицы, выручка, прибыль, маржинальность), план и
-- рейтинги менеджеров и моделей.
--
-- Цены живут В КАРТОЧКЕ ТЕХНИКИ (scooters.purchase_price уже есть, здесь
-- добавляется sale_price и партия закупа) — блок «Продажи» и вкладка
-- «Скутеры» показывают одни и те же поля, а не две разные правды.
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "sale_price" integer;
--> statement-breakpoint
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "purchase_batch" text;
--> statement-breakpoint

-- Менеджеры продаж. Это НЕ учётки CRM: продавать может человек без
-- доступа в систему. Связь с учёткой опциональна (user_id).
CREATE TABLE IF NOT EXISTS "sale_managers" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "phone" text,
  "avatar_color" text NOT NULL DEFAULT 'blue',
  "commission_pct" integer NOT NULL DEFAULT 0,
  "user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "active" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at" timestamp with time zone
);
--> statement-breakpoint

CREATE TYPE "sale_deal_status" AS ENUM ('draft','contract','signed','cancelled');
--> statement-breakpoint

-- Сделка продажи. Снимки (vin/engine_no/цены/процент) пишутся на момент
-- продажи: правка карточки техники через полгода не должна задним числом
-- переписать отчёт по прибыли.
CREATE TABLE IF NOT EXISTS "sale_deals" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "status" "sale_deal_status" NOT NULL DEFAULT 'draft',
  "client_id" bigint REFERENCES "clients"("id") ON DELETE SET NULL,
  "scooter_id" bigint REFERENCES "scooters"("id") ON DELETE SET NULL,
  "manager_id" bigint REFERENCES "sale_managers"("id") ON DELETE SET NULL,
  "price" integer NOT NULL DEFAULT 0,
  "purchase_price" integer,
  "manager_commission_pct" integer,
  "manager_commission" integer,
  "scooter_name" text,
  "model_name" text,
  "vin" text,
  "engine_no" text,
  "frame_number" text,
  "purchase_batch" text,
  "mileage" integer,
  "comment" text,
  "cancel_reason" text,
  "contract_at" timestamp with time zone,
  "signed_at" timestamp with time zone,
  "sold_at" timestamp with time zone,
  "created_by_user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_deals_status_idx" ON "sale_deals" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_deals_sold_at_idx" ON "sale_deals" ("sold_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_deals_manager_idx" ON "sale_deals" ("manager_id");
--> statement-breakpoint

-- Фото/скан подписанного договора и прочие файлы по сделке.
CREATE TABLE IF NOT EXISTS "sale_deal_documents" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "deal_id" bigint NOT NULL REFERENCES "sale_deals"("id") ON DELETE CASCADE,
  "file_key" text NOT NULL,
  "file_name" text NOT NULL,
  "mime_type" text NOT NULL,
  "size" integer NOT NULL,
  "title" text,
  "uploaded_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sale_deal_documents_deal_idx" ON "sale_deal_documents" ("deal_id");
--> statement-breakpoint

-- План продаж на месяц. period — первое число месяца.
CREATE TABLE IF NOT EXISTS "sale_plans" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "period" date NOT NULL,
  "units" integer NOT NULL DEFAULT 0,
  "revenue" integer NOT NULL DEFAULT 0,
  "profit" integer NOT NULL DEFAULT 0,
  "margin_pct" integer NOT NULL DEFAULT 0,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sale_plans_period_uniq" ON "sale_plans" ("period");
