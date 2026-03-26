import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type ActionCapabilityRow = typeof schema.actionCapabilities.$inferSelect;
export type ActionCapabilityInsert = typeof schema.actionCapabilities.$inferInsert;
export type ActionCapabilityUpdate = Partial<Pick<ActionCapabilityInsert, "kind" | "boundaryMode" | "reviewerIds" | "destinationConnectionId" | "updatedAt">>;

export function createActionCapabilityQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<ActionCapabilityRow[]> {
      return db
        .select()
        .from(schema.actionCapabilities)
        .where(eq(schema.actionCapabilities.workspaceId, workspaceId))
        .orderBy(desc(schema.actionCapabilities.createdAt));
    },

    async listByWorker(workerId: string): Promise<ActionCapabilityRow[]> {
      return db
        .select()
        .from(schema.actionCapabilities)
        .where(eq(schema.actionCapabilities.workerId, workerId))
        .orderBy(desc(schema.actionCapabilities.createdAt));
    },

    async findById(workspaceId: string, id: string): Promise<ActionCapabilityRow | null> {
      const row = await db.query.actionCapabilities.findFirst({
        where: and(eq(schema.actionCapabilities.workspaceId, workspaceId), eq(schema.actionCapabilities.id, id)),
      });
      return row ?? null;
    },

    async create(input: ActionCapabilityInsert): Promise<ActionCapabilityRow> {
      const [row] = await db.insert(schema.actionCapabilities).values(input).returning();
      if (!row) throw new Error("Expected action_capability row to be returned.");
      return row;
    },

    async update(id: string, input: ActionCapabilityUpdate): Promise<ActionCapabilityRow> {
      const [row] = await db.update(schema.actionCapabilities).set(input).where(eq(schema.actionCapabilities.id, id)).returning();
      if (!row) throw new Error("Expected action_capability row to be returned.");
      return row;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.actionCapabilities).where(eq(schema.actionCapabilities.id, id));
    },
  };
}
