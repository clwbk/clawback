-- R1.2: Add contacts and accounts tables for relationship memory

DO $$ BEGIN
  CREATE TYPE "relationship_class" AS ENUM ('customer', 'prospect', 'vendor', 'internal', 'blocked', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "accounts" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "primary_domain" text,
  "relationship_class" "relationship_class",
  "owner_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "handling_note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "contacts" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "primary_email" text NOT NULL,
  "display_name" text NOT NULL,
  "account_id" text REFERENCES "accounts"("id") ON DELETE SET NULL,
  "relationship_class" "relationship_class",
  "owner_user_id" text REFERENCES "users"("id") ON DELETE SET NULL,
  "handling_note" text,
  "do_not_auto_reply" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "contacts_workspace_email_key" ON "contacts" ("workspace_id", "primary_email");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contacts_workspace_idx" ON "contacts" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_workspace_idx" ON "accounts" ("workspace_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accounts_workspace_domain_idx" ON "accounts" ("workspace_id", "primary_domain");
