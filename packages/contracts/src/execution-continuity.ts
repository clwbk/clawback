import { z } from "zod";

import { clawbackIdSchema } from "./common.js";
import { decisionKindSchema } from "./worker-decisions.js";

export const executionContinuityFamilySchema = z.enum([
  "governed_action",
]);

export const executionContinuityStatusSchema = z.enum([
  "running",
  "waiting_review",
  "completed",
  "failed",
]);

export const executionContinuityStepSchema = z.enum([
  "wait_for_review",
  "resume_after_review",
  "resume_after_route_confirmation",
  "execute_action",
  "record_outcome",
]);

export const executionContinuityPauseReasonSchema = z.enum([
  "human_review",
  "route_confirmation",
]);

export const executionContinuityResumeReasonSchema = z.enum([
  "review_approved",
  "review_denied",
  "route_confirmed",
]);

const normalizedExecutionContinuityStateSchema = z.object({
  continuity_family: executionContinuityFamilySchema,
  state: executionContinuityStatusSchema,
  current_step: executionContinuityStepSchema,
  pause_reason: executionContinuityPauseReasonSchema.nullable(),
  resume_reason: executionContinuityResumeReasonSchema.nullable(),
  last_decision: decisionKindSchema.nullable(),
  target_worker_id: clawbackIdSchema.nullable(),
  downstream_work_item_id: clawbackIdSchema.nullable(),
});

const legacyFollowUpExecutionStateInputSchema = z.object({
  worker_kind: z.literal("follow_up"),
  state: executionContinuityStatusSchema,
  current_step: executionContinuityStepSchema,
  pause_reason: executionContinuityPauseReasonSchema.nullable(),
  resume_reason: executionContinuityResumeReasonSchema.nullable(),
  last_decision: decisionKindSchema.nullable(),
  target_worker_id: clawbackIdSchema.nullable().optional(),
  downstream_work_item_id: clawbackIdSchema.nullable().optional(),
});

type NormalizedExecutionContinuityStateRecord = z.infer<
  typeof normalizedExecutionContinuityStateSchema
>;
type LegacyFollowUpExecutionStateInput = z.infer<
  typeof legacyFollowUpExecutionStateInputSchema
>;

/**
 * Shared persisted execution continuity for governed worker execution.
 *
 * The platform stores a narrow, product-semantic pause/resume record here.
 * Worker-private progression stays outside this schema.
 *
 * Compatibility note:
 * older Follow-Up records persisted `worker_kind: "follow_up"`. The schema
 * still accepts that legacy input and normalizes it to the worker-neutral
 * `continuity_family: "governed_action"` shape.
 */
export const executionContinuityStateSchema = z.union([
  normalizedExecutionContinuityStateSchema,
  legacyFollowUpExecutionStateInputSchema,
]).transform((value): NormalizedExecutionContinuityStateRecord => {
  if ("continuity_family" in value) {
    return value;
  }

  return {
    continuity_family: "governed_action",
    state: value.state,
    current_step: value.current_step,
    pause_reason: value.pause_reason,
    resume_reason: value.resume_reason,
    last_decision: value.last_decision,
    target_worker_id: value.target_worker_id ?? null,
    downstream_work_item_id: value.downstream_work_item_id ?? null,
  };
});

export type ExecutionContinuityFamily = z.infer<typeof executionContinuityFamilySchema>;
export type ExecutionContinuityStatus = z.infer<typeof executionContinuityStatusSchema>;
export type ExecutionContinuityStep = z.infer<typeof executionContinuityStepSchema>;
export type ExecutionContinuityPauseReason = z.infer<
  typeof executionContinuityPauseReasonSchema
>;
export type ExecutionContinuityResumeReason = z.infer<
  typeof executionContinuityResumeReasonSchema
>;
export type ExecutionContinuityStateRecord = z.infer<typeof executionContinuityStateSchema>;
