-- v0.2.75: реакция клиента на акт о повреждениях.
-- Возможные значения: 'pending' (создан, реакции нет) | 'agreed' | 'disputed'.
DO $$ BEGIN
 ALTER TABLE "damage_reports" ADD COLUMN "client_agreement" text DEFAULT 'pending' NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
