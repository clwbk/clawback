import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { executionContinuityStateSchema } from "./execution-continuity.js";
import { inputRouteKindSchema } from "./input-routes.js";
import { workerTriageRecordSchema } from "./worker-decisions.js";

export const inboxItemKindSchema = z.enum([
  "review",
  "shadow",
  "setup",
  "boundary",
]);

export const inboxItemStateSchema = z.enum(["open", "resolved", "dismissed"]);

/**
 * `inbox_item.execution_state_json` is a synced UX/read-model projection of
 * work-item execution continuity. It is useful for operator visibility, but
 * does not replace `work_item` as the execution authority.
 */
export const inboxItemExecutionProjectionSchema = executionContinuityStateSchema;

export const inboxItemRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  kind: inboxItemKindSchema,
  title: z.string().min(1),
  summary: z.string().nullable(),
  assignee_ids: z.array(clawbackIdSchema),
  worker_id: clawbackIdSchema.nullable(),
  work_item_id: clawbackIdSchema.nullable(),
  review_id: clawbackIdSchema.nullable(),
  route_kind: inputRouteKindSchema.nullable(),
  state: inboxItemStateSchema,
  triage_json: workerTriageRecordSchema.nullable(),
  execution_state_json: inboxItemExecutionProjectionSchema.nullable().optional(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type InboxItemKind = z.infer<typeof inboxItemKindSchema>;
export type InboxItemState = z.infer<typeof inboxItemStateSchema>;
export type InboxItemExecutionProjectionRecord = z.infer<typeof inboxItemExecutionProjectionSchema>;
export type InboxItemRecord = z.infer<typeof inboxItemRecordSchema>;
export type InboxItemProjectionRecord = InboxItemRecord;

export const inboxListResponseSchema = z.object({
  items: z.array(inboxItemRecordSchema),
});

export type InboxListResponse = z.infer<typeof inboxListResponseSchema>;
