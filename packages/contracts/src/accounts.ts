import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { relationshipClassSchema } from "./worker-decisions.js";

export const accountRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  name: z.string().min(1),
  primary_domain: z.string().nullable(),
  relationship_class: relationshipClassSchema.nullable(),
  owner_user_id: clawbackIdSchema.nullable(),
  handling_note: z.string().nullable(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type AccountRecord = z.infer<typeof accountRecordSchema>;

export const accountListResponseSchema = z.object({
  accounts: z.array(accountRecordSchema),
});

export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
