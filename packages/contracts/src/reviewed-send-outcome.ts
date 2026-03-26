import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { reviewDecisionSurfaceSchema } from "./reviews.js";

export const reviewedSendTransportSchema = z.enum(["smtp_relay"]);

export const reviewedSendExecutionStatusSchema = z.enum([
  "queued",
  "executing",
  "sent",
  "failed",
]);

export const reviewedSendExecutionRecordSchema = z.object({
  kind: z.literal("reviewed_send_email"),
  status: reviewedSendExecutionStatusSchema,
  review_id: clawbackIdSchema,
  review_decision_id: clawbackIdSchema.nullable(),
  approved_via: reviewDecisionSurfaceSchema.nullable(),
  transport: reviewedSendTransportSchema,
  connection_id: clawbackIdSchema,
  connection_label: z.string().min(1),
  attempt_count: z.number().int().min(1),
  last_attempted_at: isoTimestampSchema,
  provider_message_id: z.string().nullable(),
  sent_at: isoTimestampSchema.nullable(),
  failed_at: isoTimestampSchema.nullable(),
  last_error: z.string().nullable(),
  error_classification: z.enum(["transient", "permanent"]).nullable().optional(),
});

export type ReviewedSendTransport = z.infer<typeof reviewedSendTransportSchema>;
export type ReviewedSendExecutionStatus = z.infer<typeof reviewedSendExecutionStatusSchema>;
export type ReviewedSendExecutionRecord = z.infer<typeof reviewedSendExecutionRecordSchema>;
