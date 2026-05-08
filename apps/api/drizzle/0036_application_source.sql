-- Группа A — Источник в публичной анкете.
--
-- Клиент выбирает «откуда о нас узнал» прямо в анкете /apply на
-- отдельном шаге. При convert значение копируется в clients.source
-- (тот же enum). Если клиент выбрал «другое» — текст падает в
-- source_custom.
--
-- Идемпотентно: ALTER TABLE ADD COLUMN IF NOT EXISTS.

ALTER TABLE client_applications
  ADD COLUMN IF NOT EXISTS source client_source,
  ADD COLUMN IF NOT EXISTS source_custom text;
