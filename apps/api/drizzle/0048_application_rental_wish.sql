-- G3 (v0.6) — предзаявка на аренду: что клиент хочет арендовать.
-- Клиент выбирает модель и срок прямо в публичной анкете; при конвертации
-- они подставляются в форму «Новая аренда».

ALTER TABLE "client_applications"
  ADD COLUMN IF NOT EXISTS "requested_model" "scooter_model";--> statement-breakpoint

ALTER TABLE "client_applications"
  ADD COLUMN IF NOT EXISTS "requested_days" integer;
