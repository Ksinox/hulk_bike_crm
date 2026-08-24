-- Пункт 2: при ручном удалении аренды её оплаты исключаются из выручки
-- (флаг, платежи не удаляем — финансовая история сохраняется).
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "excluded_from_revenue" boolean DEFAULT false NOT NULL;
