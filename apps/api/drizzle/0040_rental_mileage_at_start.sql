-- v0.4.60 — снимок пробега скутера на момент выдачи аренды.
--
-- ПРОБЛЕМА: шаблоны документов используют переменную {scooter.mileage}
-- которая рендерится по live-данным таблицы scooters. Это значит, что
-- если открыть «Акт приёма-передачи (выдача)» уже ПОСЛЕ возврата
-- скутера — увидишь не тот пробег, который был на момент выдачи, а
-- актуальный (который мог измениться после нового использования).
--
-- РЕШЕНИЕ: при создании аренды snapshot-им scooter.mileage в
-- rental.mileage_at_start. Шаблоны документов выдачи рендерим по
-- {rental.mileageAtStart}, а акт возврата — по
-- {rental.mileageAtReturn} (из return_inspections.mileage_at_return).
--
-- Идемпотентно: повторный запуск ничего не делает (DO-блок ловит
-- duplicate_column).

DO $$ BEGIN
  ALTER TABLE "rentals"
    ADD COLUMN "mileage_at_start" integer;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Бэкфил: для существующих аренд берём текущий scooter.mileage. Это
-- неидеально (текущий ≠ был при выдаче), но для уже исторических
-- данных лучше иметь хоть какой-то snapshot, чем NULL и «—» в актах.
-- Только для тех у кого NULL.
UPDATE rentals r
   SET mileage_at_start = s.mileage
  FROM scooters s
 WHERE r.scooter_id = s.id
   AND r.mileage_at_start IS NULL;
