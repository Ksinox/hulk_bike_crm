-- v0.4.49 — добавляем 'equipment_fee' в payment_type enum.
--
-- Используется при изменении состава экипировки активной аренды
-- (новый action на карточке: «Изменить экипировку»). Если оператор
-- меняет экипировку на более дорогую — за оставшиеся дни считается
-- delta-доплата и фиксируется как payment(type='equipment_fee').
-- Если на дешёвую — разница уходит на clients.deposit_balance.
--
-- equipment_fee попадает в revenue (как обычная аренда).
-- Идемпотентно — ALTER TYPE ... ADD VALUE IF NOT EXISTS, ловится
-- 42710 в migrate.ts.

ALTER TYPE "public"."payment_type" ADD VALUE IF NOT EXISTS 'equipment_fee';
