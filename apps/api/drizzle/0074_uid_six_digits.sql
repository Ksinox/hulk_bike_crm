-- Правка заказчика 24.08: уникальный ID техники = 6 последних цифр VIN
-- (было 4 цифры рамы — при 4 знаках реален риск совпадения).
UPDATE "scooters"
SET "uid" = RIGHT(
  regexp_replace(COALESCE(NULLIF("vin", ''), "frame_number"), '\D', '', 'g'), 6
)
WHERE COALESCE(NULLIF("vin", ''), "frame_number") IS NOT NULL
  AND regexp_replace(COALESCE(NULLIF("vin", ''), "frame_number"), '\D', '', 'g') <> '';
