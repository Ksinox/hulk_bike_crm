-- Миниатюры аватарок для каталогов: модели скутеров и экипировка.
-- При загрузке клиент кропает картинку через ImageCropDialog и шлёт
-- два файла — оригинал (avatar_*) и миниатюру 512px (avatar_thumb_*).
-- В плитках/списках используется миниатюра, в карточке/превью — оригинал.

ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "avatar_thumb_key" text;--> statement-breakpoint
ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "avatar_thumb_file_name" text;--> statement-breakpoint

ALTER TABLE "equipment_items" ADD COLUMN IF NOT EXISTS "avatar_thumb_key" text;--> statement-breakpoint
ALTER TABLE "equipment_items" ADD COLUMN IF NOT EXISTS "avatar_thumb_file_name" text;
