import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type ActivityEventRow = typeof schema.activityEvents.$inferSelect;
export type ActivityEventInsert = typeof schema.activityEvents.$inferInsert;

export function createActivityEventQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string, limit = 50): Promise<ActivityEventRow[]> {
      return db
        .select()
        .from(schema.activityEvents)
        .where(eq(schema.activityEvents.workspaceId, workspaceId))
        .orderBy(desc(schema.activityEvents.timestamp))
        .limit(limit);
    },

    async create(input: ActivityEventInsert): Promise<ActivityEventRow> {
      const [row] = await db.insert(schema.activityEvents).values(input).returning();
      if (!row) throw new Error("Expected activity_event row to be returned.");
      return row;
    },

    async findByReviewResult(
      workspaceId: string,
      reviewId: string,
      resultKind: string,
    ): Promise<ActivityEventRow | null> {
      const row = await db.query.activityEvents.findFirst({
        where: and(
          eq(schema.activityEvents.workspaceId, workspaceId),
          eq(schema.activityEvents.reviewId, reviewId),
          eq(schema.activityEvents.resultKind, resultKind),
        ),
      });
      return row ?? null;
    },

    async findByWorkItemResult(
      workspaceId: string,
      workItemId: string,
      resultKind: string,
    ): Promise<ActivityEventRow | null> {
      const row = await db.query.activityEvents.findFirst({
        where: and(
          eq(schema.activityEvents.workspaceId, workspaceId),
          eq(schema.activityEvents.workItemId, workItemId),
          eq(schema.activityEvents.resultKind, resultKind),
        ),
      });
      return row ?? null;
    },
  };
}
