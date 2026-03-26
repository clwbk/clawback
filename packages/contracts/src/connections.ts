import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";

export const connectionProviderSchema = z.enum([
  "gmail",
  "n8n",
  "smtp_relay",
  "calendar",
  "drive",
  "github",
  "ticketing",
  "notion",
  "slack",
  "whatsapp",
]);

export const connectionAccessModeSchema = z.enum(["read_only", "write_capable"]);

export const connectionStatusSchema = z.enum(["not_connected", "suggested", "connected", "error"]);

export const connectionRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  provider: connectionProviderSchema,
  access_mode: connectionAccessModeSchema,
  status: connectionStatusSchema,
  label: z.string().min(1),
  capabilities: z.array(z.string().min(1)),
  attached_worker_ids: z.array(clawbackIdSchema),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type ConnectionProvider = z.infer<typeof connectionProviderSchema>;
export type ConnectionAccessMode = z.infer<typeof connectionAccessModeSchema>;
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;
export type ConnectionRecord = z.infer<typeof connectionRecordSchema>;

export const connectionListResponseSchema = z.object({
  connections: z.array(connectionRecordSchema),
});

export type ConnectionListResponse = z.infer<typeof connectionListResponseSchema>;

export const getConnectionResponseSchema = connectionRecordSchema;
export type GetConnectionResponse = z.infer<typeof getConnectionResponseSchema>;
