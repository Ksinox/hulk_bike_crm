-- Расширяем enum платежей: добавляем 'swap_fee' для доплат при замене
-- скутера на более дорогую модель. ALTER TYPE ... ADD VALUE не может
-- идти в одной транзакции с использованием значения, поэтому отдельно.
ALTER TYPE "payment_type" ADD VALUE IF NOT EXISTS 'swap_fee';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scooter_swaps" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "rental_id" bigint NOT NULL,
  "prev_scooter_id" bigint,
  "new_scooter_id" bigint NOT NULL,
  "swap_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reason" text,
  "fee_amount" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scooter_swaps" ADD CONSTRAINT "scooter_swaps_rental_id_rentals_id_fk" FOREIGN KEY ("rental_id") REFERENCES "rentals"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scooter_swaps" ADD CONSTRAINT "scooter_swaps_prev_scooter_id_scooters_id_fk" FOREIGN KEY ("prev_scooter_id") REFERENCES "scooters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "scooter_swaps" ADD CONSTRAINT "scooter_swaps_new_scooter_id_scooters_id_fk" FOREIGN KEY ("new_scooter_id") REFERENCES "scooters"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooter_swaps_rental_idx" ON "scooter_swaps" ("rental_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scooter_swaps_swap_at_idx" ON "scooter_swaps" ("swap_at");
