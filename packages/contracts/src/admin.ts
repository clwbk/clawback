import { z } from "zod";

import { isoTimestampSchema } from "./common.js";

export const runtimeControlTargetSchema = z.enum(["openclaw", "runtime_worker"]);
export const runtimeControlModeSchema = z.enum(["local_compose", "local_dev_watch", "disabled"]);

export const runtimeControlStatusResponseSchema = z.object({
  enabled: z.boolean(),
  mode: runtimeControlModeSchema,
  target: runtimeControlTargetSchema,
  label: z.string().min(1),
  reason: z.string().nullable(),
});

export const runtimeReadinessStatusSchema = z.enum(["ready", "degraded", "blocked"]);

export const runtimeReadinessCheckSchema = z.object({
  ok: z.boolean(),
  summary: z.string().min(1),
  detail: z.string().nullable(),
});

export const runtimeReadinessResponseSchema = z.object({
  ok: z.boolean(),
  status: runtimeReadinessStatusSchema,
  configured_provider: z.string().min(1),
  configured_provider_env_var: z.string().nullable(),
  configured_provider_key_present: z.boolean(),
  gateway_main_model: z.string().nullable(),
  gateway_main_provider: z.string().nullable(),
  gateway_main_provider_env_var: z.string().nullable(),
  gateway_main_provider_key_present: z.boolean().nullable(),
  published_agent_count: z.number().int().nonnegative(),
  checks: z.object({
    gateway: runtimeReadinessCheckSchema,
    configured_provider_key: runtimeReadinessCheckSchema,
    gateway_main_provider_key: runtimeReadinessCheckSchema.nullable(),
  }),
});

export const runtimeRestartResponseSchema = z.object({
  target: runtimeControlTargetSchema,
  status: z.literal("completed"),
  message: z.string().min(1),
  requested_at: isoTimestampSchema,
  completed_at: isoTimestampSchema,
});
