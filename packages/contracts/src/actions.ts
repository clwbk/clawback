import { z } from "zod";

import {
  approvalApproverScopeSchema,
  approvalDecisionRecordSchema,
  approvalRequestStatusSchema,
} from "./approvals.js";
import { artifactKindSchema } from "./artifacts.js";
import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { toolRiskClassSchema } from "./tools.js";

export const actionPathParamsSchema = z.object({
  actionId: clawbackIdSchema,
});

export const actionRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  run_id: clawbackIdSchema,
  kind: z.string().min(1),
  tool_name: z.string().min(1),
  risk_class: toolRiskClassSchema,
  status: approvalRequestStatusSchema,
  title: z.string().nullable(),
  summary: z.string().nullable(),
  review_request_id: clawbackIdSchema.nullable(),
  result_artifact_id: clawbackIdSchema.nullable(),
  result_artifact_kind: artifactKindSchema.nullable(),
  result_reference: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const listActionsResponseSchema = z.object({
  actions: z.array(actionRecordSchema),
});

export const getActionResponseSchema = z.object({
  action: actionRecordSchema.extend({
    approver_scope: approvalApproverScopeSchema,
    request_payload: z.record(z.string(), z.unknown()),
    resolved_at: isoTimestampSchema.nullable(),
  }),
  decisions: z.array(approvalDecisionRecordSchema),
});

// --- V1 Worker Action Capabilities ---

export const actionCapabilityKindSchema = z.enum([
  "send_email",
  "run_external_workflow",
  "save_work",
  "create_ticket",
  "open_pr",
]);

export const boundaryModeSchema = z.enum(["auto", "ask_me", "never"]);

export const actionCapabilityRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  worker_id: clawbackIdSchema,
  kind: actionCapabilityKindSchema,
  boundary_mode: boundaryModeSchema,
  reviewer_ids: z.array(clawbackIdSchema),
  destination_connection_id: clawbackIdSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type ActionCapabilityKind = z.infer<typeof actionCapabilityKindSchema>;
export type BoundaryMode = z.infer<typeof boundaryModeSchema>;
export type ActionCapabilityRecord = z.infer<typeof actionCapabilityRecordSchema>;

export const actionCapabilityListResponseSchema = z.object({
  action_capabilities: z.array(actionCapabilityRecordSchema),
});

export type ActionCapabilityListResponse = z.infer<typeof actionCapabilityListResponseSchema>;
