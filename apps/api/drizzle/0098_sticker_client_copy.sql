-- Стикеры аренды → карточка клиента (заказчик 22.10).
--
-- Заметка, прикреплённая в аренде, чаще про клиента, чем про аренду. Теперь
-- при создании стикера аренды сервер кладёт копию в «Заметки» клиента —
-- с пометкой, из какой аренды. Копия живёт отдельно: открепили или удалили
-- стикер в аренде — у клиента он остаётся (история заметок по клиенту).
ALTER TABLE "note_stickers" ADD COLUMN IF NOT EXISTS "source_sticker_id" bigint;
--> statement-breakpoint
ALTER TABLE "note_stickers" ADD COLUMN IF NOT EXISTS "source_rental_id" bigint;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_stickers_source_idx" ON "note_stickers" ("source_sticker_id");
--> statement-breakpoint
-- Разовый перенос уже существующих стикеров аренд (заметки и связь, которые
-- прикрепил человек; паркинг и служебные пометки системы — про аренду). Состояние сохраняется: прикреплённый — прикреплён,
-- откреплённый — в истории. Флаг в app_settings — чтобы при следующих
-- запусках (миграции применяются каждый старт) не вернуть копии, которые
-- позже удалили у клиента.
INSERT INTO "note_stickers" ("entity", "entity_id", "kind", "text", "color", "created_by_user_id", "created_by_name", "created_at", "dismissed_at", "dismissed_by_name", "source_sticker_id", "source_rental_id")
SELECT 'client', r."client_id", s."kind", s."text", s."color", s."created_by_user_id", s."created_by_name", s."created_at", s."dismissed_at", s."dismissed_by_name", s."id", r."id"
FROM "note_stickers" s
JOIN "rentals" r ON r."id" = s."entity_id"
WHERE s."entity" = 'rental'
  AND s."kind" IN ('note', 'contact')
  -- Служебные пометки («замена скутера: …» и т.п.) ставит система — они про
  -- аренду, не про клиента; переносим только то, что прикрепил человек.
  AND COALESCE(s."created_by_name", '') <> 'система'

  AND r."client_id" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'stickers_client_copy_backfill')
  AND NOT EXISTS (SELECT 1 FROM "note_stickers" c WHERE c."source_sticker_id" = s."id");
--> statement-breakpoint
INSERT INTO "app_settings" ("key", "value") VALUES ('stickers_client_copy_backfill', '2026-10-22')
ON CONFLICT ("key") DO NOTHING;
