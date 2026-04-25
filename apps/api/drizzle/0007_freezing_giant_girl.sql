ALTER TABLE "clients" ADD COLUMN "is_foreigner" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "passport_raw" text;