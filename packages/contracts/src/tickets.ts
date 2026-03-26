import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const ticketProviderSchema = z.enum(["mock"]);
export const ticketRecordStatusSchema = z.enum(["draft", "created", "failed"]);

export const ticketPathParamsSchema = z.object({
  ticketId: clawbackIdSchema,
});

export const ticketLookupResultSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().min(1),
  status: z.string().min(1),
  notes: z.array(z.string()),
  updated_at: isoTimestampSchema,
});

const optionalTicketDraftTextSchema = z.string().trim().min(1).optional();

export const ticketDraftSchema = z.object({
  title: z.string().trim().min(1),
  summary: optionalTicketDraftTextSchema,
  body: optionalTicketDraftTextSchema,
  likely_cause: optionalTicketDraftTextSchema,
  impact: optionalTicketDraftTextSchema,
  recommended_actions: z.array(z.string().trim().min(1)).min(1).optional(),
  owner: optionalTicketDraftTextSchema,
});

export const ticketRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  run_id: clawbackIdSchema.nullable(),
  approval_request_id: clawbackIdSchema.nullable(),
  provider: ticketProviderSchema,
  status: ticketRecordStatusSchema,
  external_ref: z.string().nullable(),
  title: z.string().min(1),
  summary: z.string().min(1),
  body: z.record(z.string(), z.unknown()),
  created_by: clawbackIdSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const ticketListResponseSchema = z.object({
  tickets: z.array(ticketRecordSchema),
});

export const getTicketResponseSchema = ticketRecordSchema;
