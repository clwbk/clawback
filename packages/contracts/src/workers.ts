import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const workerKindSchema = z.enum([
  "follow_up",
  "proposal",
  "incident",
  "bugfix",
]);

export const workerScopeSchema = z.enum(["personal", "shared"]);

export const workerStatusSchema = z.enum(["draft", "active", "paused"]);

export const workerRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  slug: z.string().min(1),
  name: z.string().min(1),
  kind: workerKindSchema,
  scope: workerScopeSchema,
  status: workerStatusSchema,
  summary: z.string().nullable(),
  member_ids: z.array(clawbackIdSchema),
  assignee_ids: z.array(clawbackIdSchema),
  reviewer_ids: z.array(clawbackIdSchema),
  input_route_ids: z.array(clawbackIdSchema),
  connection_ids: z.array(clawbackIdSchema),
  action_ids: z.array(clawbackIdSchema),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type WorkerKind = z.infer<typeof workerKindSchema>;
export type WorkerScope = z.infer<typeof workerScopeSchema>;
export type WorkerStatus = z.infer<typeof workerStatusSchema>;
export type WorkerRecord = z.infer<typeof workerRecordSchema>;

export const workerListResponseSchema = z.object({
  workers: z.array(workerRecordSchema),
});

export type WorkerListResponse = z.infer<typeof workerListResponseSchema>;

export const getWorkerResponseSchema = workerRecordSchema;
export type GetWorkerResponse = z.infer<typeof getWorkerResponseSchema>;
