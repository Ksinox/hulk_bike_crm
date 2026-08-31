-- Отдельная анкета покупателя (задание 31.08).
--
-- Заказчик: «регистрация клиента по заявке — заявка отдельная». Анкета на
-- покупку отличается от арендной: там не нужны выбор модели/экипировки,
-- срок аренды и водительские права — нужен паспорт и его фото.
-- Тип хранится на самой заявке, чтобы менеджер сразу видел, за чем пришёл
-- клиент, и мог фильтровать список.
ALTER TABLE "client_applications"
  ADD COLUMN IF NOT EXISTS "purpose" text NOT NULL DEFAULT 'rent';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "client_applications_purpose_idx"
  ON "client_applications" ("purpose");
