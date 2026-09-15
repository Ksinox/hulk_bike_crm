-- 15.09: переход на личные аккаунты. Общий аккаунт «Администратор Никита»
-- (логин admin) становится личным аккаунтом Никиты — решение заказчика.
-- Миграции прогоняются при каждом старте, поэтому всё под защитой: имя
-- меняется, только пока оно ещё старое, запись в журнал — один раз.
-- Пароль здесь НЕ трогаем: его задаёт директор в «Сотрудниках».
UPDATE "users"
   SET "name" = 'Никита',
       "staff_kind" = COALESCE("staff_kind", 'existing')
 WHERE "login" = 'admin'
   AND "name" = 'Администратор Никита';
--> statement-breakpoint
INSERT INTO "activity_log" ("user_name", "entity", "entity_id", "action", "summary")
SELECT 'система', 'user', u."id", 'updated',
       'Аккаунт «Администратор Никита» переименован в «Никита» при переходе на личные аккаунты'
  FROM "users" u
 WHERE u."login" = 'admin'
   AND u."name" = 'Никита'
   AND NOT EXISTS (
     SELECT 1 FROM "activity_log" a
      WHERE a."entity" = 'user'
        AND a."action" = 'updated'
        AND a."summary" LIKE 'Аккаунт «Администратор Никита» переименован%'
   );
