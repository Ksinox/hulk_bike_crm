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

BEGIN;

-- 1. Миграция существующих значений на новые два.
--    Незавершённые/боковые → active. Завершённые/ущербные/отменённые → completed.
UPDATE rentals SET status = 'active'
  WHERE status IN ('new_request', 'meeting', 'overdue', 'returning', 'problem', 'police', 'court');

UPDATE rentals SET status = 'completed'
  WHERE status IN ('completed_damage', 'cancelled');

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

-- 3. Удалить мёртвые поля чеклиста подтверждения выдачи.
ALTER TABLE rentals
  DROP COLUMN IF EXISTS confirm_contract_signed,
  DROP COLUMN IF EXISTS confirm_rent_paid,
  DROP COLUMN IF EXISTS confirm_deposit_received,
  DROP COLUMN IF EXISTS payment_confirmed_by,
  DROP COLUMN IF EXISTS payment_confirmed_by_name,
  DROP COLUMN IF EXISTS payment_confirmed_at;

-- 4. Связанный enum payment_confirmer_role больше не используется.
DROP TYPE IF EXISTS payment_confirmer_role;

COMMIT;
