-- Правка заказчика 24.08: партнёрская техника — свойство КОНКРЕТНОГО
-- скутера, а не модели (у одной модели бывают и наши, и партнёрские
-- экземпляры). Флаг переносим с моделей на скутеры.
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "is_partner" boolean NOT NULL DEFAULT false;

-- Переносим текущее состояние: вся техника партнёрских моделей.
UPDATE "scooters" s
SET "is_partner" = true
FROM "scooter_models" m
WHERE s."model_id" = m."id" AND m."is_partner" = true;

-- Общий процент инвестора по умолчанию (используется, когда у единицы
-- техники не выставлен персональный).
INSERT INTO "app_settings" ("key", "value")
VALUES ('partner_share_default', '50')
ON CONFLICT ("key") DO NOTHING;
