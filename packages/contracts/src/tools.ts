import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const toolRiskClassSchema = z.enum([
  "safe",
  "guarded",
  "approval_gated",
  "restricted",
]);

export const toolApprovalRequirementSchema = z.enum(["never", "workspace_admin"]);

export const toolRuleSchema = z.object({
  risk_class: toolRiskClassSchema,
  approval: toolApprovalRequirementSchema.default("never"),
});

export const toolRuleRecordSchema = z.record(z.string(), toolRuleSchema);

export const toolInvocationStatusSchema = z.enum([
  "requested",
  "waiting_for_approval",
  "completed",
  "failed",
]);

export const toolInvocationRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  run_id: clawbackIdSchema,
  tool_name: z.string().min(1),
  risk_class: toolRiskClassSchema,
  status: toolInvocationStatusSchema,
  approval_request_id: clawbackIdSchema.nullable(),
  requested_at: isoTimestampSchema,
  completed_at: isoTimestampSchema.nullable(),
  arguments_json: z.record(z.string(), z.unknown()),
  result_json: z.record(z.string(), z.unknown()).nullable(),
});
