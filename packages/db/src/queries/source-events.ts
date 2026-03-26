import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type SourceEventRow = typeof schema.sourceEvents.$inferSelect;
export type SourceEventInsert = typeof schema.sourceEvents.$inferInsert;

export function createSourceEventQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<SourceEventRow[]> {
      return db
        .select()
        .from(schema.sourceEvents)
        .where(eq(schema.sourceEvents.workspaceId, workspaceId))
        .orderBy(desc(schema.sourceEvents.createdAt));
    },

    async listByWorker(workerId: string): Promise<SourceEventRow[]> {
      return db
        .select()
        .from(schema.sourceEvents)
        .where(eq(schema.sourceEvents.workerId, workerId))
        .orderBy(desc(schema.sourceEvents.createdAt));
    },

    async findById(workspaceId: string, id: string): Promise<SourceEventRow | null> {
      const row = await db.query.sourceEvents.findFirst({
        where: and(eq(schema.sourceEvents.workspaceId, workspaceId), eq(schema.sourceEvents.id, id)),
      });
      return row ?? null;
    },

    async findByExternalMessageId(workspaceId: string, externalMessageId: string): Promise<SourceEventRow | null> {
      const row = await db.query.sourceEvents.findFirst({
        where: and(
          eq(schema.sourceEvents.workspaceId, workspaceId),
          eq(schema.sourceEvents.externalMessageId, externalMessageId),
        ),
      });
      return row ?? null;
    },

    async create(input: SourceEventInsert): Promise<SourceEventRow> {
      const [row] = await db.insert(schema.sourceEvents).values(input).returning();
      if (!row) throw new Error("Expected source_event row to be returned.");
      return row;
    },
  };
}
