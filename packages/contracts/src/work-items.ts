import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { executionContinuityStateSchema } from "./execution-continuity.js";
import { reviewedExternalWorkflowExecutionRecordSchema } from "./external-workflows.js";
import { inputRouteKindSchema } from "./input-routes.js";
import { reviewedSendExecutionRecordSchema } from "./reviewed-send-outcome.js";
import { workerTriageRecordSchema } from "./worker-decisions.js";

export const workItemKindSchema = z.enum([
  "email_draft",
  "sent_update",
  "proposal_draft",
  "ticket_draft",
  "created_ticket",
  "pr_draft",
  "action_plan",
  "meeting_recap",
]);

export const workItemStatusSchema = z.enum([
  "draft",
  "pending_review",
  "approved",
  "completed",
  "sent",
  "created",
  "failed",
]);

export const workItemExecutionStatusSchema = z.enum([
  "not_requested",
  "queued",
  "executing",
  "completed",
  "failed",
]);

export const workItemExecutionOutcomeSchema = z.discriminatedUnion("kind", [
  reviewedSendExecutionRecordSchema,
  reviewedExternalWorkflowExecutionRecordSchema,
]);

/**
 * `work_item.execution_state_json` is the authoritative persisted execution
 * continuity record. UI-oriented read models may mirror it, but they must not
 * become a second execution authority.
 */
export const workItemExecutionContinuitySchema = executionContinuityStateSchema;

export const workItemRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  worker_id: clawbackIdSchema,
  kind: workItemKindSchema,
  status: workItemStatusSchema,
  title: z.string().min(1),
  summary: z.string().nullable(),
  assignee_ids: z.array(clawbackIdSchema),
  reviewer_ids: z.array(clawbackIdSchema),
  source_route_kind: inputRouteKindSchema.nullable(),
  source_event_id: clawbackIdSchema.nullable(),
  source_inbox_item_id: clawbackIdSchema.nullable().optional(),
  review_id: clawbackIdSchema.nullable(),
  run_id: clawbackIdSchema.nullable(),
  draft_to: z.string().nullable(),
  draft_subject: z.string().nullable(),
  draft_body: z.string().nullable(),
  execution_status: workItemExecutionStatusSchema,
  execution_error: z.string().nullable(),
  triage_json: workerTriageRecordSchema.nullable(),
  execution_state_json: workItemExecutionContinuitySchema.nullable().optional(),
  execution_outcome_json: workItemExecutionOutcomeSchema.nullable().optional(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type WorkItemKind = z.infer<typeof workItemKindSchema>;
export type WorkItemStatus = z.infer<typeof workItemStatusSchema>;
export type WorkItemExecutionStatus = z.infer<typeof workItemExecutionStatusSchema>;
export type WorkItemExecutionOutcome = z.infer<typeof workItemExecutionOutcomeSchema>;
export type WorkItemExecutionContinuityRecord = z.infer<typeof workItemExecutionContinuitySchema>;
export type WorkItemRecord = z.infer<typeof workItemRecordSchema>;
export type WorkItemAuthorityRecord = WorkItemRecord;

export const workItemListResponseSchema = z.object({
  work_items: z.array(workItemRecordSchema),
});

export type WorkItemListResponse = z.infer<typeof workItemListResponseSchema>;

export const getWorkItemResponseSchema = workItemRecordSchema;
export type GetWorkItemResponse = z.infer<typeof getWorkItemResponseSchema>;
