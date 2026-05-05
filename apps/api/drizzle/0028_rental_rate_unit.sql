-- v0.4.25 — единица измерения тарифа аренды.
--   'day'  — rate хранится как ₽/сут (legacy и default)
--   'week' — rate = ₽/нед, days = N × 7, sum = rate × N
-- Применяется только когда оператор выбрал произвольный тариф с
-- режимом «по неделям». В обычных арендах остаётся 'day'.
DO $$ BEGIN
  ALTER TABLE "rentals"
    ADD COLUMN "rate_unit" text NOT NULL DEFAULT 'day';
EXCEPTION WHEN duplicate_column THEN NULL; END $$;
