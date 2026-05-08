-- v0.4.66 — склейка цепочек продлений в одну аренду.
--
-- ИСТОРИЯ: до v0.4.49 продление аренды создавало child rental с
-- parent_rental_id, ссылающимся на старого родителя. У одного клиента
-- цепочка #60 → #79 → ... могла быть длиной до нескольких записей. UI
-- показывал их как отдельные аренды, KPI считал каждую, оператор путался.
--
-- С v0.4.49 продление inplace — обновляет ту же запись. С v0.4.57
-- старый /extend endpoint тоже стал alias к inplace. Но в БД
-- остались legacy цепочки которые висят.
--
-- ЭТА МИГРАЦИЯ: для каждой цепочки переносит ВСЕ связанные данные
-- потомков на корень (parent_rental_id IS NULL), агрегирует
-- days/sum, наследует от последнего потомка status/end_planned_at/
-- rate/scooter_id/etc, удаляет потомков.
--
-- БЕЗОПАСНОСТЬ:
--  • Транзакционно — RAISE EXCEPTION при ошибке откатит всё.
--  • Pre-flight backup на сервере: pg_dump перед запуском (см. инструкцию
--    в комментарии к коммиту).
--  • Идемпотентно: после первого запуска parent_rental_id у всех нет,
--    второй запуск — no-op.
--  • return_inspections и scooter_swaps имеют PK/UNIQUE на rental_id —
--    перед переносом удаляем старые записи у root'а (они устарели).

DO $migration$
DECLARE
  root_id INT;
  desc_ids INT[];
  last_descendant RECORD;
  total_days INT;
  total_sum INT;
  chain_count INT := 0;
BEGIN
  -- Идём по каждому корню который имеет хоть одного потомка.
  FOR root_id IN
    SELECT DISTINCT root.id
    FROM rentals root
    WHERE root.parent_rental_id IS NULL
      AND EXISTS (
        SELECT 1 FROM rentals child
        WHERE child.parent_rental_id IS NOT NULL
          AND child.id IN (
            -- recursive: все потомки root.id
            WITH RECURSIVE d AS (
              SELECT id FROM rentals WHERE parent_rental_id = root.id
              UNION ALL
              SELECT r.id FROM rentals r JOIN d ON r.parent_rental_id = d.id
            )
            SELECT id FROM d
          )
      )
  LOOP
    -- Собираем всех потомков root_id
    WITH RECURSIVE d AS (
      SELECT id, 1 AS depth FROM rentals WHERE parent_rental_id = root_id
      UNION ALL
      SELECT r.id, d.depth + 1 FROM rentals r JOIN d ON r.parent_rental_id = d.id
    )
    SELECT array_agg(id ORDER BY depth, id) INTO desc_ids FROM d;

    IF desc_ids IS NULL OR array_length(desc_ids, 1) = 0 THEN
      CONTINUE;
    END IF;

    -- "Последний" потомок — max(depth, id), он даёт финальные значения цепочки
    SELECT r.* INTO last_descendant
    FROM rentals r
    WHERE r.id = ANY(desc_ids)
    ORDER BY
      (SELECT depth FROM (
        WITH RECURSIVE d AS (
          SELECT id, 1 AS depth FROM rentals WHERE parent_rental_id = root_id
          UNION ALL
          SELECT r2.id, d.depth + 1 FROM rentals r2 JOIN d ON r2.parent_rental_id = d.id
        )
        SELECT depth FROM d WHERE id = r.id
      ) AS sub) DESC,
      r.id DESC
    LIMIT 1;

    -- Агрегация days и sum по всей цепочке (root + descendants)
    SELECT COALESCE(SUM(days), 0), COALESCE(SUM(sum), 0)
      INTO total_days, total_sum
    FROM rentals
    WHERE id = root_id OR id = ANY(desc_ids);

    -- Удаляем существующие inspection/swap у root'а — они устарели.
    -- Inspection последнего потомка переедет дальше.
    DELETE FROM return_inspections WHERE rental_id = root_id;
    DELETE FROM scooter_swaps WHERE rental_id = root_id;
    DELETE FROM rental_document_snapshots WHERE rental_id = root_id;

    -- Переносим все ссылочные данные с потомков на root
    UPDATE payments              SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    UPDATE debt_entries          SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    UPDATE return_inspections    SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    UPDATE scooter_swaps         SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    UPDATE rental_document_snapshots SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    UPDATE damage_reports        SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    UPDATE rental_incidents      SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    UPDATE rental_tasks          SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    -- repair_jobs ссылается на rental_id опционально
    UPDATE repair_jobs           SET rental_id = root_id WHERE rental_id = ANY(desc_ids);
    -- activity_log entity_id (entity='rental')
    UPDATE activity_log
       SET entity_id = root_id
     WHERE entity = 'rental' AND entity_id = ANY(desc_ids);

    -- Сначала освобождаем scooter_id у потомков — иначе UPDATE root
    -- упадёт на uniq-индексе rentals_one_open_per_scooter_idx (двое
    -- живых не могут иметь один scooter_id).
    UPDATE rentals SET scooter_id = NULL WHERE id = ANY(desc_ids);

    -- Обновляем корень: agregate days/sum, financials и status от последнего
    UPDATE rentals SET
      end_planned_at  = last_descendant.end_planned_at,
      end_actual_at   = last_descendant.end_actual_at,
      status          = last_descendant.status,
      archived_at     = last_descendant.archived_at,
      archived_by     = last_descendant.archived_by,
      scooter_id      = last_descendant.scooter_id,
      rate            = last_descendant.rate,
      rate_unit       = last_descendant.rate_unit,
      tariff_period   = last_descendant.tariff_period,
      deposit         = last_descendant.deposit,
      deposit_original = COALESCE(last_descendant.deposit_original, deposit_original),
      deposit_item    = last_descendant.deposit_item,
      deposit_returned = last_descendant.deposit_returned,
      payment_method  = last_descendant.payment_method,
      equipment       = last_descendant.equipment,
      equipment_json  = last_descendant.equipment_json,
      damage_amount   = last_descendant.damage_amount,
      mileage_at_start = COALESCE(mileage_at_start, last_descendant.mileage_at_start),
      days            = total_days,
      sum             = total_sum,
      note            = TRIM(BOTH ' ' FROM
                          COALESCE(note, '') ||
                          CASE WHEN note IS NOT NULL AND note <> '' THEN E'\n' ELSE '' END ||
                          'Склеено из цепочки v0.4.66 (бывшие #' ||
                          array_to_string(desc_ids, ', #') || ')'
                        ),
      updated_at      = now()
    WHERE id = root_id;

    -- Удаляем потомков
    DELETE FROM rentals WHERE id = ANY(desc_ids);

    chain_count := chain_count + 1;
  END LOOP;

  RAISE NOTICE 'Collapsed % rental chains', chain_count;
END
$migration$;
