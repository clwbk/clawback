ALTER TYPE "public"."approval_surface_channel" ADD VALUE IF NOT EXISTS 'slack';--> statement-breakpoint
ALTER TYPE "public"."review_decision_surface" ADD VALUE IF NOT EXISTS 'slack';
