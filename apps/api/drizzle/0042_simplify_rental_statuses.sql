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
-- Также удаляются мёртвые поля чеклиста подтверждения выдачи
-- (`confirm_contract_signed`, `confirm_rent_paid`,
--  `confirm_deposit_received`, `payment_confirmed_by`,
--  `payment_confirmed_by_name`, `payment_confirmed_at`). UI этого
-- чеклиста давно убран, поля всегда false и не используются.
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

    -- 1. Миграция значений к новым: всё незавершённое → active,
    --    завершённое/отменённое/с ущербом → completed.
    UPDATE rentals SET status = 'active'
      WHERE status::text IN ('new_request', 'meeting', 'overdue', 'returning', 'problem', 'police', 'court');

    UPDATE rentals SET status = 'completed'
      WHERE status::text IN ('completed_damage', 'cancelled');

    -- 2. Пересоздать pgEnum с минимальным набором значений.
    --    Postgres не даёт удалять значения из enum напрямую — только
    --    через rename + create new + alter column type + drop old.
    ALTER TYPE rental_status RENAME TO rental_status_old;
    CREATE TYPE rental_status AS ENUM ('active', 'completed');

    ALTER TABLE rentals
      ALTER COLUMN status DROP DEFAULT,
      ALTER COLUMN status TYPE rental_status USING status::text::rental_status,
      ALTER COLUMN status SET DEFAULT 'active';

    DROP TYPE rental_status_old;

  END IF;

  -- 3. Удалить мёртвые поля чеклиста подтверждения выдачи.
  --    IF EXISTS гарантирует идемпотентность.
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_contract_signed;
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_rent_paid;
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_deposit_received;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_by;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_by_name;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_at;

  -- 4. Связанный enum payment_confirmer_role больше не используется.
  DROP TYPE IF EXISTS payment_confirmer_role;

END $$;
