-- Смешанная оплата: часть наличными, часть переводом (01.09).
--
-- Заказчик: по всему проекту деньги приходят либо наличными, либо
-- переводом, либо смешанно — и разбивка должна попадать в аналитику.
-- Поэтому храним не только способ, но и сами доли: без них «смешанный»
-- превращается в чёрный ящик, который невозможно свести с кассой.
ALTER TABLE "buyout_payments"
  ADD COLUMN IF NOT EXISTS "cash_amount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "buyout_payments"
  ADD COLUMN IF NOT EXISTS "transfer_amount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Продажа: способ расчёта фиксируется в самой сделке — отдельного приёма
-- платежа там нет, деньги приходят разом при подписании.
ALTER TABLE "sale_deals"
  ADD COLUMN IF NOT EXISTS "pay_method" text NOT NULL DEFAULT 'cash';
--> statement-breakpoint
ALTER TABLE "sale_deals"
  ADD COLUMN IF NOT EXISTS "pay_cash" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "sale_deals"
  ADD COLUMN IF NOT EXISTS "pay_transfer" integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- Выплата инвестору — тем же набором способов.
ALTER TABLE "investor_payouts"
  ADD COLUMN IF NOT EXISTS "method" text NOT NULL DEFAULT 'cash';
--> statement-breakpoint
ALTER TABLE "investor_payouts"
  ADD COLUMN IF NOT EXISTS "cash_amount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "investor_payouts"
  ADD COLUMN IF NOT EXISTS "transfer_amount" integer NOT NULL DEFAULT 0;
