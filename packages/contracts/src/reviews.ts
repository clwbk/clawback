import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { externalWorkflowRequestSchema } from "./external-workflows.js";
import { inputRouteKindSchema } from "./input-routes.js";

export const reviewActionKindSchema = z.enum([
  "send_email",
  "run_external_workflow",
  "save_work",
  "create_ticket",
  "open_pr",
]);

export const reviewStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "failed",
  "completed",
]);

export const reviewRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  action_kind: reviewActionKindSchema,
  status: reviewStatusSchema,
  worker_id: clawbackIdSchema,
  work_item_id: clawbackIdSchema.nullable(),
  reviewer_ids: z.array(clawbackIdSchema),
  assignee_ids: z.array(clawbackIdSchema),
  source_route_kind: inputRouteKindSchema.nullable(),
  action_destination: z.string().nullable(),
  request_payload: externalWorkflowRequestSchema.nullable().optional(),
  requested_at: isoTimestampSchema,
  resolved_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const reviewDecisionSurfaceSchema = z.enum(["web", "whatsapp", "slack"]);

export const reviewDecisionRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  review_id: clawbackIdSchema,
  decision: z.enum(["approved", "denied"]),
  surface: reviewDecisionSurfaceSchema,
  decided_by_user_id: clawbackIdSchema.nullable(),
  actor_external_id: z.string().nullable(),
  rationale: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  occurred_at: isoTimestampSchema,
  created_at: isoTimestampSchema,
});

export type ReviewActionKind = z.infer<typeof reviewActionKindSchema>;
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
export type ReviewDecisionSurface = z.infer<typeof reviewDecisionSurfaceSchema>;
export type ReviewDecisionRecord = z.infer<typeof reviewDecisionRecordSchema>;

export const reviewListResponseSchema = z.object({
  reviews: z.array(reviewRecordSchema),
});

export type ReviewListResponse = z.infer<typeof reviewListResponseSchema>;

export const getReviewResponseSchema = reviewRecordSchema;
export type GetReviewResponse = z.infer<typeof getReviewResponseSchema>;

export const getReviewDecisionResponseSchema = reviewDecisionRecordSchema;
export type GetReviewDecisionResponse = z.infer<typeof getReviewDecisionResponseSchema>;
