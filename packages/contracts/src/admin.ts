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

export const runtimeRestartResponseSchema = z.object({
  target: runtimeControlTargetSchema,
  status: z.literal("completed"),
  message: z.string().min(1),
  requested_at: isoTimestampSchema,
  completed_at: isoTimestampSchema,
});
