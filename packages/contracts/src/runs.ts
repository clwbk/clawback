import { z } from "zod";

import {
  approvalPolicySchema,
  connectorScopeSchema,
  modelRoutingSchema,
  toolPolicySchema,
} from "./agents.js";
import { channelSchema, clawbackIdSchema, isoTimestampSchema, workspaceRoleSchema } from "./common.js";
import { transcriptContentPartSchema } from "./conversations.js";

export const runStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
  "canceled",
]);

export const runPathParamsSchema = z.object({
  runId: clawbackIdSchema,
});

export const runExecuteJobSchema = z.object({
  job_type: z.literal("run.execute"),
  run_id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  attempt: z.number().int().positive(),
  queued_at: isoTimestampSchema,
});

export const runSnapshotSchema = z.object({
  snapshot_version: z.literal(1),
  run_id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  agent: z.object({
    agent_id: clawbackIdSchema,
    agent_version_id: clawbackIdSchema,
    scope: z.enum(["personal", "shared"]),
    name: z.string().min(1),
    persona: z.record(z.string(), z.unknown()),
    instructions_markdown: z.string(),
  }),
  model_profile: modelRoutingSchema,
  conversation: z.object({
    conversation_id: clawbackIdSchema,
    channel: channelSchema,
    runtime_session_key: z.string().min(1),
  }),
  actor: z.object({
    user_id: clawbackIdSchema,
    membership_role: workspaceRoleSchema,
  }),
  input_message: z.object({
    message_id: clawbackIdSchema,
    content: z.array(transcriptContentPartSchema),
  }),
  tool_policy: toolPolicySchema,
  connector_scope: connectorScopeSchema,
  approval_policy: approvalPolicySchema,
});

export const domainEventActorSchema = z.object({
  type: z.enum(["user", "service", "system"]),
  id: z.string().min(1),
});

export const runEventPayloadSchema = z.record(z.string(), z.unknown());

export const runEventSchema = z.object({
  event_id: clawbackIdSchema,
  event_type: z.enum([
    "run.created",
    "run.snapshot.created",
    "run.claimed",
    "run.dispatch.accepted",
    "run.model.started",
    "run.retrieval.requested",
    "run.retrieval.completed",
    "run.output.delta",
    "run.tool.requested",
    "run.tool.completed",
    "run.waiting_for_approval",
    "run.approval.resolved",
    "run.completed",
    "run.failed",
  ]),
  workspace_id: clawbackIdSchema,
  run_id: clawbackIdSchema,
  sequence: z.number().int().positive(),
  occurred_at: isoTimestampSchema,
  actor: domainEventActorSchema,
  payload: runEventPayloadSchema,
});

export const runRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  agent_id: clawbackIdSchema,
  agent_version_id: clawbackIdSchema,
  conversation_id: clawbackIdSchema,
  input_message_id: clawbackIdSchema,
  initiated_by: clawbackIdSchema,
  channel: channelSchema,
  status: runStatusSchema,
  started_at: isoTimestampSchema.nullable(),
  completed_at: isoTimestampSchema.nullable(),
  current_step: z.string().nullable(),
  summary: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const runEventListResponseSchema = z.object({
  events: z.array(runEventSchema),
});

export const sseEnvelopeSchema = z.object({
  type: z.enum([
    "run.status",
    "assistant.delta",
    "assistant.completed",
    "run.failed",
    "run.approval.required",
    "run.approval.resolved",
    "keepalive",
  ]),
  run_id: clawbackIdSchema,
  conversation_id: clawbackIdSchema,
  sequence: z.number().int().nonnegative(),
  data: z.record(z.string(), z.unknown()),
});

export const getRunResponseSchema = runRecordSchema;
