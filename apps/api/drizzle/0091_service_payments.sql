-- Выпуск 2.0.2 (17.09): деньги стороннего ремонта — отдельными платежами.
-- Заказчик: клиент часто вносит аванс, остаток платит при выдаче; выручка
-- должна появляться только когда деньги реально приняли. Раньше у наряда
-- была одна оплата, а выручка блока считала и ремонты «в работе».
CREATE TABLE IF NOT EXISTS "service_order_payments" (
  "id" bigserial PRIMARY KEY,
  "order_id" bigint NOT NULL REFERENCES "service_orders"("id") ON DELETE CASCADE,
  -- 'advance' — аванс, 'payment' — расчёт при выдаче, 'refund' — возврат (сумма < 0)
  "kind" text NOT NULL,
  "amount" integer NOT NULL,
  -- 'cash' | 'transfer' | 'mixed'
  "method" text NOT NULL,
  "cash_amount" integer NOT NULL DEFAULT 0,
  "transfer_amount" integer NOT NULL DEFAULT 0,
  -- скидка, которую дали этим расчётом (для отмены расчёта)
  "discount" integer NOT NULL DEFAULT 0,
  "paid_at" timestamptz NOT NULL DEFAULT now(),
  "note" text,
  -- статус наряда до этого платежа — отмена платежа возвращает его
  "prev_status" text,
  "created_by_user_id" bigint REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_order_payments_order_idx" ON "service_order_payments" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_order_payments_paid_idx" ON "service_order_payments" ("paid_at");
--> statement-breakpoint
-- Скидка при расчёте: раньше сумму оплаты просто уменьшали, и разница
-- нигде не называлась.
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "discount" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
-- Отмена и возврат в работу: какой статус был до отмены.
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "status_before_cancel" text;
--> statement-breakpoint
ALTER TABLE "service_orders" ADD COLUMN IF NOT EXISTS "cancelled_at" timestamptz;
--> statement-breakpoint
-- Перенос прежних оплат — ОДИН раз (миграции гоняются на каждом старте).
-- Оплаченный наряд → один платёж на оплаченную сумму. Доли нал/перевод до
-- 07.09 не хранились — берём по способу. Если оплатили меньше суммы работ и
-- запчастей, разница и была скидкой — записываем её в наряд, чтобы «к оплате»
-- совпало с тем, что заплатили.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'service_payments_backfill') THEN
    INSERT INTO "service_order_payments"
      ("order_id", "kind", "amount", "method", "cash_amount", "transfer_amount",
       "paid_at", "note", "prev_status", "created_by_user_id", "created_at")
    SELECT
      o."id",
      'payment',
      o."paid_amount",
      COALESCE(o."payment_method", 'cash'),
      CASE
        WHEN o."payment_method" = 'mixed' THEN LEAST(o."cash_amount", o."paid_amount")
        WHEN o."payment_method" = 'transfer' THEN 0
        ELSE o."paid_amount"
      END,
      o."paid_amount" - CASE
        WHEN o."payment_method" = 'mixed' THEN LEAST(o."cash_amount", o."paid_amount")
        WHEN o."payment_method" = 'transfer' THEN 0
        ELSE o."paid_amount"
      END,
      COALESCE(o."paid_at", o."updated_at"),
      'оплата до выпуска 2.0.2',
      CASE WHEN o."completed_at" IS NOT NULL AND o."completed_at" < COALESCE(o."paid_at", o."updated_at") THEN 'done' ELSE 'in_work' END,
      o."created_by_user_id",
      COALESCE(o."paid_at", o."updated_at")
    FROM "service_orders" o
    WHERE o."status" = 'paid'
      AND COALESCE(o."paid_amount", 0) > 0
      AND NOT EXISTS (SELECT 1 FROM "service_order_payments" p WHERE p."order_id" = o."id");

    UPDATE "service_orders" o
    SET "discount" = GREATEST(0, t."total" - o."paid_amount")
    FROM (
      SELECT "order_id", SUM("price" * "qty") AS "total"
      FROM "service_order_items" GROUP BY "order_id"
    ) t
    WHERE t."order_id" = o."id"
      AND o."status" = 'paid'
      AND o."paid_amount" IS NOT NULL;

    UPDATE "service_order_payments" p
    SET "discount" = o."discount"
    FROM "service_orders" o
    WHERE o."id" = p."order_id" AND o."discount" > 0 AND p."note" = 'оплата до выпуска 2.0.2';

    INSERT INTO "app_settings" ("key", "value") VALUES ('service_payments_backfill', 'done');
  END IF;
END $$;
--> statement-breakpoint
-- Смешанная оплата при открытии аренды (2.0.2): доли наличных и перевода.
-- Способ у аренды остаётся одним значением (по большей доле) — его берут
-- продления и пересчёты; доли нужны карточкам, чтобы писать «смешанно».
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "payment_split" jsonb;
