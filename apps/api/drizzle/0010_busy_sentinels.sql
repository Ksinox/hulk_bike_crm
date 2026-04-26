ALTER TABLE "scooter_models" ALTER COLUMN "short_rate" SET DEFAULT 700;--> statement-breakpoint
ALTER TABLE "scooter_models" ADD COLUMN "day_rate" integer DEFAULT 1300 NOT NULL;