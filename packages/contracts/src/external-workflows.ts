import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const automationBackendKindSchema = z.enum(["n8n"]);
export const reviewedActionSurfaceSchema = z.enum(["web", "whatsapp", "slack"]);

export const n8nConnectionConfigSchema = z.object({
  base_url: z.string().url(),
  auth_token: z.string().min(1),
  webhook_path_prefix: z.string().min(1).optional(),
});

export const externalWorkflowRequestSchema = z.object({
  backend_kind: automationBackendKindSchema,
  connection_id: clawbackIdSchema,
  workflow_identifier: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export const requestReviewedExternalWorkflowInputSchema = z.object({
  workflow_identifier: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});

export const externalWorkflowResultSchema = z.object({
  response_status_code: z.number().int().nullable(),
  response_summary: z.string().nullable(),
  backend_reference: z.string().nullable(),
});

export const reviewedExternalWorkflowExecutionStatusSchema = z.enum([
  "queued",
  "executing",
  "succeeded",
  "failed",
]);

export const reviewedExternalWorkflowCallbackStatusSchema = z.enum([
  "succeeded",
  "failed",
]);

export const reviewedExternalWorkflowCallbackResultSchema = z.object({
  delivery_id: z.string().min(1),
  status: reviewedExternalWorkflowCallbackStatusSchema,
  response_status_code: z.number().int().nullable(),
  summary: z.string().nullable(),
  backend_reference: z.string().nullable(),
  occurred_at: isoTimestampSchema.nullable(),
  received_at: isoTimestampSchema,
});

export const n8nWebhookCallbackPayloadSchema = z.object({
  delivery_id: z.string().min(1),
  workflow_identifier: z.string().min(1),
  status: reviewedExternalWorkflowCallbackStatusSchema,
  response_status_code: z.number().int().nullable().optional(),
  summary: z.string().nullable().optional(),
  backend_reference: z.string().nullable().optional(),
  occurred_at: isoTimestampSchema.optional(),
  clawback: z.object({
    workspace_id: clawbackIdSchema.optional(),
    review_id: clawbackIdSchema,
    work_item_id: clawbackIdSchema,
  }),
});

export const reviewedExternalWorkflowExecutionRecordSchema = z.object({
  kind: z.literal("reviewed_external_workflow"),
  status: reviewedExternalWorkflowExecutionStatusSchema,
  review_id: clawbackIdSchema,
  review_decision_id: clawbackIdSchema.nullable(),
  approved_via: reviewedActionSurfaceSchema.nullable(),
  backend_kind: automationBackendKindSchema,
  connection_id: clawbackIdSchema,
  connection_label: z.string().min(1),
  workflow_identifier: z.string().min(1),
  request_payload: z.record(z.string(), z.unknown()),
  attempt_count: z.number().int().min(1),
  last_attempted_at: isoTimestampSchema,
  response_status_code: z.number().int().nullable(),
  response_summary: z.string().nullable(),
  backend_reference: z.string().nullable(),
  completed_at: isoTimestampSchema.nullable(),
  failed_at: isoTimestampSchema.nullable(),
  last_error: z.string().nullable(),
  callback_result: reviewedExternalWorkflowCallbackResultSchema.nullable().optional(),
});

export type AutomationBackendKind = z.infer<typeof automationBackendKindSchema>;
export type N8nConnectionConfig = z.infer<typeof n8nConnectionConfigSchema>;
export type ReviewedActionSurface = z.infer<typeof reviewedActionSurfaceSchema>;
export type ExternalWorkflowRequest = z.infer<typeof externalWorkflowRequestSchema>;
export type RequestReviewedExternalWorkflowInput = z.infer<
  typeof requestReviewedExternalWorkflowInputSchema
>;
export type ExternalWorkflowResult = z.infer<typeof externalWorkflowResultSchema>;
export type ReviewedExternalWorkflowExecutionStatus = z.infer<
  typeof reviewedExternalWorkflowExecutionStatusSchema
>;
export type ReviewedExternalWorkflowCallbackStatus = z.infer<
  typeof reviewedExternalWorkflowCallbackStatusSchema
>;
export type ReviewedExternalWorkflowCallbackResult = z.infer<
  typeof reviewedExternalWorkflowCallbackResultSchema
>;
export type N8nWebhookCallbackPayload = z.infer<typeof n8nWebhookCallbackPayloadSchema>;
export type ReviewedExternalWorkflowExecutionRecord = z.infer<
  typeof reviewedExternalWorkflowExecutionRecordSchema
>;
