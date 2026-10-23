-- Партия 23.10: сделку выкупа можно передать в «Должники» кнопкой.
-- Долг по такому делу — просроченные платежи графика выкупа (у сорванной
-- сделки — весь остаток); платёж в «Должниках» гасит строки графика.
ALTER TYPE debtor_type ADD VALUE IF NOT EXISTS 'buyout_overdue';
--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN IF NOT EXISTS "buyout_deal_id" bigint;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debtors_buyout_deal_idx" ON "debtors" ("buyout_deal_id");
