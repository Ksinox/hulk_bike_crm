-- v0.4.21 — backfill: уже существующие аренды со status='problem' или
-- 'completed_damage' и нулевым долгом по ущербу должны автоматически
-- перейти в нормальное состояние:
--   • если endActualAt задан (возврат уже завершён) → 'completed'
--   • иначе скутер ещё у клиента → 'active'
--
-- Раньше maybeAutoClose() в payments.ts работал только при поступлении
-- свежего платежа. Аренды, у которых ущерб погашен ДО v0.4.19, висели
-- в 'problem' / 'completed_damage' даже когда долга уже не было.
-- Эта миграция чинит все исторические записи разом.

UPDATE rentals r
SET
    status = (CASE
        WHEN r.end_actual_at IS NOT NULL THEN 'completed'
        ELSE 'active'
    END)::rental_status,
    updated_at = now()
WHERE r.status IN ('problem', 'completed_damage')
  AND COALESCE((
        SELECT SUM(dr.total - dr.deposit_covered)
        FROM damage_reports dr
        WHERE dr.rental_id = r.id
      ), 0)
      <=
      COALESCE((
        SELECT SUM(p.amount)
        FROM payments p
        WHERE p.rental_id = r.id AND p.type = 'damage' AND p.paid = true
      ), 0);
