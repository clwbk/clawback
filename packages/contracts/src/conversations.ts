import { z } from "zod";

import { channelSchema, clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { retrievalCitationSchema } from "./connectors.js";

export const transcriptContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

export const createConversationRequestSchema = z.object({
  agent_id: clawbackIdSchema,
});

export const conversationListQuerySchema = z.object({
  agent_id: clawbackIdSchema.optional(),
});

export const conversationPathParamsSchema = z.object({
  conversationId: clawbackIdSchema,
});

export const createRunInputSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
});

export const createRunRequestSchema = z.object({
  conversation_id: clawbackIdSchema,
  input: createRunInputSchema,
});

export const createRunResponseSchema = z.object({
  run_id: clawbackIdSchema,
  conversation_id: clawbackIdSchema,
  input_message_id: clawbackIdSchema,
  stream_url: z.string().min(1),
});

export const conversationSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  agent_id: clawbackIdSchema,
  agent_version_id: clawbackIdSchema,
  channel: channelSchema,
  started_by: clawbackIdSchema,
  status: z.enum(["active", "archived"]),
  title: z.string().nullable(),
  last_message_at: isoTimestampSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const messageSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  conversation_id: clawbackIdSchema,
  run_id: clawbackIdSchema.nullable(),
  sequence: z.number().int().nonnegative(),
  role: z.enum(["user", "assistant"]),
  author_user_id: clawbackIdSchema.nullable(),
  content: z.array(transcriptContentPartSchema),
  citations: z.array(retrievalCitationSchema).nullable(),
  token_usage: z.record(z.string(), z.number()).nullable(),
  created_at: isoTimestampSchema,
});

export const createConversationResponseSchema = conversationSchema;

export const conversationListResponseSchema = z.object({
  conversations: z.array(conversationSchema),
});

export const conversationDetailResponseSchema = z.object({
  conversation: conversationSchema,
  messages: z.array(messageSchema),
});
