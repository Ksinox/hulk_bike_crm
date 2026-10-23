-- 2.1: в «Должниках», как везде в CRM, — наличными, переводом или смешанно
-- (доли храним). Платёж по ручному делу (без акта/аренды/выкупа) идёт в
-- выручку отдельным видом «Долг по делу».
ALTER TYPE debtor_payment_method ADD VALUE IF NOT EXISTS 'mixed';
--> statement-breakpoint
ALTER TABLE "debtor_payments" ADD COLUMN IF NOT EXISTS "cash_amount" integer;
--> statement-breakpoint
ALTER TABLE "debtor_payments" ADD COLUMN IF NOT EXISTS "transfer_amount" integer;
--> statement-breakpoint
ALTER TYPE payment_type ADD VALUE IF NOT EXISTS 'debtor';
