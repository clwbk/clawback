CREATE TYPE "public"."source_event_kind" AS ENUM('forwarded_email', 'watched_inbox', 'chat_input', 'upload', 'schedule', 'webhook');--> statement-breakpoint
CREATE TABLE "source_events" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"input_route_id" text,
	"kind" "source_event_kind" NOT NULL,
	"external_message_id" text,
	"from_address" text,
	"to_address" text,
	"subject" text,
	"body_text" text,
	"body_html" text,
	"attachments_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"raw_payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_events" ADD CONSTRAINT "source_events_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_events_workspace_idx" ON "source_events" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "source_events_worker_idx" ON "source_events" USING btree ("worker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "source_events_external_message_id_key" ON "source_events" USING btree ("workspace_id","external_message_id");
