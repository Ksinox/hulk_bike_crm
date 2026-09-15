-- Пункт 15: порядковый номер места в арендном парке + уникальный ID по раме.
-- Пункт 16: ex_rental_slot — ярлык «был в аренде» с сохранением номера.
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "rental_slot" integer;
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "ex_rental_slot" integer;
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "uid" text;

-- Без дублей: номер уникален среди живых (неархивных) скутеров.
CREATE UNIQUE INDEX IF NOT EXISTS "scooters_rental_slot_unique"
  ON "scooters" ("rental_slot")
  WHERE "rental_slot" IS NOT NULL
    AND "archived_at" IS NULL
    AND "deleted_at" IS NULL;

-- ID = 4 последние цифры номера рамы (если цифры в раме есть).
UPDATE "scooters"
SET "uid" = RIGHT(regexp_replace("frame_number", '\D', '', 'g'), 4)
WHERE "frame_number" IS NOT NULL
  AND regexp_replace("frame_number", '\D', '', 'g') <> ''
  AND "uid" IS NULL;

-- Существующей арендной технике раздаём номера по текущему порядку списка
-- (как на странице «Скутеры» — по имени).
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY "name") AS rn
  FROM "scooters"
  WHERE "base_status" IN ('rental_pool', 'repair', 'dtp')
    AND "archived_at" IS NULL
    AND "deleted_at" IS NULL
)
UPDATE "scooters" s
SET "rental_slot" = r.rn
FROM ranked r
WHERE s.id = r.id
  AND s."rental_slot" IS NULL;

-- Общее количество мест: стартуем с числа выданных номеров (меняется вручную).
INSERT INTO "app_settings" ("key", "value")
SELECT 'rental_slots_total', COALESCE(MAX("rental_slot"), 0)::text
FROM "scooters"
ON CONFLICT ("key") DO NOTHING;
