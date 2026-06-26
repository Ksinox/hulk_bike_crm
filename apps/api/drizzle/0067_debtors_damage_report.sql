-- Этап 3 акта о повреждениях: прямая связь досудебного дела с актом.
-- damage_report_id в debtors — дело, заведённое «из акта», ссылается на него
-- (показ акта/медиа и печать претензии внутри дела). Идемпотентно.
ALTER TABLE "debtors" ADD COLUMN IF NOT EXISTS "damage_report_id" bigint REFERENCES "damage_reports"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "debtors_damage_report_idx" ON "debtors" ("damage_report_id");
