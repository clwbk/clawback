import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { inboxItemRecordSchema } from "./inbox.js";
import { inputRouteKindSchema } from "./input-routes.js";
import { workItemRecordSchema } from "./work-items.js";

// ---------------------------------------------------------------------------
// ActivityEventRecord — matches v1-build-graph.md line 379-400
// ---------------------------------------------------------------------------

export const activityEventRecordSchema = z.object({
  id: clawbackIdSchema,
  timestamp: isoTimestampSchema,
  worker_id: clawbackIdSchema.nullable(),
  route_kind: inputRouteKindSchema.nullable(),
  result_kind: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().nullable(),
  assignee_ids: z.array(clawbackIdSchema),
  run_id: clawbackIdSchema.nullable(),
  work_item_id: clawbackIdSchema.nullable(),
  review_id: clawbackIdSchema.nullable(),
});

export type ActivityEventRecord = z.infer<typeof activityEventRecordSchema>;

export const activityListResponseSchema = z.object({
  events: z.array(activityEventRecordSchema),
});

export type ActivityListResponse = z.infer<typeof activityListResponseSchema>;

// ---------------------------------------------------------------------------
// WorkerSnapshot — lightweight summary for Today view
// ---------------------------------------------------------------------------

export const workerSnapshotSchema = z.object({
  id: clawbackIdSchema,
  name: z.string().min(1),
  kind: z.string().min(1),
  open_inbox_count: z.number(),
  recent_work_count: z.number(),
});

export type WorkerSnapshot = z.infer<typeof workerSnapshotSchema>;

// ---------------------------------------------------------------------------
// TodayStatsSchema — aggregate stats for the workspace home
// ---------------------------------------------------------------------------

export const todayStatsSchema = z.object({
  inbox_waiting: z.number(),
  team_items_today: z.number(),
  workers_active: z.number(),
  connections_active: z.number(),
});

export type TodayStats = z.infer<typeof todayStatsSchema>;

// ---------------------------------------------------------------------------
// TodayResponse — matches v1-build-graph.md line 362-378
// ---------------------------------------------------------------------------

export const todayResponseSchema = z.object({
  viewer: z.object({
    user_id: clawbackIdSchema,
    display_name: z.string().min(1),
    role: z.string().min(1),
  }),
  stats: todayStatsSchema,
  for_you: z.array(inboxItemRecordSchema),
  team: z.array(workItemRecordSchema),
  worker_snapshots: z.array(workerSnapshotSchema),
  recent_work: z.array(workItemRecordSchema),
});

export type TodayResponse = z.infer<typeof todayResponseSchema>;
