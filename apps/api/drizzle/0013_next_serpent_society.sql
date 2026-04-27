ALTER TABLE "payments" ADD COLUMN "received_by_user_id" bigint;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "damage_report_id" bigint;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
