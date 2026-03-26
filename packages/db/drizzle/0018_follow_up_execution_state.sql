ALTER TABLE "work_items"
ADD COLUMN "execution_state_json" jsonb;

ALTER TABLE "inbox_items"
ADD COLUMN "execution_state_json" jsonb;
