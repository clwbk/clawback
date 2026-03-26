import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema, workspaceRoleSchema } from "./common.js";
import { toolRiskClassSchema } from "./tools.js";

export const approvalRequestStatusSchema = z.enum([
  "pending",
  "approved",
  "denied",
  "expired",
  "canceled",
]);

export const approvalDecisionSchema = z.enum(["approved", "denied", "expired", "canceled"]);

export const approvalActionTypeSchema = z.string().min(1);

export const approvalApproverScopeSchema = z.object({
  mode: z.enum(["workspace_admin"]),
  allowed_roles: z.array(workspaceRoleSchema).default(["admin"]),
});

export const approvalRequestRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  run_id: clawbackIdSchema,
  tool_invocation_id: clawbackIdSchema,
  tool_name: z.string().min(1),
  action_type: approvalActionTypeSchema,
  risk_class: toolRiskClassSchema,
  status: approvalRequestStatusSchema,
  requested_by: clawbackIdSchema.nullable(),
  approver_scope: approvalApproverScopeSchema,
  request_payload: z.record(z.string(), z.unknown()),
  decision_due_at: isoTimestampSchema.nullable(),
  resolved_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const approvalDecisionRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  approval_request_id: clawbackIdSchema,
  run_id: clawbackIdSchema,
  decision: approvalDecisionSchema,
  decided_by: clawbackIdSchema.nullable(),
  rationale: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  occurred_at: isoTimestampSchema,
  created_at: isoTimestampSchema,
});

export const approvalPathParamsSchema = z.object({
  approvalId: clawbackIdSchema,
});

export const listApprovalsResponseSchema = z.object({
  approvals: z.array(approvalRequestRecordSchema),
});

export const getApprovalResponseSchema = z.object({
  approval: approvalRequestRecordSchema,
  decisions: z.array(approvalDecisionRecordSchema),
});

export const resolveApprovalRequestSchema = z.object({
  decision: z.enum(["approved", "denied"]),
  rationale: z.string().trim().max(2_000).nullable().optional(),
});
