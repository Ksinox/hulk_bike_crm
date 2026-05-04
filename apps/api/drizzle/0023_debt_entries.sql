-- v0.3.8 — учёт долгов: ручной долг и списание просрочки.
--
-- debt_entries — лента событий по долгу аренды. Один тип событий:
--   • manual_charge   — оператор начислил произвольный долг с комментарием
--   • manual_forgive  — оператор списал часть ручного долга
--   • overdue_forgive — оператор «сбросил просрочку» на момент N
--                       (фиксирует сумму, посчитанную по формуле
--                       1.5 × rate × overdueDays на момент клика)
--   • overdue_payment — частичная оплата просрочки (зарезервировано
--                       под ит.3 §18, в ит.2 не используется)
--
-- Долг по ущербу остаётся в damage_reports (отдельная плашка), здесь
-- его не дублируем — в UI они складываются.

CREATE TABLE IF NOT EXISTS "debt_entries" (
    "id" bigserial PRIMARY KEY NOT NULL,
    "rental_id" bigint NOT NULL,
    "kind" text NOT NULL,
    "amount" integer NOT NULL,
    "comment" text,
    "created_by_user_id" bigint,
    "created_by_name" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "debt_entries"
    ADD CONSTRAINT "debt_entries_rental_id_rentals_id_fk"
    FOREIGN KEY ("rental_id") REFERENCES "public"."rentals"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "debt_entries"
    ADD CONSTRAINT "debt_entries_created_by_user_id_users_id_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
    ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "debt_entries_rental_idx"
    ON "debt_entries" ("rental_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debt_entries_kind_idx"
    ON "debt_entries" ("kind");
