import { z } from "zod";

import {
  clawbackIdSchema,
  isoTimestampSchema,
  userRefSchema,
  workspaceRefSchema,
  workspaceRoleSchema,
} from "./common.js";

export const bootstrapAdminRequestSchema = z.object({
  workspace_name: z.string().min(1),
  workspace_slug: z.string().min(1),
  email: z.email(),
  display_name: z.string().min(1),
  password: z.string().min(8),
});

export const loginRequestSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export const sessionResponseSchema = z.object({
  user: userRefSchema,
  workspace: workspaceRefSchema,
  membership: z.object({
    role: workspaceRoleSchema,
  }),
});

export const authenticatedSessionResponseSchema = sessionResponseSchema.extend({
  csrf_token: z.string().min(1),
});

export const setupStatusResponseSchema = z.object({
  bootstrapped: z.boolean(),
});

export const createInvitationRequestSchema = z.object({
  email: z.email(),
  role: workspaceRoleSchema,
  expires_at: isoTimestampSchema.optional(),
});

export const claimInvitationRequestSchema = z.object({
  token: z.string().min(1),
  display_name: z.string().min(1),
  password: z.string().min(8),
});

export const invitationSchema = z.object({
  id: clawbackIdSchema,
  email: z.email(),
  role: workspaceRoleSchema,
  expires_at: isoTimestampSchema,
  accepted_at: isoTimestampSchema.nullable(),
  created_at: isoTimestampSchema,
});

export const createInvitationResponseSchema = z.object({
  invitation: invitationSchema,
  token: z.string().min(1),
});
