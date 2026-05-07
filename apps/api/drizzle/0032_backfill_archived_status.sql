-- v0.4.44 — бэкфил инварианта «archived ⇒ status ∈ {completed, cancelled, completed_damage}».
--
-- До v0.4.36 DELETE /api/rentals/:id архивировал аренду без смены статуса.
-- Получались записи archived_at IS NOT NULL + status='active', которые
-- блокировали выдачу того же скутера новому клиенту, даже если фактически
-- скутер свободен. v0.4.36 чинит это для НОВЫХ удалений, эта миграция
-- закрывает исторические записи.
--
-- Правило: для архивных аренд с live-статусом ставим 'cancelled'
-- (это намеренное удаление директором, аналог отмены аренды).
-- Идемпотентно: повторный запуск ничего не делает.

UPDATE rentals
   SET status = 'cancelled',
       updated_at = now()
 WHERE archived_at IS NOT NULL
   AND status IN ('active', 'overdue', 'returning', 'new_request', 'meeting');
