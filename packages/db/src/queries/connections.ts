import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type ConnectionRow = typeof schema.connections.$inferSelect;
export type ConnectionInsert = typeof schema.connections.$inferInsert;
export type ConnectionUpdate = Partial<
  Pick<
    ConnectionInsert,
    "provider" | "accessMode" | "status" | "label" | "capabilities" | "attachedWorkerIds" | "configJson" | "updatedAt"
  >
>;

export function createConnectionQueries(db: Db) {
  return {
    async listAll(): Promise<ConnectionRow[]> {
      return db
        .select()
        .from(schema.connections)
        .orderBy(desc(schema.connections.updatedAt));
    },

    async list(workspaceId: string): Promise<ConnectionRow[]> {
      return db
        .select()
        .from(schema.connections)
        .where(eq(schema.connections.workspaceId, workspaceId))
        .orderBy(desc(schema.connections.updatedAt));
    },

    async findById(workspaceId: string, id: string): Promise<ConnectionRow | null> {
      const row = await db.query.connections.findFirst({
        where: and(eq(schema.connections.workspaceId, workspaceId), eq(schema.connections.id, id)),
      });
      return row ?? null;
    },

    async create(input: ConnectionInsert): Promise<ConnectionRow> {
      const [row] = await db.insert(schema.connections).values(input).returning();
      if (!row) throw new Error("Expected connection row to be returned.");
      return row;
    },

    async update(id: string, input: ConnectionUpdate): Promise<ConnectionRow> {
      const [row] = await db.update(schema.connections).set(input).where(eq(schema.connections.id, id)).returning();
      if (!row) throw new Error("Expected connection row to be returned.");
      return row;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.connections).where(eq(schema.connections.id, id));
    },
  };
}
