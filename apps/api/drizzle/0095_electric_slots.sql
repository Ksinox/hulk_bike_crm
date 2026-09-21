-- Правки 7.0 (19.09), п.5: у электро своя нумерация.
-- «Если в парке 50 скутеров и добавляем электровелосипед — он не 51-й, а
-- первый в своём ряду». Номер теперь уникален внутри ряда: бензин и электро
-- могут одновременно иметь №5. Кружок номера: электро — зелёный, бензин —
-- чёрный.
ALTER TABLE "scooters" ADD COLUMN IF NOT EXISTS "slot_pool" text NOT NULL DEFAULT 'petrol';
--> statement-breakpoint
-- Старый индекс «номер уникален по всему парку» мешает двум рядам.
DROP INDEX IF EXISTS "scooters_rental_slot_unique";
--> statement-breakpoint
-- Перенос — ОДИН раз (миграции гоняются на каждом старте). Электро, у
-- которых есть номер, получают №1..N своего ряда в порядке прежних номеров;
-- прежний номер остаётся «бывшим» — по нему технику находит поиск.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'electric_slots_split') THEN
    UPDATE scooters s SET slot_pool = 'electric'
      FROM scooter_models m
      WHERE m.id = s.model_id AND m.is_electric = true;
    WITH e AS (
      SELECT s.id, s.rental_slot,
             row_number() OVER (ORDER BY s.rental_slot, s.id) AS n
      FROM scooters s
      WHERE s.slot_pool = 'electric' AND s.rental_slot IS NOT NULL
        AND s.archived_at IS NULL AND s.deleted_at IS NULL
    )
    UPDATE scooters s
      SET ex_rental_slot = e.rental_slot, rental_slot = e.n
      FROM e WHERE s.id = e.id;
    INSERT INTO app_settings (key, value)
      SELECT 'rental_slots_total_electric',
             (SELECT count(*) FROM scooters
               WHERE slot_pool = 'electric' AND rental_slot IS NOT NULL
                 AND archived_at IS NULL AND deleted_at IS NULL)::text
      ON CONFLICT (key) DO NOTHING;
    INSERT INTO app_settings (key, value) VALUES ('electric_slots_split', now()::text);
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scooters_pool_slot_unique"
  ON "scooters" ("slot_pool", "rental_slot")
  WHERE rental_slot IS NOT NULL AND archived_at IS NULL AND deleted_at IS NULL;
