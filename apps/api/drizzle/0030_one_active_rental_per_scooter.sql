-- v0.4.38 — defense against race condition: one open rental per scooter.
--
-- Сценарий: два оператора одновременно жмут «Выдать» один и тот же скутер
-- двум разным клиентам. SELECT-then-INSERT в POST /api/rentals не атомарен,
-- оба запроса проходят проверку «свободно», оба INSERT'а выполняются —
-- скутер оказывается в двух активных арендах одновременно.
--
-- Защита: partial unique index на rentals.scooter_id для статусов
-- 'active', 'overdue', 'returning'. Postgres гарантирует что в любой
-- момент времени для каждого scooter_id существует не более одной
-- такой записи — race condition превращается в безопасный 23505 error,
-- который API ловит и возвращает осмысленный 409.
--
-- Идемпотентно через IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS "rentals_one_open_per_scooter_idx"
  ON "rentals" ("scooter_id")
  WHERE "status" IN ('active', 'overdue', 'returning')
    AND "scooter_id" IS NOT NULL
    AND "archived_at" IS NULL;
