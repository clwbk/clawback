CREATE TYPE "public"."approval_decision" AS ENUM('approved', 'denied', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."approval_request_status" AS ENUM('pending', 'approved', 'denied', 'expired', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."ticket_provider" AS ENUM('mock');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('draft', 'created', 'failed');--> statement-breakpoint
CREATE TYPE "public"."tool_risk_class" AS ENUM('safe', 'guarded', 'approval_gated', 'restricted');--> statement-breakpoint
ALTER TYPE "public"."run_status" ADD VALUE 'waiting_for_approval' BEFORE 'completed';--> statement-breakpoint
CREATE TABLE "approval_decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"approval_request_id" text NOT NULL,
	"run_id" text NOT NULL,
	"decision" "approval_decision" NOT NULL,
	"decided_by" text,
	"rationale" text,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"tool_invocation_id" text NOT NULL,
	"tool_name" text NOT NULL,
	"action_type" text NOT NULL,
	"risk_class" "tool_risk_class" NOT NULL,
	"status" "approval_request_status" DEFAULT 'pending' NOT NULL,
	"requested_by" text,
	"approver_scope_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision_due_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ticket_records" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"run_id" text,
	"approval_request_id" text,
	"provider" "ticket_provider" DEFAULT 'mock' NOT NULL,
	"status" "ticket_status" DEFAULT 'draft' NOT NULL,
	"external_ref" text,
	"title" text NOT NULL,
	"summary" text NOT NULL,
	"body_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_records" ADD CONSTRAINT "ticket_records_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_records" ADD CONSTRAINT "ticket_records_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_records" ADD CONSTRAINT "ticket_records_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_records" ADD CONSTRAINT "ticket_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "approval_decisions_approval_request_id_key" ON "approval_decisions" USING btree ("approval_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_run_tool_invocation_key" ON "approval_requests" USING btree ("run_id","tool_invocation_id");