-- v0.8 — модуль «Должники».
--
-- Standalone-таблицы, не лезут напрямую в clients/rentals. Должник
-- может быть привязан к клиенту CRM (client_id), а может быть внешний
-- человек (external_name + external_phone). Связь с арендой
-- опциональна — через related_rental_id, для типа 'rental_overdue'.
--
-- Жизненный цикл дела — state machine, описанный в коде
-- (services/debtorStages.ts). БД хранит только текущую stage; переходы
-- валидируются на бэке. Каждая смена стадии пишет debtor_stage_events.

-- ====== ENUMS ======

DO $$ BEGIN
  CREATE TYPE debtor_type AS ENUM (
    'dtp_guilty',     -- ДТП виновник
    'dtp_victim',     -- ДТП потерпевший (страховая)
    'damage',         -- ущерб скутеру
    'theft',          -- угон
    'rental_overdue'  -- просрочка по аренде
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE debtor_stage AS ENUM (
    'created',
    'pretrial',           -- досудебка
    'lawyer',             -- у юриста
    'court',              -- в суде
    'insurance_docs',     -- документы поданы в страховую
    'insurance_eval',     -- оценка
    'insurance_wait',     -- ждём выплату
    'payment_schedule',   -- график платежей
    'police',             -- заявление в полицию
    'criminal_case',      -- уголовное дело
    'closed_paid',        -- закрыто оплатой
    'closed_written_off', -- списано
    'closed_settled',     -- мировая
    'closed_court'        -- решением суда
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE debtor_client_status AS ENUM ('active', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE debtor_payment_method AS ENUM ('transfer', 'cash');
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  CREATE TYPE debtor_call_outcome AS ENUM (
    'answered',   -- ответил, поговорили
    'no_answer',  -- не ответил
    'promised',   -- ответил, обещал к дате
    'refused'     -- отказался платить
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ====== ТАБЛИЦА: debtors ======

CREATE TABLE IF NOT EXISTS "debtors" (
  "id"                    bigserial PRIMARY KEY NOT NULL,
  "case_number"           text NOT NULL UNIQUE,
  -- person
  "client_id"             bigint,
  "external_name"         text,
  "external_phone"        text,
  -- debt
  "type"                  debtor_type NOT NULL,
  "stage"                 debtor_stage NOT NULL DEFAULT 'created',
  "stage_entered_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "total_amount"          integer NOT NULL,
  "psy_rating"            integer NOT NULL DEFAULT 3,
  "client_status"         debtor_client_status NOT NULL DEFAULT 'active',
  "comment"               text,
  -- insurance (только dtp_victim)
  "insurance_company"     text,
  "insurance_estimate"    integer,
  "insurance_payout"      integer,
  "repair_cost"           integer,
  -- lawyer
  "lawyer_name"           text,
  "last_lawyer_update_at" timestamp with time zone,
  -- related
  "related_rental_id"     bigint,
  -- closing
  "closed_at"             timestamp with time zone,
  "closed_reason"         text,
  -- audit
  "created_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"            timestamp with time zone NOT NULL DEFAULT now(),
  "created_by_user_id"    bigint
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtors"
    ADD CONSTRAINT "debtors_psy_rating_range"
    CHECK ("psy_rating" BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtors"
    ADD CONSTRAINT "debtors_total_amount_positive"
    CHECK ("total_amount" > 0);
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtors"
    ADD CONSTRAINT "debtors_person_present"
    CHECK (
      "client_id" IS NOT NULL
      OR ("external_name" IS NOT NULL AND "external_phone" IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtors"
    ADD CONSTRAINT "debtors_client_id_fk"
    FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtors"
    ADD CONSTRAINT "debtors_related_rental_id_fk"
    FOREIGN KEY ("related_rental_id") REFERENCES "public"."rentals"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtors"
    ADD CONSTRAINT "debtors_created_by_user_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "debtors_stage_idx" ON "debtors" ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debtors_client_idx" ON "debtors" ("client_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debtors_rental_idx" ON "debtors" ("related_rental_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debtors_created_at_idx" ON "debtors" ("created_at");--> statement-breakpoint

-- ====== ТАБЛИЦА: debtor_payments ======

CREATE TABLE IF NOT EXISTS "debtor_payments" (
  "id"                bigserial PRIMARY KEY NOT NULL,
  "debtor_id"         bigint NOT NULL,
  "n"                 integer NOT NULL,
  "scheduled_date"    date NOT NULL,
  "scheduled_amount"  integer NOT NULL,
  "paid_at"           timestamp with time zone,
  "paid_amount"       integer,
  "paid_method"       debtor_payment_method,
  "paid_by_user_id"   bigint,
  "note"              text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_payments"
    ADD CONSTRAINT "debtor_payments_debtor_id_fk"
    FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_payments"
    ADD CONSTRAINT "debtor_payments_paid_by_user_id_fk"
    FOREIGN KEY ("paid_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_payments"
    ADD CONSTRAINT "debtor_payments_unique_n"
    UNIQUE ("debtor_id", "n");
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "debtor_payments_due_idx" ON "debtor_payments" ("scheduled_date") WHERE "paid_at" IS NULL;--> statement-breakpoint

-- ====== ТАБЛИЦА: debtor_calls (лог звонков) ======

CREATE TABLE IF NOT EXISTS "debtor_calls" (
  "id"             bigserial PRIMARY KEY NOT NULL,
  "debtor_id"      bigint NOT NULL,
  "outcome"        debtor_call_outcome NOT NULL,
  "promised_date"  date,
  "note"           text,
  "user_id"        bigint,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_calls"
    ADD CONSTRAINT "debtor_calls_debtor_id_fk"
    FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_calls"
    ADD CONSTRAINT "debtor_calls_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

-- ====== ТАБЛИЦА: debtor_stage_events ======

CREATE TABLE IF NOT EXISTS "debtor_stage_events" (
  "id"          bigserial PRIMARY KEY NOT NULL,
  "debtor_id"   bigint NOT NULL,
  "from_stage"  debtor_stage,
  "to_stage"    debtor_stage NOT NULL,
  "reason"      text,
  "user_id"     bigint,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_stage_events"
    ADD CONSTRAINT "debtor_stage_events_debtor_id_fk"
    FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_stage_events"
    ADD CONSTRAINT "debtor_stage_events_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "debtor_stage_events_debtor_idx" ON "debtor_stage_events" ("debtor_id", "created_at");--> statement-breakpoint

-- ====== ТАБЛИЦА: debtor_notes ======

CREATE TABLE IF NOT EXISTS "debtor_notes" (
  "id"          bigserial PRIMARY KEY NOT NULL,
  "debtor_id"   bigint NOT NULL,
  "text"        text NOT NULL,
  "user_id"     bigint,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now()
);--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_notes"
    ADD CONSTRAINT "debtor_notes_debtor_id_fk"
    FOREIGN KEY ("debtor_id") REFERENCES "public"."debtors"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "debtor_notes"
    ADD CONSTRAINT "debtor_notes_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null;
EXCEPTION WHEN duplicate_object THEN null; END $$;
