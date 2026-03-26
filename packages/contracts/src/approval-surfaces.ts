import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { reviewDecisionRecordSchema, reviewRecordSchema } from "./reviews.js";

export const approvalSurfaceChannelSchema = z.enum(["whatsapp", "slack"]);

export const approvalSurfaceIdentityStatusSchema = z.enum(["allowed", "disabled"]);

export const approvalSurfaceIdentityRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  channel: approvalSurfaceChannelSchema,
  user_id: clawbackIdSchema,
  external_identity: z.string().min(1),
  label: z.string().min(1),
  status: approvalSurfaceIdentityStatusSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const approvalSurfaceIdentityListResponseSchema = z.object({
  identities: z.array(approvalSurfaceIdentityRecordSchema),
});

export const createApprovalSurfaceIdentityRequestSchema = z.object({
  channel: approvalSurfaceChannelSchema,
  user_id: clawbackIdSchema,
  external_identity: z.string().trim().min(1).max(256),
  label: z.string().trim().min(1).max(256).optional(),
});

export const updateApprovalSurfaceIdentityRequestSchema = z.object({
  external_identity: z.string().trim().min(1).max(256).optional(),
  label: z.string().trim().min(1).max(256).optional(),
  status: approvalSurfaceIdentityStatusSchema.optional(),
});

export const reviewSurfaceResolveRequestSchema = z.object({
  approval_token: z.string().trim().min(1),
  actor_identity: z.string().trim().min(1).max(256),
  rationale: z.string().trim().max(2_000).nullable().optional(),
  interaction_id: z.string().trim().min(1).max(256).nullable().optional(),
});

export const reviewSurfaceResolveResponseSchema = z.object({
  review: reviewRecordSchema,
  decision: reviewDecisionRecordSchema.nullable(),
  already_resolved: z.boolean(),
});

export type ApprovalSurfaceChannel = z.infer<typeof approvalSurfaceChannelSchema>;
export type ApprovalSurfaceIdentityStatus = z.infer<typeof approvalSurfaceIdentityStatusSchema>;
export type ApprovalSurfaceIdentityRecord = z.infer<typeof approvalSurfaceIdentityRecordSchema>;
export type ApprovalSurfaceIdentityListResponse = z.infer<typeof approvalSurfaceIdentityListResponseSchema>;
export type CreateApprovalSurfaceIdentityRequest = z.infer<typeof createApprovalSurfaceIdentityRequestSchema>;
export type UpdateApprovalSurfaceIdentityRequest = z.infer<typeof updateApprovalSurfaceIdentityRequestSchema>;
export type ReviewSurfaceResolveRequest = z.infer<typeof reviewSurfaceResolveRequestSchema>;
export type ReviewSurfaceResolveResponse = z.infer<typeof reviewSurfaceResolveResponseSchema>;
