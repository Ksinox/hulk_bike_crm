-- Личные аккаунты (14.09): должность словами, права на щепетильные данные,
-- выход на всех устройствах и ответ «новый сотрудник или уже работает».
-- Пароль сотрудника задаёт директор, поэтому при создании смену пароля
-- больше не требуем.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "position" text;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "permissions" jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "session_version" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "staff_kind" text;
