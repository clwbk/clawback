ALTER TABLE "work_items"
ADD COLUMN IF NOT EXISTS "source_inbox_item_id" text;

CREATE UNIQUE INDEX IF NOT EXISTS "work_items_source_inbox_item_id_key"
ON "work_items" ("source_inbox_item_id");
