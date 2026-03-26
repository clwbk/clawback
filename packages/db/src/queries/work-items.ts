import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type WorkItemRow = typeof schema.workItems.$inferSelect;
export type WorkItemInsert = typeof schema.workItems.$inferInsert;
export type WorkItemUpdate = Partial<Pick<
  WorkItemInsert,
  | "kind"
  | "status"
  | "title"
  | "summary"
  | "draftTo"
  | "draftSubject"
  | "draftBody"
  | "executionStatus"
  | "executionError"
  | "assigneeIds"
  | "reviewerIds"
  | "sourceRouteKind"
  | "sourceEventId"
  | "reviewId"
  | "runId"
  | "executionStateJson"
  | "executionOutcomeJson"
  | "updatedAt"
>>;

export function createWorkItemQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<WorkItemRow[]> {
      return db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.workspaceId, workspaceId))
        .orderBy(desc(schema.workItems.updatedAt));
    },

    async listByWorker(workerId: string): Promise<WorkItemRow[]> {
      return db
        .select()
        .from(schema.workItems)
        .where(eq(schema.workItems.workerId, workerId))
        .orderBy(desc(schema.workItems.updatedAt));
    },

    async findById(workspaceId: string, id: string): Promise<WorkItemRow | null> {
      const row = await db.query.workItems.findFirst({
        where: and(eq(schema.workItems.workspaceId, workspaceId), eq(schema.workItems.id, id)),
      });
      return row ?? null;
    },

    async findBySourceInboxItemId(
      workspaceId: string,
      sourceInboxItemId: string,
    ): Promise<WorkItemRow | null> {
      const row = await db.query.workItems.findFirst({
        where: and(
          eq(schema.workItems.workspaceId, workspaceId),
          eq(schema.workItems.sourceInboxItemId, sourceInboxItemId),
        ),
      });
      return row ?? null;
    },

    async create(input: WorkItemInsert): Promise<WorkItemRow> {
      const [row] = await db.insert(schema.workItems).values(input).returning();
      if (!row) throw new Error("Expected work_item row to be returned.");
      return row;
    },

    async update(id: string, input: WorkItemUpdate): Promise<WorkItemRow> {
      const [row] = await db.update(schema.workItems).set(input).where(eq(schema.workItems.id, id)).returning();
      if (!row) throw new Error("Expected work_item row to be returned.");
      return row;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.workItems).where(eq(schema.workItems.id, id));
    },
  };
}
