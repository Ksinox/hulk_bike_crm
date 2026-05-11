-- v0.5.0 — упрощение модели статусов аренды + удаление мёртвых полей.
--
-- ДО: 11 статусов в pgEnum rental_status:
--   new_request, meeting, active, overdue, returning, completed,
--   completed_damage, cancelled, police, court, problem
--
-- ПОСЛЕ: 2 статуса:
--   active     — аренда идёт (просрочка и «возврат сегодня» теперь
--                computed на фронте: endPlannedAt < today vs = today)
--   completed  — аренда завершена (с ущербом или без — отдельного
--                completed_damage больше нет, наличие долга по ущербу
--                выясняется по damage_reports.debt > 0)
--
-- Также удаляются мёртвые поля чеклиста подтверждения выдачи.
--
-- ИДЕМПОТЕНТНОСТЬ: вся работа обёрнута в DO-блок, который проверяет
-- наличие старых enum-значений. Если их нет — миграция уже отработала,
-- ничего не делаем. Это критично потому что migrate.ts запускает все
-- .sql файлы на каждом старте API, без отдельного журнала.

DO $$
BEGIN
  -- Если в enum rental_status всё ещё есть 'new_request' — миграция
  -- ещё не отработала. Делаем всю работу. Иначе — skip.
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'rental_status'::regtype
      AND enumlabel = 'new_request'
  ) THEN

    -- 1. Сначала ДРОПАЕМ DEFAULT — иначе при смене типа колонки Postgres
    --    не сможет сравнить старое дефолт-значение ('new_request' тип
    --    rental_status_old) с новым типом, и упадёт с ошибкой
    --    «operator does not exist: rental_status = rental_status_old».
    ALTER TABLE rentals ALTER COLUMN status DROP DEFAULT;

    -- 2. Миграция значений к новым.
    UPDATE rentals SET status = 'active'
      WHERE status::text IN ('new_request', 'meeting', 'overdue', 'returning', 'problem', 'police', 'court');
    UPDATE rentals SET status = 'completed'
      WHERE status::text IN ('completed_damage', 'cancelled');

    -- 3. Пересоздать pgEnum с минимальным набором значений.
    ALTER TYPE rental_status RENAME TO rental_status_old;
    CREATE TYPE rental_status AS ENUM ('active', 'completed');

    -- 4. Меняем тип колонки через USING (явный каст через text).
    ALTER TABLE rentals
      ALTER COLUMN status TYPE rental_status USING status::text::rental_status;

    -- 5. Восстанавливаем DEFAULT (уже валидное значение нового типа).
    ALTER TABLE rentals ALTER COLUMN status SET DEFAULT 'active';

    -- 6. Дропаем старый enum.
    DROP TYPE rental_status_old;

  END IF;

  -- Удалить мёртвые поля чеклиста подтверждения выдачи.
  -- IF EXISTS гарантирует идемпотентность.
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_contract_signed;
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_rent_paid;
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_deposit_received;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_by;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_by_name;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_at;

  -- Связанный enum payment_confirmer_role больше не используется.
  DROP TYPE IF EXISTS payment_confirmer_role;

END $$;
