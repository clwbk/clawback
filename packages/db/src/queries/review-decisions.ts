import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type ReviewDecisionRow = typeof schema.reviewDecisions.$inferSelect;
export type ReviewDecisionInsert = typeof schema.reviewDecisions.$inferInsert;

export function createReviewDecisionQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<ReviewDecisionRow[]> {
      return db
        .select()
        .from(schema.reviewDecisions)
        .where(eq(schema.reviewDecisions.workspaceId, workspaceId))
        .orderBy(desc(schema.reviewDecisions.occurredAt));
    },

    async findByReviewId(workspaceId: string, reviewId: string): Promise<ReviewDecisionRow | null> {
      const row = await db.query.reviewDecisions.findFirst({
        where: and(
          eq(schema.reviewDecisions.workspaceId, workspaceId),
          eq(schema.reviewDecisions.reviewId, reviewId),
        ),
      });
      return row ?? null;
    },

    async create(input: ReviewDecisionInsert): Promise<ReviewDecisionRow> {
      const [row] = await db.insert(schema.reviewDecisions).values(input).returning();
      if (!row) throw new Error("Expected review decision row to be returned.");
      return row;
    },
  };
}
