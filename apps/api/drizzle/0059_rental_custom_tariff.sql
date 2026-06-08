-- v0.9.8: флаг «свой тариф» на аренде (создана по произвольной ставке).
-- Идемпотентно — применяется кастомным аппликатором миграций.
ALTER TABLE rentals ADD COLUMN IF NOT EXISTS custom_tariff boolean NOT NULL DEFAULT false;
