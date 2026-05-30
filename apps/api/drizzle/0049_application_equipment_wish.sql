-- G3 (v0.6) — предзаявка: какую экипировку хочет клиент (мультивыбор в анкете).
-- Массив id из equipment_items. При конвертации подставляется в аренду.

ALTER TABLE "client_applications"
  ADD COLUMN IF NOT EXISTS "requested_equipment_ids" jsonb;
