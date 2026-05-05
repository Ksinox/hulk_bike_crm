-- v0.4.21 — настройки графика работы магазина.
-- Используются в почасовом графике выручки (день) и для плановой
-- логики «когда клиенты могут возвращаться/брать скутер».
INSERT INTO "app_settings" ("key", "value")
    VALUES ('work_hours_start', '9')
    ON CONFLICT (key) DO NOTHING;
INSERT INTO "app_settings" ("key", "value")
    VALUES ('work_hours_end', '22')
    ON CONFLICT (key) DO NOTHING;
