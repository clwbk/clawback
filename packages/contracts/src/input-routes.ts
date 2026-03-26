import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const inputRouteKindSchema = z.enum([
  "chat",
  "forward_email",
  "watched_inbox",
  "upload",
  "schedule",
  "webhook",
]);

export const inputRouteStatusSchema = z.enum(["inactive", "active", "suggested"]);

export const inputRouteRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  worker_id: clawbackIdSchema,
  kind: inputRouteKindSchema,
  status: inputRouteStatusSchema,
  label: z.string().min(1),
  description: z.string().nullable(),
  address: z.string().nullable(),
  capability_note: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type InputRouteKind = z.infer<typeof inputRouteKindSchema>;
export type InputRouteStatus = z.infer<typeof inputRouteStatusSchema>;
export type InputRouteRecord = z.infer<typeof inputRouteRecordSchema>;

export const inputRouteListResponseSchema = z.object({
  input_routes: z.array(inputRouteRecordSchema),
});

export type InputRouteListResponse = z.infer<typeof inputRouteListResponseSchema>;
