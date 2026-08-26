-- Правки 2.0, п.7-8: инвесторы партнёрской техники.
-- Техника добавляется ЧЕРЕЗ инвестора (scooters.investor_id), у инвестора
-- свои настройки выплат (п.6): периодичность и день.
CREATE TABLE IF NOT EXISTS "investors" (
  "id" bigserial PRIMARY KEY,
  "name" text NOT NULL,
  "phone" text,
  "note" text,
  -- 'week' | 'month'
  "payout_period" text NOT NULL DEFAULT 'week',
  -- для week: 1 (пн) … 7 (вс); для month: 1…31 (число месяца)
  "payout_day" integer NOT NULL DEFAULT 5,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);

ALTER TABLE "scooters"
  ADD COLUMN IF NOT EXISTS "investor_id" bigint REFERENCES "investors"("id");

CREATE INDEX IF NOT EXISTS "scooters_investor_idx" ON "scooters" ("investor_id");

-- П.6: произведённые выплаты (галочка «выплата произведена» в графике).
-- Сам график вычисляется на лету из периодичности; здесь — факт выплаты.
CREATE TABLE IF NOT EXISTS "investor_payouts" (
  "id" bigserial PRIMARY KEY,
  "investor_id" bigint NOT NULL REFERENCES "investors"("id"),
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  -- сумма выплаты, ₽ (доля инвестора от выручки его техники за период)
  "amount" integer NOT NULL,
  "paid_at" timestamptz NOT NULL DEFAULT now(),
  "paid_by" bigint,
  "note" text,
  CONSTRAINT "investor_payouts_period_uniq"
    UNIQUE ("investor_id", "period_start", "period_end")
);
