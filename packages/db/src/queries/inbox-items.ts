import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type InboxItemRow = typeof schema.inboxItems.$inferSelect;
export type InboxItemInsert = typeof schema.inboxItems.$inferInsert;
export type InboxItemUpdate = Partial<Pick<
  InboxItemInsert,
  "kind" | "title" | "summary" | "assigneeIds" | "workerId" | "workItemId" | "reviewId" | "routeKind" | "state" | "executionStateJson" | "updatedAt"
>>;

export function createInboxItemQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<InboxItemRow[]> {
      return db
        .select()
        .from(schema.inboxItems)
        .where(eq(schema.inboxItems.workspaceId, workspaceId))
        .orderBy(desc(schema.inboxItems.createdAt));
    },

    async listOpen(workspaceId: string): Promise<InboxItemRow[]> {
      return db
        .select()
        .from(schema.inboxItems)
        .where(and(eq(schema.inboxItems.workspaceId, workspaceId), eq(schema.inboxItems.state, "open")))
        .orderBy(desc(schema.inboxItems.createdAt));
    },

    async findById(workspaceId: string, id: string): Promise<InboxItemRow | null> {
      const row = await db.query.inboxItems.findFirst({
        where: and(eq(schema.inboxItems.workspaceId, workspaceId), eq(schema.inboxItems.id, id)),
      });
      return row ?? null;
    },

    async findByReviewId(workspaceId: string, reviewId: string): Promise<InboxItemRow | null> {
      const row = await db.query.inboxItems.findFirst({
        where: and(eq(schema.inboxItems.workspaceId, workspaceId), eq(schema.inboxItems.reviewId, reviewId)),
      });
      return row ?? null;
    },

    async findByWorkItemId(workspaceId: string, workItemId: string): Promise<InboxItemRow | null> {
      const row = await db.query.inboxItems.findFirst({
        where: and(eq(schema.inboxItems.workspaceId, workspaceId), eq(schema.inboxItems.workItemId, workItemId)),
      });
      return row ?? null;
    },

    async create(input: InboxItemInsert): Promise<InboxItemRow> {
      const [row] = await db.insert(schema.inboxItems).values(input).returning();
      if (!row) throw new Error("Expected inbox_item row to be returned.");
      return row;
    },

    async update(id: string, input: InboxItemUpdate): Promise<InboxItemRow> {
      const [row] = await db.update(schema.inboxItems).set(input).where(eq(schema.inboxItems.id, id)).returning();
      if (!row) throw new Error("Expected inbox_item row to be returned.");
      return row;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.inboxItems).where(eq(schema.inboxItems.id, id));
    },
  };
}
