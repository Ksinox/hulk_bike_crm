-- v0.4.34 — добавляем 'deposit' в payment_method enum.
--
-- Причина: при оплате долга из залога (rental.deposit) или из депозита
-- клиента (clients.deposit_balance) создаётся payment-запись чтобы
-- было видно «куда ушли деньги залога». Раньше PaymentAcceptDialog
-- молча уменьшал rental.deposit без записи в payments → деньги
-- исчезали из учёта.
--
-- Эти платежи НЕ должны попадать в выручку (залог уже был учтён как
-- type='deposit' при выдаче, повторный учёт = двойной счёт). Поэтому
-- фильтр revenue.ts на фронте теперь исключает method='deposit'.
--
-- Идемпотентно: ALTER TYPE ... ADD VALUE IF NOT EXISTS появилось в
-- PG 9.6, у нас PG 16 — безопасно.

ALTER TYPE "public"."payment_method" ADD VALUE IF NOT EXISTS 'deposit';
