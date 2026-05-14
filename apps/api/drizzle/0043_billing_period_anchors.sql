-- v0.7: история переключений расчётного периода.
--
-- Один глобальный billing_period_start_day в app_settings ломал прошлое:
-- при смене с 15 на 1 ВСЯ история задним числом пересчитывалась по новой
-- формуле, цифры на дашборде/в KPI прыгали. Теперь храним «якоря» — кто
-- и с какой даты ввёл то или иное правило. Резолвер для каждой даты
-- берёт активный на тот момент якорь.
--
-- kind='regular'    — обычный месячный период, начало на rule_start_day.
-- kind='transition' — переходный период от effective_from до
--                     transition_end_date (включительно). После окончания
--                     transition этот же якорь действует уже как regular
--                     с rule_start_day (новая схема).
--
-- Сидим первой записью (effective_from='2024-01-01', rule_start_day=
-- текущее значение из app_settings или 15) — она покрывает всю историю,
-- которая жила под старой моделью.

CREATE TABLE IF NOT EXISTS "billing_period_anchors" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "effective_from" date NOT NULL,
    "rule_start_day" integer NOT NULL,
    "kind" text NOT NULL,
    "transition_end_date" date,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "created_by_user_id" bigint
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "billing_period_anchors"
    ADD CONSTRAINT "billing_period_anchors_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "billing_period_anchors"
    ADD CONSTRAINT "billing_period_anchors_rule_start_day_range"
    CHECK ("rule_start_day" >= 1 AND "rule_start_day" <= 28);
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "billing_period_anchors"
    ADD CONSTRAINT "billing_period_anchors_kind_enum"
    CHECK ("kind" IN ('regular', 'transition'));
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "billing_period_anchors"
    ADD CONSTRAINT "billing_period_anchors_transition_end_required"
    CHECK (
        (kind = 'transition' AND transition_end_date IS NOT NULL)
        OR (kind = 'regular' AND transition_end_date IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "billing_period_anchors_effective_idx"
    ON "billing_period_anchors" ("effective_from");--> statement-breakpoint

-- Сидинг первого якоря: правило из app_settings (если есть), иначе 15.
INSERT INTO "billing_period_anchors"
    ("effective_from", "rule_start_day", "kind", "transition_end_date")
SELECT
    DATE '2024-01-01',
    COALESCE(
        (SELECT value::int FROM app_settings WHERE key='billing_period_start_day' LIMIT 1),
        15
    ),
    'regular',
    NULL
WHERE NOT EXISTS (SELECT 1 FROM "billing_period_anchors");
