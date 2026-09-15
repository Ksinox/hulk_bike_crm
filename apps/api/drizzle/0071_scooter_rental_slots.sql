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

-- Существующей арендной технике номер берём из названия («Jog #03» → 3).
-- 15.09: раньше номера раздавались по алфавиту названий, и в проде «Gear #02»
-- получил ①, «Jog #01» — ⑭ (исправлено отдельной миграцией). Раздаём только
-- один раз, пока номеров нет ни у кого: миграции прогоняются на каждом
-- старте, повторная раздача перетёрла бы номера, выставленные вручную.
-- При двух скутерах с одним номером в названии номер получает первый
-- заведённый, второму номер назначают вручную.
WITH named AS (
  SELECT id,
         substring("name" from '#\s*0*(\d+)')::int AS n,
         ROW_NUMBER() OVER (
           PARTITION BY substring("name" from '#\s*0*(\d+)') ORDER BY id
         ) AS dup
  FROM "scooters"
  WHERE "base_status" IN ('rental_pool', 'repair', 'dtp')
    AND "archived_at" IS NULL
    AND "deleted_at" IS NULL
)
UPDATE "scooters" s
SET "rental_slot" = nm.n
FROM named nm
WHERE s.id = nm.id
  AND nm.n IS NOT NULL
  AND nm.dup = 1
  AND s."rental_slot" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "scooters" x WHERE x."rental_slot" IS NOT NULL);

-- Общее количество мест: стартуем с числа выданных номеров (меняется вручную).
INSERT INTO "app_settings" ("key", "value")
SELECT 'rental_slots_total', COALESCE(MAX("rental_slot"), 0)::text
FROM "scooters"
ON CONFLICT ("key") DO NOTHING;
