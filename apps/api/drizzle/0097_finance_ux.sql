-- Финансы, правки заказчика 20.09 (вторая итерация).
--
-- ФОТ: «процент с продаж» должен быть процентом, а не просто суммой —
-- иначе непонятно, откуда взялась премия и какой процент у человека.
-- Поэтому процент живёт в карточке человека, а в периоде хранится база
-- (продажи, с которых считаем) и сама премия. Премия пересчитывается при
-- изменении базы или процента, но её можно вписать и руками — бывает, что
-- договорились иначе.
ALTER TABLE "finance_people" ADD COLUMN IF NOT EXISTS "sales_pct" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "finance_payroll" ADD COLUMN IF NOT EXISTS "sales_base" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Процент, действовавший в этом периоде: поменяли процент человеку — прошлые
-- месяцы считаются по-старому.
ALTER TABLE "finance_payroll" ADD COLUMN IF NOT EXISTS "sales_pct" integer NOT NULL DEFAULT 0;
