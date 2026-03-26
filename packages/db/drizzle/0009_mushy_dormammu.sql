CREATE TYPE "public"."work_item_execution_status" AS ENUM('not_requested', 'queued', 'executing', 'completed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."connection_provider" ADD VALUE 'smtp_relay' BEFORE 'calendar';--> statement-breakpoint
ALTER TYPE "public"."work_item_status" ADD VALUE 'approved' BEFORE 'completed';--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "draft_to" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "draft_subject" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "draft_body" text;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "execution_status" "work_item_execution_status" DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE "work_items" ADD COLUMN "execution_error" text;