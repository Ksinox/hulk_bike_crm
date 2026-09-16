-- 16.09.2026 (заказчик): рама пишется только латиницей. У трёх Gear в проде
-- в раме русская «А» (UА06J-…) — поиск латиницей их не находил.
-- Разово: русские буквы-двойники → латинские в vin и frame_number. Если такая
-- рама латиницей уже есть — уникальность упадёт и ничего не изменится.
-- Запись в журнал — на каждую технику, «было → стало».
\set ON_ERROR_STOP 1
BEGIN;

CREATE TEMP TABLE vin_fix ON COMMIT DROP AS
SELECT id,
       name,
       rental_slot,
       vin AS vin_before,
       frame_number AS frame_before,
       translate(vin, 'АВЕКМНОРСТУХавекмнорстух', 'ABEKMHOPCTYXabekmhopctyx') AS vin_after,
       translate(frame_number, 'АВЕКМНОРСТУХавекмнорстух', 'ABEKMHOPCTYXabekmhopctyx') AS frame_after
FROM scooters
WHERE vin ~ '[А-Яа-яЁё]' OR frame_number ~ '[А-Яа-яЁё]';

-- Если после замены остались русские буквы (не двойники) — стоп.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM vin_fix WHERE vin_after ~ '[А-Яа-яЁё]' OR frame_after ~ '[А-Яа-яЁё]') THEN
    RAISE EXCEPTION 'В раме есть русские буквы без латинского двойника — поправить вручную';
  END IF;
END $$;

SELECT id, name, vin_before, vin_after FROM vin_fix ORDER BY id;

UPDATE scooters s
SET vin = f.vin_after,
    frame_number = f.frame_after,
    updated_at = now()
FROM vin_fix f
WHERE s.id = f.id;

INSERT INTO activity_log (user_id, user_name, user_role, entity, entity_id, action, summary, meta)
SELECT NULL,
       'система',
       NULL,
       'scooter',
       f.id,
       'updated',
       'Рама «' || regexp_replace(f.name, '\s*#\s*\d+\s*$', '')
         || COALESCE(' №' || f.rental_slot, '') || '»: русская буква заменена на латинскую · '
         || f.vin_before || ' → ' || f.vin_after
         || ' · рама пишется только латиницей',
       jsonb_build_object(
         'diff', jsonb_build_object(
           'vin', jsonb_build_object('label', 'рама (VIN)', 'from', f.vin_before, 'to', f.vin_after, 'kind', 'text')
         ),
         'reason', 'vin_latin_fix_2026_09_16'
       )
FROM vin_fix f;

SELECT id, name, vin, frame_number FROM scooters WHERE id IN (SELECT id FROM vin_fix) ORDER BY id;
COMMIT;
