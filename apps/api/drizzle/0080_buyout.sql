-- Блок «Аренда с выкупом» (задание заказчика 01.09).
--
-- Суть сделки: клиент забирает технику сразу, платит первоначальный взнос,
-- дальше гасит остаток равными платежами (неделя или месяц). Стоимость
-- техники увеличивается на наценку за срок — она задаётся справочником и
-- меняется только с ключом директора.
--
-- Три таблицы:
--   buyout_deals    — сама сделка и её условия (снимок на момент подписания);
--   buyout_schedule — график платежей: что и когда клиент должен;
--   buyout_payments — что он фактически заплатил, включая досрочные.
-- График и факт разделены намеренно: только так видно просрочку, частичную
-- оплату и досрочное погашение, не переписывая историю.
CREATE TYPE "buyout_status" AS ENUM (
  'draft',
  'contract',
  'active',
  'closed',
  'defaulted',
  'cancelled'
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "buyout_deals" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "status" "buyout_status" NOT NULL DEFAULT 'draft',
  "client_id" bigint REFERENCES "clients"("id") ON DELETE SET NULL,
  "scooter_id" bigint REFERENCES "scooters"("id") ON DELETE SET NULL,
  "manager_id" bigint REFERENCES "sale_managers"("id") ON DELETE SET NULL,
  "scooter_price" integer NOT NULL DEFAULT 0,
  "term_months" integer NOT NULL DEFAULT 1,
  "markup" integer NOT NULL DEFAULT 0,
  "total" integer NOT NULL DEFAULT 0,
  "down_payment" integer NOT NULL DEFAULT 0,
  "financed" integer NOT NULL DEFAULT 0,
  "period" text NOT NULL DEFAULT 'month',
  "payment_amount" integer NOT NULL DEFAULT 0,
  "payments_count" integer NOT NULL DEFAULT 0,
  "start_date" date,
  "blacklist_checked" boolean NOT NULL DEFAULT false,
  "airtag_confirmed" boolean NOT NULL DEFAULT false,
  "scooter_name" text,
  "model_name" text,
  "vin" text,
  "engine_no" text,
  "frame_number" text,
  "mileage" integer,
  "comment" text,
  "cancel_reason" text,
  "contract_at" timestamp with time zone,
  "signed_at" timestamp with time zone,
  "closed_at" timestamp with time zone,
  "created_by_user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buyout_deals_status_idx" ON "buyout_deals" ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buyout_deals_client_idx" ON "buyout_deals" ("client_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "buyout_schedule" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "deal_id" bigint NOT NULL REFERENCES "buyout_deals"("id") ON DELETE CASCADE,
  "seq" integer NOT NULL,
  "due_date" date NOT NULL,
  "amount" integer NOT NULL,
  "paid_amount" integer NOT NULL DEFAULT 0,
  "paid_at" timestamp with time zone,
  "note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buyout_schedule_deal_idx" ON "buyout_schedule" ("deal_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buyout_schedule_due_idx" ON "buyout_schedule" ("due_date");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "buyout_payments" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "deal_id" bigint NOT NULL REFERENCES "buyout_deals"("id") ON DELETE CASCADE,
  "amount" integer NOT NULL,
  "paid_at" timestamp with time zone NOT NULL DEFAULT now(),
  "method" text NOT NULL DEFAULT 'cash',
  "kind" text NOT NULL DEFAULT 'regular',
  "user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "note" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buyout_payments_deal_idx" ON "buyout_payments" ("deal_id");
