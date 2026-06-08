-- G3 (v0.9.6) — точное имя выбранной модели в предзаявке.
-- requestedModel — грубый enum (jog/gear/honda/tank) для префилла-фильтра
-- «Новая аренда»; он не покрывает кастомные модели каталога («aima» и пр.).
-- Это поле хранит реальное имя модели, как выбрал клиент («Yamaha Jog»…),
-- чтобы оно корректно показывалось в карточке заявки. NULL — старые заявки.

ALTER TABLE "client_applications"
  ADD COLUMN IF NOT EXISTS "requested_model_name" text;
