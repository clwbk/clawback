import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { connectionStatusSchema } from "./connections.js";

export const gmailPilotScopeKindSchema = z.enum([
  "shared_mailbox",
  "selected_mailboxes",
  "broad_read_only",
]);

export const gmailPilotAuthMethodSchema = z.enum([
  "oauth",
  "service_account",
]);

export type GmailPilotAuthMethod = z.infer<typeof gmailPilotAuthMethodSchema>;

export const gmailPilotWatchStatusSchema = z.enum([
  "idle",
  "bootstrapping",
  "polling",
  "error",
]);

export type GmailPilotWatchStatus = z.infer<typeof gmailPilotWatchStatusSchema>;

export const gmailPilotSetupSummarySchema = z.object({
  connection_id: clawbackIdSchema,
  status: connectionStatusSchema,
  configured: z.boolean(),
  auth_method: gmailPilotAuthMethodSchema.nullable(),
  scope_kind: gmailPilotScopeKindSchema.nullable(),
  mailbox_addresses: z.array(z.string().email()),
  validated_email: z.string().email().nullable(),
  last_validated_at: isoTimestampSchema.nullable(),
  last_error: z.string().nullable(),
  client_id_present: z.boolean(),
  client_secret_present: z.boolean(),
  refresh_token_present: z.boolean(),
  service_account_present: z.boolean(),
  oauth_app_configured: z.boolean(),
  watch_status: gmailPilotWatchStatusSchema.nullable(),
  watch_last_checked_at: isoTimestampSchema.nullable(),
  watch_last_success_at: isoTimestampSchema.nullable(),
  watch_last_message_at: isoTimestampSchema.nullable(),
  watch_last_error: z.string().nullable(),
  watch_checkpoint_present: z.boolean(),
});

export type GmailPilotScopeKind = z.infer<typeof gmailPilotScopeKindSchema>;
export type GmailPilotSetupSummary = z.infer<typeof gmailPilotSetupSummarySchema>;

export const gmailPilotSetupResponseSchema = z.object({
  setup: gmailPilotSetupSummarySchema,
});

export type GmailPilotSetupResponse = z.infer<typeof gmailPilotSetupResponseSchema>;

export const gmailPilotPollTriggerSchema = z.enum([
  "manual",
  "background",
]);

export type GmailPilotPollTrigger = z.infer<typeof gmailPilotPollTriggerSchema>;

export const gmailPilotPollResultSchema = z.object({
  connection_id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  trigger: gmailPilotPollTriggerSchema,
  watch_status: gmailPilotWatchStatusSchema,
  bootstrapped: z.boolean(),
  processed_messages: z.number().int().nonnegative(),
  created_results: z.number().int().nonnegative(),
  deduplicated_results: z.number().int().nonnegative(),
  attached_worker_ids: z.array(clawbackIdSchema),
  last_checked_at: isoTimestampSchema.nullable(),
  last_success_at: isoTimestampSchema.nullable(),
  last_message_at: isoTimestampSchema.nullable(),
  last_error: z.string().nullable(),
});

export type GmailPilotPollResult = z.infer<typeof gmailPilotPollResultSchema>;

export const gmailPilotPollResponseSchema = z.object({
  poll: gmailPilotPollResultSchema,
});

export type GmailPilotPollResponse = z.infer<typeof gmailPilotPollResponseSchema>;
