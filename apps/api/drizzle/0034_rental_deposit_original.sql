-- v0.4.49 — снимок исходного залога для аренды.
--
-- Бизнес-логика: при списании из залога (за ущерб/просрочку) текущая
-- сумма rentals.deposit уменьшается. Чтобы UI и оператор видели сколько
-- было ИЗНАЧАЛЬНО (для проверки «нужно ли пополнить до полной суммы»),
-- запоминаем snapshot в deposit_original при создании аренды.
--
-- Также используется как «минимально требуемая сумма залога» в
-- security-topup endpoint: пополнение допустимо когда deposit < deposit_original.
--
-- Идемпотентно: ADD COLUMN IF NOT EXISTS + бэкфил для существующих
-- записей где original = 0 (т.е. ещё не проинициализирован).

DO $$ BEGIN
  ALTER TABLE "rentals"
    ADD COLUMN "deposit_original" integer NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Бэкфил: для всех существующих записей считаем что исходный залог
-- равен текущему (на момент миграции мы не знаем сколько было списано).
UPDATE "rentals" SET "deposit_original" = "deposit"
 WHERE "deposit_original" = 0;
