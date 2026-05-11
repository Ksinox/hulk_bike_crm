-- v0.5.0 — упрощение модели статусов аренды + удаление мёртвых полей.
--
-- ДО: 11 статусов в pgEnum rental_status:
--   new_request, meeting, active, overdue, returning, completed,
--   completed_damage, cancelled, police, court, problem
--
-- ПОСЛЕ: 2 статуса:
--   active     — аренда идёт
--   completed  — аренда завершена
--
-- Стратегия: ADD COLUMN status_new (новый тип) → COPY → DROP старой
-- колонки → RENAME. Это обходит проблему PostgresError «operator does
-- not exist: rental_status = rental_status_old», которая возникала при
-- попытке ALTER COLUMN TYPE из-за неявных сравнений в депенденсах
-- (defaults, индексы, drop'нуть их вручную не помогало).
--
-- ИДЕМПОТЕНТНОСТЬ через DO-блок: проверяем enum на наличие старых
-- значений. Если нет — миграция уже отработала, ничего не делаем.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'rental_status'::regtype
      AND enumlabel = 'new_request'
  ) THEN

    -- 1. Создаём новый enum-тип (под временным именем).
    CREATE TYPE rental_status_new AS ENUM ('active', 'completed');

    -- 2. Добавляем новую колонку (nullable пока, заполним).
    ALTER TABLE rentals ADD COLUMN status_new rental_status_new;

    -- 3. Копируем значения с маппингом: незавершённое → active,
    --    completed_damage/cancelled → completed.
    UPDATE rentals
       SET status_new =
         CASE
           WHEN status::text IN ('completed', 'completed_damage', 'cancelled')
             THEN 'completed'::rental_status_new
           ELSE 'active'::rental_status_new
         END;

    -- 4. Дропаем старую колонку (вместе с её default и индексом).
    ALTER TABLE rentals DROP COLUMN status;

    -- 5. Дропаем старый enum.
    DROP TYPE rental_status;

    -- 6. Переименовываем новый enum в каноническое имя.
    ALTER TYPE rental_status_new RENAME TO rental_status;

    -- 7. Переименовываем колонку.
    ALTER TABLE rentals RENAME COLUMN status_new TO status;

    -- 8. NOT NULL + DEFAULT.
    ALTER TABLE rentals
      ALTER COLUMN status SET NOT NULL,
      ALTER COLUMN status SET DEFAULT 'active';

    -- 9. Восстанавливаем индекс.
    CREATE INDEX rentals_status_idx ON rentals (status);

  END IF;

  -- Удалить мёртвые поля чеклиста подтверждения выдачи (идемпотентно).
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_contract_signed;
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_rent_paid;
  ALTER TABLE rentals DROP COLUMN IF EXISTS confirm_deposit_received;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_by;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_by_name;
  ALTER TABLE rentals DROP COLUMN IF EXISTS payment_confirmed_at;

  -- Связанный enum payment_confirmer_role больше не используется.
  DROP TYPE IF EXISTS payment_confirmer_role;

END $$;
