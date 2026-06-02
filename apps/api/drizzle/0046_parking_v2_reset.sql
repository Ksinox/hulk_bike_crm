-- v0.8.28 (H1): одноразовая чистка паркингов под новую (открытую) модель.
-- Старые сессии создавались с фиксированным периодом; чтобы не мешали тестам
-- новой логики — удаляем все парковочные сессии и parking-стикеры ОДИН раз
-- (guard через app_settings, иначе DELETE повторялся бы на каждом деплое и
-- сносил новые парковки). Новые сессии создаются после деплоя и не трогаются.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'parking_v2_reset') THEN
    DELETE FROM "note_stickers" WHERE "kind" = 'parking';
    DELETE FROM "parking_sessions";
    INSERT INTO "app_settings" ("key", "value") VALUES ('parking_v2_reset', 'done');
  END IF;
END $$;
