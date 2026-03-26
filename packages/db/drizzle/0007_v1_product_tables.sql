-- V1 product tables: workers, input_routes, connections, action_capabilities,
-- work_items, inbox_items, reviews, activity_events

-- Enums
DO $$ BEGIN
  CREATE TYPE "worker_kind" AS ENUM ('follow_up', 'proposal', 'incident', 'bugfix');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "worker_scope" AS ENUM ('personal', 'shared');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "worker_status" AS ENUM ('draft', 'active', 'paused');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "input_route_kind" AS ENUM ('chat', 'forward_email', 'watched_inbox', 'upload', 'schedule', 'webhook');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "input_route_status" AS ENUM ('inactive', 'active', 'suggested');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "connection_provider" AS ENUM ('gmail', 'calendar', 'drive', 'github', 'ticketing');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "connection_access_mode" AS ENUM ('read_only', 'write_capable');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "connection_status" AS ENUM ('not_connected', 'suggested', 'connected', 'error');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "action_capability_kind" AS ENUM ('send_email', 'save_work', 'create_ticket', 'open_pr');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "boundary_mode" AS ENUM ('auto', 'ask_me', 'never');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "work_item_kind" AS ENUM ('email_draft', 'sent_update', 'proposal_draft', 'ticket_draft', 'created_ticket', 'pr_draft', 'action_plan', 'meeting_recap');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "work_item_status" AS ENUM ('draft', 'pending_review', 'completed', 'sent', 'created', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "inbox_item_kind" AS ENUM ('review', 'shadow', 'setup', 'boundary');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "inbox_item_state" AS ENUM ('open', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "review_action_kind" AS ENUM ('send_email', 'save_work', 'create_ticket', 'open_pr');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "review_status" AS ENUM ('pending', 'approved', 'denied', 'expired', 'failed', 'completed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Tables

CREATE TABLE IF NOT EXISTS "workers" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "kind" "worker_kind" NOT NULL,
  "scope" "worker_scope" NOT NULL,
  "status" "worker_status" NOT NULL DEFAULT 'draft',
  "summary" text,
  "member_ids" jsonb NOT NULL DEFAULT '[]',
  "assignee_ids" jsonb NOT NULL DEFAULT '[]',
  "reviewer_ids" jsonb NOT NULL DEFAULT '[]',
  "input_route_ids" jsonb NOT NULL DEFAULT '[]',
  "connection_ids" jsonb NOT NULL DEFAULT '[]',
  "action_ids" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "workers_workspace_slug_key" ON "workers" ("workspace_id", "slug");
CREATE INDEX IF NOT EXISTS "workers_workspace_idx" ON "workers" ("workspace_id");

CREATE TABLE IF NOT EXISTS "input_routes" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "worker_id" text NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "kind" "input_route_kind" NOT NULL,
  "status" "input_route_status" NOT NULL DEFAULT 'inactive',
  "label" text NOT NULL,
  "description" text,
  "address" text,
  "capability_note" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "input_routes_worker_idx" ON "input_routes" ("worker_id");
CREATE INDEX IF NOT EXISTS "input_routes_workspace_idx" ON "input_routes" ("workspace_id");

CREATE TABLE IF NOT EXISTS "connections" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "provider" "connection_provider" NOT NULL,
  "access_mode" "connection_access_mode" NOT NULL,
  "status" "connection_status" NOT NULL DEFAULT 'not_connected',
  "label" text NOT NULL,
  "capabilities" jsonb NOT NULL DEFAULT '[]',
  "attached_worker_ids" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "connections_workspace_idx" ON "connections" ("workspace_id");

CREATE TABLE IF NOT EXISTS "action_capabilities" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "worker_id" text NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "kind" "action_capability_kind" NOT NULL,
  "boundary_mode" "boundary_mode" NOT NULL DEFAULT 'ask_me',
  "reviewer_ids" jsonb NOT NULL DEFAULT '[]',
  "destination_connection_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "action_capabilities_worker_idx" ON "action_capabilities" ("worker_id");
CREATE INDEX IF NOT EXISTS "action_capabilities_workspace_idx" ON "action_capabilities" ("workspace_id");

CREATE TABLE IF NOT EXISTS "work_items" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "worker_id" text NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "kind" "work_item_kind" NOT NULL,
  "status" "work_item_status" NOT NULL DEFAULT 'draft',
  "title" text NOT NULL,
  "summary" text,
  "assignee_ids" jsonb NOT NULL DEFAULT '[]',
  "reviewer_ids" jsonb NOT NULL DEFAULT '[]',
  "source_route_kind" "input_route_kind",
  "source_event_id" text,
  "review_id" text,
  "run_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "work_items_workspace_idx" ON "work_items" ("workspace_id");
CREATE INDEX IF NOT EXISTS "work_items_worker_idx" ON "work_items" ("worker_id");
CREATE INDEX IF NOT EXISTS "work_items_workspace_status_idx" ON "work_items" ("workspace_id", "status");

CREATE TABLE IF NOT EXISTS "inbox_items" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "kind" "inbox_item_kind" NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "assignee_ids" jsonb NOT NULL DEFAULT '[]',
  "worker_id" text,
  "work_item_id" text,
  "review_id" text,
  "route_kind" "input_route_kind",
  "state" "inbox_item_state" NOT NULL DEFAULT 'open',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "inbox_items_workspace_idx" ON "inbox_items" ("workspace_id");
CREATE INDEX IF NOT EXISTS "inbox_items_workspace_state_idx" ON "inbox_items" ("workspace_id", "state");

CREATE TABLE IF NOT EXISTS "reviews" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "action_kind" "review_action_kind" NOT NULL,
  "review_status" "review_status" NOT NULL DEFAULT 'pending',
  "worker_id" text NOT NULL REFERENCES "workers"("id") ON DELETE CASCADE,
  "work_item_id" text,
  "reviewer_ids" jsonb NOT NULL DEFAULT '[]',
  "assignee_ids" jsonb NOT NULL DEFAULT '[]',
  "source_route_kind" "input_route_kind",
  "action_destination" text,
  "requested_at" timestamp with time zone NOT NULL,
  "resolved_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "reviews_workspace_idx" ON "reviews" ("workspace_id");
CREATE INDEX IF NOT EXISTS "reviews_workspace_status_idx" ON "reviews" ("workspace_id", "review_status");
CREATE INDEX IF NOT EXISTS "reviews_worker_idx" ON "reviews" ("worker_id");

CREATE TABLE IF NOT EXISTS "activity_events" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "timestamp" timestamp with time zone NOT NULL,
  "worker_id" text,
  "route_kind" "input_route_kind",
  "result_kind" text NOT NULL,
  "title" text NOT NULL,
  "summary" text,
  "assignee_ids" jsonb NOT NULL DEFAULT '[]',
  "run_id" text,
  "work_item_id" text,
  "review_id" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "activity_events_workspace_idx" ON "activity_events" ("workspace_id");
CREATE INDEX IF NOT EXISTS "activity_events_workspace_timestamp_idx" ON "activity_events" ("workspace_id", "timestamp");
