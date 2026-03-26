import { z } from "zod";

import { clawbackIdSchema, isoTimestampSchema } from "./common.js";
import { relationshipClassSchema } from "./worker-decisions.js";

export const contactRecordSchema = z.object({
  id: clawbackIdSchema,
  workspace_id: clawbackIdSchema,
  primary_email: z.string().email(),
  display_name: z.string().min(1),
  account_id: clawbackIdSchema.nullable(),
  relationship_class: relationshipClassSchema.nullable(),
  owner_user_id: clawbackIdSchema.nullable(),
  handling_note: z.string().nullable(),
  do_not_auto_reply: z.boolean(),
  created_at: isoTimestampSchema,
  updated_at: isoTimestampSchema,
});

export type ContactRecord = z.infer<typeof contactRecordSchema>;

export const contactListResponseSchema = z.object({
  contacts: z.array(contactRecordSchema),
});

export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
