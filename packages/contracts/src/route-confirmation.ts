import { z } from "zod";

import { clawbackIdSchema } from "./common.js";
import { inboxItemRecordSchema } from "./inbox.js";
import { workItemRecordSchema } from "./work-items.js";

export const confirmRouteSuggestionResponseSchema = z.object({
  already_confirmed: z.boolean(),
  origin_inbox_item: inboxItemRecordSchema,
  destination_work_item: workItemRecordSchema,
  destination_inbox_item: inboxItemRecordSchema,
  activity_event_id: clawbackIdSchema,
});

export type ConfirmRouteSuggestionResponse = z.infer<typeof confirmRouteSuggestionResponseSchema>;
