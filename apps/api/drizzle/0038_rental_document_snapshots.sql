-- 0038_rental_document_snapshots: сохранённые снапшоты документов аренды
-- (договоры, акты, замены) с привязкой к рендеру на момент сохранения.

CREATE TABLE IF NOT EXISTS "rental_document_snapshots" (
  "id" bigserial PRIMARY KEY,
  "rental_id" bigint NOT NULL REFERENCES "rentals"("id") ON DELETE CASCADE,
  "doc_type" text NOT NULL,
  "title" text NOT NULL,
  "html_file_key" text NOT NULL,
  "docx_file_key" text,
  "size" integer NOT NULL,
  "saved_by_user_login" text,
  "saved_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "rental_doc_snapshots_rental_idx"
  ON "rental_document_snapshots"("rental_id");
CREATE INDEX IF NOT EXISTS "rental_doc_snapshots_saved_at_idx"
  ON "rental_document_snapshots"("saved_at");
