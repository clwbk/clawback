import { z } from "zod";

import { clawbackIdSchema } from "./common.js";
import { relationshipClassSchema } from "./worker-decisions.js";

export const resolutionMethodSchema = z.enum([
  "exact_contact",
  "linked_account",
  "account_domain",
  "internal_domain",
  "heuristic_fallback",
  "none",
]);

export type ResolutionMethod = z.infer<typeof resolutionMethodSchema>;

export const senderResolutionSchema = z.object({
  contact_id: clawbackIdSchema.nullable(),
  account_id: clawbackIdSchema.nullable(),
  relationship_class: relationshipClassSchema,
  owner_user_id: clawbackIdSchema.nullable(),
  handling_note: z.string().nullable(),
  do_not_auto_reply: z.boolean(),
  resolution_method: resolutionMethodSchema,
});

export type SenderResolution = z.infer<typeof senderResolutionSchema>;
