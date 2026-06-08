-- v0.9.7 — дашборд-метрика «заявки → аренда».
-- Флаг «клиент пришёл из публичной заявки» храним на клиенте, чтобы счётчик
-- переживал удаление самой заявки и убывал только при удалении его аренд.

ALTER TABLE "clients"
  ADD COLUMN IF NOT EXISTS "from_application" boolean NOT NULL DEFAULT false;--> statement-breakpoint

-- Backfill: пометить клиентов, созданных из ПРИНЯТЫХ заявок (накопительно —
-- чтобы метрика учитывала и конверсии, сделанные до появления поля).
-- Идемпотентно: повторный прогон только доставляет true, ничего не снимает.
UPDATE "clients" SET "from_application" = true
WHERE "id" IN (
  SELECT "client_id" FROM "client_applications"
  WHERE "status" = 'accepted' AND "client_id" IS NOT NULL
);
