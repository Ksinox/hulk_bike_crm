CREATE TABLE IF NOT EXISTS "note_stickers" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"kind" text DEFAULT 'note' NOT NULL,
	"text" text NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"created_by_user_id" bigint,
	"created_by_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	"dismissed_by_name" text
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "note_stickers" ADD CONSTRAINT "note_stickers_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_stickers_entity_idx" ON "note_stickers" ("entity","entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "note_stickers_active_idx" ON "note_stickers" ("dismissed_at");
--> statement-breakpoint
INSERT INTO "note_stickers" ("entity","entity_id","kind","text","color","created_by_name","created_at")
SELECT 'rental', r."id", 'note', r."note", 'yellow', 'система', now()
FROM "rentals" r
WHERE r."note" IS NOT NULL AND length(trim(r."note")) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "note_stickers" s
    WHERE s."entity" = 'rental' AND s."entity_id" = r."id" AND s."kind" = 'note'
  );
