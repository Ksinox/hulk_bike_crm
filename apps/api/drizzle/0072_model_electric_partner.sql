-- Пункт 14: статусы «электро» и «партнёрская» у моделей каталога
-- (задел под направления электротранспорта и партнёрской техники, п. 11-12).
ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "is_electric" boolean NOT NULL DEFAULT false;
ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "is_partner" boolean NOT NULL DEFAULT false;
