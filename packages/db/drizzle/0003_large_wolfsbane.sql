ALTER TABLE "run_events" ADD COLUMN "actor_type" "audit_actor_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "run_events" ADD COLUMN "actor_id" text NOT NULL;