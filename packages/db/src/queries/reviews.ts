import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type ReviewRow = typeof schema.reviews.$inferSelect;
export type ReviewInsert = typeof schema.reviews.$inferInsert;
export type ReviewUpdate = Partial<Pick<
  ReviewInsert,
  | "status"
  | "workItemId"
  | "reviewerIds"
  | "assigneeIds"
  | "actionDestination"
  | "requestPayloadJson"
  | "resolvedAt"
  | "updatedAt"
>>;

export function createReviewQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<ReviewRow[]> {
      return db
        .select()
        .from(schema.reviews)
        .where(eq(schema.reviews.workspaceId, workspaceId))
        .orderBy(desc(schema.reviews.requestedAt));
    },

    async listPending(workspaceId: string): Promise<ReviewRow[]> {
      return db
        .select()
        .from(schema.reviews)
        .where(and(eq(schema.reviews.workspaceId, workspaceId), eq(schema.reviews.status, "pending")))
        .orderBy(desc(schema.reviews.requestedAt));
    },

    async findById(workspaceId: string, id: string): Promise<ReviewRow | null> {
      const row = await db.query.reviews.findFirst({
        where: and(eq(schema.reviews.workspaceId, workspaceId), eq(schema.reviews.id, id)),
      });
      return row ?? null;
    },

    async create(input: ReviewInsert): Promise<ReviewRow> {
      const [row] = await db.insert(schema.reviews).values(input).returning();
      if (!row) throw new Error("Expected review row to be returned.");
      return row;
    },

    async update(id: string, input: ReviewUpdate): Promise<ReviewRow> {
      const [row] = await db.update(schema.reviews).set(input).where(eq(schema.reviews.id, id)).returning();
      if (!row) throw new Error("Expected review row to be returned.");
      return row;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.reviews).where(eq(schema.reviews.id, id));
    },
  };
}
