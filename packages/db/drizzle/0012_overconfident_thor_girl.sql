CREATE TYPE "public"."approval_surface_channel" AS ENUM('whatsapp');--> statement-breakpoint
CREATE TYPE "public"."approval_surface_identity_status" AS ENUM('allowed', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('approved', 'denied');--> statement-breakpoint
CREATE TYPE "public"."review_decision_surface" AS ENUM('web', 'whatsapp');--> statement-breakpoint
CREATE TABLE "approval_surface_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"channel" "approval_surface_channel" NOT NULL,
	"user_id" text NOT NULL,
	"external_identity" text NOT NULL,
	"label" text NOT NULL,
	"status" "approval_surface_identity_status" DEFAULT 'allowed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"review_id" text NOT NULL,
	"decision" "review_decision" NOT NULL,
	"surface" "review_decision_surface" NOT NULL,
	"decided_by_user_id" text,
	"actor_external_id" text,
	"rationale" text,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_surface_identities" ADD CONSTRAINT "approval_surface_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_surface_identities" ADD CONSTRAINT "approval_surface_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_review_id_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_surface_identities_workspace_idx" ON "approval_surface_identities" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_surface_identities_workspace_channel_user_key" ON "approval_surface_identities" USING btree ("workspace_id","channel","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_surface_identities_workspace_channel_identity_key" ON "approval_surface_identities" USING btree ("workspace_id","channel","external_identity");--> statement-breakpoint
CREATE INDEX "review_decisions_workspace_idx" ON "review_decisions" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "review_decisions_review_id_key" ON "review_decisions" USING btree ("review_id");