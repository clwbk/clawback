import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const artifactKindSchema = z.enum(["ticket"]);
export const artifactStatusSchema = z.enum(["draft", "created", "failed"]);

export const artifactPathParamsSchema = z.object({
  artifactId: clawbackIdSchema,
});

export const artifactRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  kind: artifactKindSchema,
  source_record_id: clawbackIdSchema,
  source_provider: z.string().min(1),
  status: artifactStatusSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  external_ref: z.string().nullable(),
  run_id: clawbackIdSchema.nullable(),
  review_request_id: clawbackIdSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const artifactListResponseSchema = z.object({
  artifacts: z.array(artifactRecordSchema),
});

export const artifactDetailSchema = artifactRecordSchema.extend({
  body: z.record(z.string(), z.unknown()),
});

export const getArtifactResponseSchema = z.object({
  artifact: artifactDetailSchema,
});
