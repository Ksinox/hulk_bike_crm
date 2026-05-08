-- v0.4.56 — флаг applied_to_endplanned + бэкфил исторических аренд.
--
-- ПРОБЛЕМА: до v0.4.55 оплата/forgive просроченных дней не сдвигали
-- rental.end_planned_at. После моего фикса в v0.4.55 — новые операции
-- сдвигают, но исторические аренды остались с end_planned_at в прошлом
-- даже если уже всё оплачено/прощено. Бейдж «Просрочка» висит, KPI
-- показывает «возврат был DD.MM», status='overdue' — данные неконсистентны.
--
-- РЕШЕНИЕ:
--   1. Добавить колонку debt_entries.applied_to_endplanned (bool).
--   2. Бэкфил: для каждой не-архивной аренды посчитать накопленные
--      «оплаченные/прощённые дни» по записям debt_entries kind IN
--      (overdue_days_forgive, overdue_days_payment, overdue_forgive,
--      overdue_payment) с applied=false. Сдвинуть end_planned_at на
--      это число дней (но не больше overdueDays). Пометить записи
--      applied=true.
--   3. Если после сдвига endPlanned >= today И status='overdue' →
--      перевести в 'active'.
--
-- Идемпотентно: повторный запуск ничего не делает (все old записи уже
-- помечены applied=true, новые тоже).

DO $$ BEGIN
  ALTER TABLE "debt_entries"
    ADD COLUMN "applied_to_endplanned" boolean NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL; END $$;

-- Бэкфил выполняется в одной транзакции. Для каждой live-аренды
-- считаем суммарную «компенсацию дней» и сдвигаем end_planned_at.
WITH days_compensation AS (
  SELECT
    e.rental_id,
    SUM(e.amount) FILTER (
      WHERE e.kind IN (
        'overdue_days_forgive',
        'overdue_days_payment',
        'overdue_forgive',
        'overdue_payment'
      )
        AND e.applied_to_endplanned = false
    ) AS unapplied_amount,
    -- mixedForgive (overdue_forgive) переливается дни→штраф,
    -- здесь упрощаем: считаем как days (для целей бэкфила это
    -- консервативная оценка, мы не сдвинем дальше чем overdueDays).
    -- mixedPayment (overdue_payment) — аналогично.
    array_agg(e.id) FILTER (
      WHERE e.kind IN (
        'overdue_days_forgive',
        'overdue_days_payment',
        'overdue_forgive',
        'overdue_payment'
      )
        AND e.applied_to_endplanned = false
    ) AS unapplied_ids
  FROM debt_entries e
  GROUP BY e.rental_id
),
shift_calc AS (
  SELECT
    r.id AS rental_id,
    r.end_planned_at,
    r.status,
    r.rate,
    r.rate_unit,
    r.archived_at,
    dc.unapplied_amount,
    dc.unapplied_ids,
    -- dailyRate
    CASE WHEN r.rate_unit = 'week' THEN ROUND(r.rate / 7.0)
         ELSE r.rate END AS daily_rate,
    -- сколько дней уже просрочено сейчас
    GREATEST(
      0,
      EXTRACT(DAY FROM ((now() AT TIME ZONE 'Europe/Moscow')::date - r.end_planned_at::date))::int
    ) AS overdue_days_now,
    -- сколько дней мы можем компенсировать = floor(amount / dailyRate)
    CASE
      WHEN r.rate_unit = 'week' AND ROUND(r.rate / 7.0) > 0 THEN
        FLOOR(COALESCE(dc.unapplied_amount, 0)::numeric / ROUND(r.rate / 7.0))::int
      WHEN r.rate > 0 THEN
        FLOOR(COALESCE(dc.unapplied_amount, 0)::numeric / r.rate)::int
      ELSE 0
    END AS days_to_shift_raw
  FROM rentals r
  LEFT JOIN days_compensation dc ON dc.rental_id = r.id
  WHERE r.archived_at IS NULL
    AND COALESCE(dc.unapplied_amount, 0) > 0
),
shifts AS (
  SELECT
    rental_id,
    LEAST(overdue_days_now, days_to_shift_raw) AS days_to_shift,
    unapplied_ids
  FROM shift_calc
  WHERE LEAST(overdue_days_now, days_to_shift_raw) > 0
)
UPDATE rentals r
   SET end_planned_at = r.end_planned_at + (s.days_to_shift || ' days')::interval,
       status = CASE
         WHEN r.status = 'overdue'
              AND (r.end_planned_at + (s.days_to_shift || ' days')::interval)::date >= (now() AT TIME ZONE 'Europe/Moscow')::date
         THEN 'active'::rental_status
         ELSE r.status
       END,
       updated_at = now()
  FROM shifts s
 WHERE r.id = s.rental_id;

-- Помечаем все рассмотренные записи applied=true (даже те у аренд
-- где days_to_shift=0 — чтобы не пытаться применить их повторно).
UPDATE debt_entries
   SET applied_to_endplanned = true
 WHERE applied_to_endplanned = false
   AND kind IN (
     'overdue_days_forgive',
     'overdue_days_payment',
     'overdue_forgive',
     'overdue_payment'
   );
