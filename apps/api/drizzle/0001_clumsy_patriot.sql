ALTER TYPE "public"."user_role" ADD VALUE 'creator' BEFORE 'director';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'mechanic';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'accountant';--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_color" text DEFAULT 'blue' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "last_login_at" timestamp with time zone;