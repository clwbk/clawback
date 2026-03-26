import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const connectorTypeSchema = z.enum(["local_directory"]);
export const connectorStatusSchema = z.enum(["active", "disabled"]);
export const connectorSyncStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export const localDirectoryConnectorConfigSchema = z.object({
  root_path: z.string().min(1),
  recursive: z.boolean().default(true),
  include_extensions: z.array(z.string().min(1)).default([
    ".md",
    ".mdx",
    ".txt",
    ".text",
    ".json",
    ".yaml",
    ".yml",
    ".csv",
    ".html",
  ]),
});

export const connectorPathParamsSchema = z.object({
  connectorId: clawbackIdSchema,
});

export const createConnectorRequestSchema = z.object({
  name: z.string().min(1),
  type: z.literal("local_directory"),
  config: localDirectoryConnectorConfigSchema,
});

export const updateConnectorRequestSchema = z.object({
  name: z.string().min(1).optional(),
  status: connectorStatusSchema.optional(),
  config: localDirectoryConnectorConfigSchema.optional(),
});

export const connectorRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  type: connectorTypeSchema,
  name: z.string().min(1),
  status: connectorStatusSchema,
  config: localDirectoryConnectorConfigSchema,
  created_by: clawbackIdSchema,
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const connectorListResponseSchema = z.object({
  connectors: z.array(connectorRecordSchema),
});

export const createConnectorResponseSchema = connectorRecordSchema;
export const getConnectorResponseSchema = connectorRecordSchema;

export const connectorSyncStatsSchema = z.object({
  scanned_file_count: z.number().int().nonnegative(),
  indexed_document_count: z.number().int().nonnegative(),
  updated_document_count: z.number().int().nonnegative(),
  deleted_document_count: z.number().int().nonnegative(),
  skipped_file_count: z.number().int().nonnegative(),
  error_count: z.number().int().nonnegative(),
});

export const connectorSyncJobSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  connector_id: clawbackIdSchema,
  status: connectorSyncStatusSchema,
  requested_by: clawbackIdSchema.nullable(),
  started_at: isoTimestampSchema.nullable(),
  completed_at: isoTimestampSchema.nullable(),
  error_summary: z.string().nullable(),
  stats: connectorSyncStatsSchema.nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export const connectorSyncJobListResponseSchema = z.object({
  sync_jobs: z.array(connectorSyncJobSchema),
});

export const requestConnectorSyncResponseSchema = z.object({
  sync_job: connectorSyncJobSchema,
});

export const connectorSyncJobExecuteSchema = z.object({
  job_type: z.literal("connector.sync"),
  sync_job_id: clawbackIdSchema,
  connector_id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  attempt: z.number().int().positive(),
  queued_at: isoTimestampSchema,
});

export const retrievalCitationSchema = z.object({
  connector_id: clawbackIdSchema,
  connector_name: z.string().min(1),
  document_id: clawbackIdSchema,
  document_version_id: clawbackIdSchema,
  chunk_id: clawbackIdSchema,
  title: z.string().nullable(),
  path_or_uri: z.string().min(1),
  snippet: z.string().min(1),
  score: z.number(),
});

export const retrievalResultSchema = retrievalCitationSchema.extend({
  content: z.string().min(1),
});

export const retrievalSearchRequestSchema = z.object({
  workspace_id: clawbackIdSchema,
  actor: z.object({
    user_id: clawbackIdSchema,
    membership_role: z.enum(["admin", "user"]),
  }),
  connector_scope: z.object({
    enabled: z.boolean(),
    connector_ids: z.array(clawbackIdSchema),
  }),
  query: z.string().min(1),
  limit: z.number().int().positive().max(12).default(6),
});

export const retrievalSearchResponseSchema = z.object({
  query: z.string().min(1),
  results: z.array(retrievalResultSchema),
});
