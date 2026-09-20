-- Блок «Финансы» (задание заказчика 20.09) — форма ДДС.
--
-- Блок намеренно изолирован: с арендами, ремонтами и продажами данными не
-- обменивается. Приход и расход вносятся руками, чтобы цифры не спорили с
-- операционными блоками. Период берём общий для CRM (расчётный, с 15-го) —
-- отдельного календаря у блока нет, иначе в системе будет два «месяца».
--
-- Состав:
--   finance_categories — статьи прихода и расхода (справочник);
--   finance_entries    — сами движения денег;
--   finance_recurring  — постоянные издержки: шаблон, который сам
--                        повторяется в каждом следующем периоде;
--   finance_people     — люди для ФОТ (не учётки CRM: механик и подсобник
--                        логинов не имеют, а в ФОТ попадают);
--   finance_payroll    — ФОТ за период: оклад + процент с продаж.

CREATE TABLE IF NOT EXISTS "finance_categories" (
  "id" bigserial PRIMARY KEY,
  -- income | expense
  "kind" text NOT NULL,
  "name" text NOT NULL,
  -- статья постоянных издержек (аренда помещения, связь) — для разреза
  -- «постоянные / переменные» в обзоре
  "fixed" boolean NOT NULL DEFAULT false,
  "sort_order" integer NOT NULL DEFAULT 0,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_recurring" (
  "id" bigserial PRIMARY KEY,
  "kind" text NOT NULL DEFAULT 'expense',
  "category_id" bigint REFERENCES "finance_categories"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "amount" integer NOT NULL DEFAULT 0,
  -- с какого периода шаблон начинает повторяться (ключ периода — дата его
  -- первого дня, YYYY-MM-DD)
  "start_period" text NOT NULL,
  "active" boolean NOT NULL DEFAULT true,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_entries" (
  "id" bigserial PRIMARY KEY,
  -- income | expense
  "kind" text NOT NULL,
  "category_id" bigint REFERENCES "finance_categories"("id") ON DELETE SET NULL,
  "name" text NOT NULL,
  "amount" integer NOT NULL DEFAULT 0,
  -- дата движения денег
  "at" date NOT NULL,
  -- ключ периода, в который движение попало на момент внесения
  "period_key" text NOT NULL,
  -- откуда взялось: manual | recurring
  "source" text NOT NULL DEFAULT 'manual',
  "recurring_id" bigint REFERENCES "finance_recurring"("id") ON DELETE SET NULL,
  "note" text,
  "created_by" bigint,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "deleted_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "finance_entries_period_idx" ON "finance_entries" ("period_key");
--> statement-breakpoint
-- одна постоянная издержка даёт ровно одну запись в периоде
CREATE UNIQUE INDEX IF NOT EXISTS "finance_entries_recurring_period_uq"
  ON "finance_entries" ("recurring_id", "period_key")
  WHERE "recurring_id" IS NOT NULL AND "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_people" (
  "id" bigserial PRIMARY KEY,
  "name" text NOT NULL,
  "role" text,
  -- оклад по умолчанию: подставляется в новый период, правится на месте
  "salary_default" integer NOT NULL DEFAULT 0,
  "active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 0,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "finance_payroll" (
  "id" bigserial PRIMARY KEY,
  "period_key" text NOT NULL,
  "person_id" bigint REFERENCES "finance_people"("id") ON DELETE CASCADE,
  -- имя фиксируем в строке: переименование человека не переписывает прошлые месяцы
  "person_name" text NOT NULL,
  "salary" integer NOT NULL DEFAULT 0,
  -- процент с продаж за период — сумма, которую человек заработал сверх оклада
  "sales_bonus" integer NOT NULL DEFAULT 0,
  "note" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "finance_payroll_period_person_uq"
  ON "finance_payroll" ("period_key", "person_id");
--> statement-breakpoint
-- Стартовый справочник статей: из реальной структуры расходов и выручки
-- (лист «Расходы» и «Выручка» рабочего Excel). Заводится один раз.
INSERT INTO "finance_categories" ("kind", "name", "fixed", "sort_order")
SELECT * FROM (VALUES
  ('income', 'Аренда', false, 10),
  ('income', 'Ремонты', false, 20),
  ('income', 'Продажа техники', false, 30),
  ('income', 'Запчасти в розницу', false, 40),
  ('income', 'Прочий приход', false, 90),
  ('expense', 'Аренда помещения', true, 10),
  ('expense', 'Логистика', true, 20),
  ('expense', 'Реклама (Авито)', true, 30),
  ('expense', 'Коммунальные', true, 40),
  ('expense', 'Связь и интернет', true, 50),
  ('expense', 'Закупка запчастей', false, 60),
  ('expense', 'Расходники парка', false, 70),
  ('expense', 'Закуп техники', false, 80),
  ('expense', 'Налоги и сборы', true, 85),
  ('expense', 'Прочий расход', false, 90)
) AS seed(kind, name, fixed, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM "finance_categories");
