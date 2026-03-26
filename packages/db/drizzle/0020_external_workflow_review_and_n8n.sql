ALTER TYPE "connection_provider" ADD VALUE IF NOT EXISTS 'n8n';

ALTER TYPE "action_capability_kind" ADD VALUE IF NOT EXISTS 'run_external_workflow';

ALTER TYPE "review_action_kind" ADD VALUE IF NOT EXISTS 'run_external_workflow';

ALTER TABLE "reviews"
ADD COLUMN "request_payload_json" jsonb;
