-- E1.2: Add triage_json columns for worker decision persistence
-- Canonical triage truth lives on source_events.
-- Denormalized copies on work_items and inbox_items for UI convenience.

ALTER TABLE "source_events" ADD COLUMN "triage_json" jsonb;
ALTER TABLE "work_items" ADD COLUMN "triage_json" jsonb;
ALTER TABLE "inbox_items" ADD COLUMN "triage_json" jsonb;
