-- Перекадрирование аватарки (заказчик 06.09).
--
-- Раньше на сервер уходил только результат кропа: чтобы поправить кадр,
-- приходилось искать исходный файл и загружать заново (а его может не быть
-- под рукой или человек за другим компьютером). Теперь рядом лежит оригинал
-- и параметры кадра — «Перекадрировать» открывает ту же рамку, где её
-- оставили, и пересобирает миниатюры без повторной загрузки.
ALTER TABLE "scooter_models"
  ADD COLUMN IF NOT EXISTS "avatar_original_key" text;
--> statement-breakpoint
ALTER TABLE "scooter_models"
  ADD COLUMN IF NOT EXISTS "avatar_original_file_name" text;
--> statement-breakpoint
ALTER TABLE "scooter_models"
  ADD COLUMN IF NOT EXISTS "avatar_crop" jsonb;
--> statement-breakpoint

ALTER TABLE "equipment_items"
  ADD COLUMN IF NOT EXISTS "avatar_original_key" text;
--> statement-breakpoint
ALTER TABLE "equipment_items"
  ADD COLUMN IF NOT EXISTS "avatar_original_file_name" text;
--> statement-breakpoint
ALTER TABLE "equipment_items"
  ADD COLUMN IF NOT EXISTS "avatar_crop" jsonb;
