-- Партия 23.10: строка платежа дела ссылается на реальный платёж (аренды /
-- акта / выкупа). По ссылке история дела сверяется с деньгами: приняли где
-- угодно — строка появляется, отменили — уходит.
ALTER TABLE "debtor_payments" ADD COLUMN IF NOT EXISTS "source_payment_id" bigint;
--> statement-breakpoint
ALTER TABLE "debtor_payments" ADD COLUMN IF NOT EXISTS "source_buyout_payment_id" bigint;
