-- Партия 23.10: ущерб — отдельным делом в «Должниках», долг аренды — отдельно.
--
-- • В акте о повреждениях — срок оплаты (по умолчанию +7 дней, менеджер
--   меняет; п. 2.3.15 договора). До этой даты дело «ждёт оплату», в срок
--   CRM спрашивает «Пришла ли оплата?».
-- • В деле — дата «ждём оплату до» и тумблер пени по п. 5.7 договора
--   (1 000 ₽ за каждый день неоплаты ущерба). По умолчанию ВЫКЛ — решает
--   менеджер.
-- • Платёж модуля «Должники» по делу ущерба гасит и сам акт (платёж
--   ущерба в аренде) — одна точка правды. Часть сверх акта = пеня,
--   её отмечаем в penalty_amount.
ALTER TABLE "damage_reports" ADD COLUMN IF NOT EXISTS "pay_due_date" date;
--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN IF NOT EXISTS "payment_due_date" date;
--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN IF NOT EXISTS "penalty_enabled" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN IF NOT EXISTS "penalty_from" date;
--> statement-breakpoint
ALTER TABLE "debtors" ADD COLUMN IF NOT EXISTS "penalty_until" date;
--> statement-breakpoint
ALTER TABLE "debtor_payments" ADD COLUMN IF NOT EXISTS "penalty_amount" integer NOT NULL DEFAULT 0;
