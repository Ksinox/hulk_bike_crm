-- План продаж на произвольный период (заказчик 06.09, п.6: «с 15 по 15»).
--
-- Раньше план жил помесячно: period = первое число месяца. Теперь period —
-- дата начала периода (любой день), period_to — дата конца включительно.
-- Старые строки: period_to = последний день того же месяца.
ALTER TABLE "sale_plans"
  ADD COLUMN IF NOT EXISTS "period_to" date;
--> statement-breakpoint
UPDATE "sale_plans"
  SET "period_to" = (date_trunc('month', "period") + interval '1 month - 1 day')::date
  WHERE "period_to" IS NULL;
