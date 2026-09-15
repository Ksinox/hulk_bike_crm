-- Разовое исправление ПРОДА (15.09.2026), не миграция: id скутеров — боевые.
--
-- Миграция 0071 при выходе 2.0 раздала арендные номера по алфавиту
-- названий: «Gear #02» получил ①, «Jog #01» — ⑭, совпадений с названиями
-- ноль. Возвращаем каждому номер из названия («Jog #03» → 3).
--
-- Дубли в названиях — решение заказчика 15.09 «номер первому, вторым
-- 68–70»:
--   №1  Jog #01 (id 1)  → 1,  aima #01 (id 63) → 68
--   №2  Gear #02 (id 4) → 2,  Jog #02 (id 136) → 69
--   №39 Gear #39 (id 3) → 39, Jog #39 (id 62, до 14:19 — «Jog #35.1») → 70
-- Всего мест остаётся 70.
--
-- Бывшие номера техники вне аренды здесь НЕ трогаем: заказчик хочет видеть
-- их отдельной пометкой, а не кружком у названия — сначала интерфейс.
BEGIN;

-- 1. Снимаем номера, розданные по алфавиту.
UPDATE scooters SET rental_slot = NULL WHERE rental_slot IS NOT NULL;

-- 2. Номер из названия — всем, кроме вторых в паре.
UPDATE scooters
   SET rental_slot = substring(name from '#\s*0*(\d+)')::int
 WHERE base_status IN ('rental_pool', 'repair', 'dtp')
   AND archived_at IS NULL
   AND deleted_at IS NULL
   AND name ~ '#\s*\d+'
   AND id NOT IN (63, 136, 62);

-- 3. Вторые в паре — свободные номера.
UPDATE scooters SET rental_slot = 68 WHERE id = 63  AND name = 'aima #01';
UPDATE scooters SET rental_slot = 69 WHERE id = 136 AND name = 'Jog #02';
UPDATE scooters SET rental_slot = 70 WHERE id = 62  AND name = 'Jog #39';

-- 4. Проверки: иначе откат всей транзакции.
DO $$
DECLARE
  v_total int; v_distinct int; v_missing int; v_bad int;
BEGIN
  SELECT count(*), count(DISTINCT rental_slot) INTO v_total, v_distinct
    FROM scooters WHERE rental_slot IS NOT NULL;
  SELECT count(*) INTO v_missing FROM scooters
   WHERE base_status IN ('rental_pool', 'repair', 'dtp')
     AND archived_at IS NULL AND deleted_at IS NULL AND rental_slot IS NULL;
  SELECT count(*) INTO v_bad FROM scooters
   WHERE rental_slot IS NOT NULL AND id NOT IN (63, 136, 62)
     AND rental_slot <> substring(name from '#\s*0*(\d+)')::int;
  IF v_total <> 70 OR v_distinct <> 70 OR v_missing <> 0 OR v_bad <> 0 THEN
    RAISE EXCEPTION 'проверка не прошла: всего %, разных %, без номера %, не из названия %',
      v_total, v_distinct, v_missing, v_bad;
  END IF;
END $$;

-- 5. Журнал (правило подробного журнала).
INSERT INTO activity_log (user_name, entity, entity_id, action, summary)
VALUES ('система', 'scooter', NULL, 'updated',
  'Арендные номера исправлены: каждому скутеру возвращён номер из названия (после 2.0 номера были розданы по алфавиту). Дубли: aima #01 → №68, Jog #02 → №69, Jog #39 → №70');

COMMIT;

SELECT rental_slot, name, base_status FROM scooters
 WHERE rental_slot IN (1, 2, 12, 14, 35, 38, 39, 67, 68, 69, 70) ORDER BY rental_slot;
