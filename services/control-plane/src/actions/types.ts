import type { z } from "zod";

import type { getActionResponseSchema, listActionsResponseSchema } from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

export type ActionListView = z.infer<typeof listActionsResponseSchema>;
export type ActionDetailView = z.infer<typeof getActionResponseSchema>;

export interface ActionServiceContract {
  listActions(actor: SessionContext): Promise<ActionListView>;
  getAction(actor: SessionContext, actionId: string): Promise<ActionDetailView>;
}
