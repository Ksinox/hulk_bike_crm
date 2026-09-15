-- Пункт 4: причина возврата при закрытии аренды.
ALTER TABLE "rentals" ADD COLUMN IF NOT EXISTS "return_reason" text;
