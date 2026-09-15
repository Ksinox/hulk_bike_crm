-- Разовое исправление ПРОДА (15.09.2026), не миграция.
--
-- После 2.0 техника вне аренды (продажа, проданные, разборка) показывалась
-- без номера: «Gear #80» выглядел просто «Gear». Решение заказчика: вернуть
-- номер из названия как БЫВШИЙ — пометкой «Бывший №80» отдельно от названия
-- (интерфейс выкачен до этого скрипта). Действующие номера не трогаем.
BEGIN;

UPDATE scooters
   SET ex_rental_slot = substring(name from '#\s*0*(\d+)')::int
 WHERE deleted_at IS NULL
   AND rental_slot IS NULL
   AND ex_rental_slot IS NULL
   AND name ~ '#\s*\d+';

DO $$
DECLARE v_missing int; v_bad int; v_rental_touched int;
BEGIN
  SELECT count(*) INTO v_missing FROM scooters
   WHERE deleted_at IS NULL AND rental_slot IS NULL AND ex_rental_slot IS NULL AND name ~ '#\s*\d+';
  SELECT count(*) INTO v_bad FROM scooters
   WHERE deleted_at IS NULL AND rental_slot IS NULL AND ex_rental_slot IS NOT NULL
     AND ex_rental_slot <> substring(name from '#\s*0*(\d+)')::int;
  SELECT count(*) INTO v_rental_touched FROM scooters
   WHERE rental_slot IS NOT NULL AND ex_rental_slot IS NOT NULL;
  IF v_missing <> 0 OR v_bad <> 0 OR v_rental_touched <> 0 THEN
    RAISE EXCEPTION 'проверка не прошла: без номера %, не из названия %, задеты арендные %',
      v_missing, v_bad, v_rental_touched;
  END IF;
END $$;

INSERT INTO activity_log (user_name, entity, entity_id, action, summary)
VALUES ('система', 'scooter', NULL, 'updated',
  'Технике вне аренды (продажа, проданные, разборка) возвращён бывший номер из названия — показывается пометкой «Бывший №…»');

COMMIT;

SELECT base_status, count(*) AS with_ex, min(ex_rental_slot), max(ex_rental_slot)
  FROM scooters WHERE deleted_at IS NULL AND ex_rental_slot IS NOT NULL GROUP BY 1 ORDER BY 1;
