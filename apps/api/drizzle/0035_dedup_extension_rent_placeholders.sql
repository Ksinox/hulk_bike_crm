-- v0.4.50 — бэкфил «дублей» rent-платежей после продления.
--
-- БАГ: в v0.4.45..v0.4.49 при продлении через PaymentAcceptDialog
-- (autoMarkPaid=false) создавались ДВА rent-платежа на одну сумму:
--   1) placeholder (paid=false) от extend / extend-inplace
--   2) реальная оплата (paid=true) от distribute() в submit
-- В итоге KPI «Долг» показывал «не оплачено N ₽» уже после оплаты.
--
-- Этот скрипт удаляет «осиротевшие» placeholder'ы:
-- если у одной аренды есть paid=true rent_payment с amount=N И
-- paid=false rent_payment с тем же amount=N, удаляем paid=false.
--
-- Идемпотентно — повторный запуск не найдёт дублей.
-- Безопасно — удаляем только placeholder, реальная оплата сохраняется.

WITH dup_pairs AS (
  SELECT pf.id AS placeholder_id
    FROM payments pf
    JOIN payments pt
      ON pf.rental_id = pt.rental_id
     AND pf.type = 'rent'
     AND pt.type = 'rent'
     AND pf.paid = false
     AND pt.paid = true
     AND pf.amount = pt.amount
   WHERE pf.id != pt.id
)
DELETE FROM payments
 WHERE id IN (SELECT placeholder_id FROM dup_pairs);
