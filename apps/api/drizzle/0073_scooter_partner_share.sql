-- Пункт 11: процент инвестора для партнёрской техники (на единицу техники).
-- null → дефолт 50 %.
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "partner_share" integer;
