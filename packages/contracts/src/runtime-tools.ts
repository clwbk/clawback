import { z } from "zod";

import { approvalRequestRecordSchema } from "./approvals.js";
import { isoTimestampSchema } from "./common.js";
import { ticketDraftSchema, ticketLookupResultSchema, ticketRecordSchema } from "./tickets.js";

export const runtimeToolAuthHeaderSchema = z.object({
  authorization: z.string().min(1),
});

export const runtimeToolSessionSchema = z.object({
  runtime_session_key: z.string().min(1),
  tool_invocation_id: z.string().min(1),
});

export const runtimeTicketLookupRequestSchema = runtimeToolSessionSchema.extend({
  query: z.string().trim().min(1).max(500).optional(),
  limit: z.number().int().positive().max(20).optional(),
});

export const runtimeTicketLookupResponseSchema = z.object({
  results: z.array(ticketLookupResultSchema),
});

export const runtimeDraftTicketRequestSchema = runtimeToolSessionSchema.extend({
  draft: ticketDraftSchema,
});

export const runtimeDraftTicketResponseSchema = z.object({
  draft_ticket: ticketRecordSchema,
});

export const runtimeCreateTicketRequestSchema = runtimeToolSessionSchema.extend({
  draft: ticketDraftSchema,
  wait_timeout_ms: z.number().int().positive().max(15 * 60 * 1000).optional(),
  poll_interval_ms: z.number().int().positive().max(10_000).optional(),
});

export const runtimeCreateTicketResponseSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("created"),
    ticket: ticketRecordSchema,
    approval: approvalRequestRecordSchema,
  }),
  z.object({
    status: z.literal("denied"),
    approval: approvalRequestRecordSchema,
    rationale: z.string().nullable(),
  }),
  z.object({
    status: z.literal("expired"),
    approval: approvalRequestRecordSchema,
    rationale: z.string().nullable(),
  }),
  z.object({
    status: z.literal("pending"),
    approval: approvalRequestRecordSchema,
    retry_after_ms: z.number().int().positive(),
    checked_at: isoTimestampSchema,
  }),
]);
