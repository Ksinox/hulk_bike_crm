-- Сторонние ремонты: смешанная оплата (07.09) — как у выкупов, продаж и
-- выплат инвесторам: кроме способа храним доли, чтобы кассу можно было свести.
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "cash_amount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "transfer_amount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Уже оплаченные наряды: доли по старому способу.
UPDATE "service_orders"
   SET "cash_amount" = CASE WHEN "payment_method" = 'cash' THEN COALESCE("paid_amount", 0) ELSE 0 END,
       "transfer_amount" = CASE WHEN "payment_method" = 'transfer' THEN COALESCE("paid_amount", 0) ELSE 0 END
 WHERE "status" = 'paid' AND "cash_amount" = 0 AND "transfer_amount" = 0;
