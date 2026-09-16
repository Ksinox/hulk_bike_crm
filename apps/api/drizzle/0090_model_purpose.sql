-- Релиз 2.0.1 (16.09): назначение модели — сдаём в аренду и/или продаём.
-- Заказчик: модель, заведённая под продажу, всплывала в аренде (лендинг,
-- калькулятор), а форма просила для неё тарифы. Теперь у модели два флага.
ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "for_rent" boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE "scooter_models" ADD COLUMN IF NOT EXISTS "for_sale" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
-- Разметка существующих моделей — ОДИН раз (миграции гоняются на каждом
-- старте, повторная разметка перетёрла бы флаги, выставленные вручную):
--  • «продаём» — у модели есть техника на продаже или проданная;
--  • «не сдаём» — техника есть, но вся в продаже/продана/в разборке и ни
--    одной аренды за всё время. Такую модель раньше выключали, чтобы она не
--    лезла в аренду, — теперь её прячет флаг, и в продаже она снова видна.
-- Модели без техники не трогаем: по умолчанию «сдаём в аренду».
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM "app_settings" WHERE "key" = 'model_purpose_backfill') THEN
    UPDATE "scooter_models" m SET "for_sale" = true
    WHERE EXISTS (
      SELECT 1 FROM "scooters" s
      WHERE s."model_id" = m."id" AND s."base_status" IN ('for_sale', 'sold')
    );

    UPDATE "scooter_models" m SET "for_rent" = false, "active" = true
    WHERE EXISTS (SELECT 1 FROM "scooters" s WHERE s."model_id" = m."id")
      AND NOT EXISTS (
        SELECT 1 FROM "scooters" s
        WHERE s."model_id" = m."id"
          AND s."base_status" NOT IN ('for_sale', 'sold', 'disassembly')
      )
      AND NOT EXISTS (
        SELECT 1 FROM "rentals" r
        JOIN "scooters" s ON s."id" = r."scooter_id"
        WHERE s."model_id" = m."id"
      );

    INSERT INTO "app_settings" ("key", "value") VALUES ('model_purpose_backfill', 'done');
  END IF;
END $$;
