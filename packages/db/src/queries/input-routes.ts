import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type InputRouteRow = typeof schema.inputRoutes.$inferSelect;
export type InputRouteInsert = typeof schema.inputRoutes.$inferInsert;
export type InputRouteUpdate = Partial<Pick<InputRouteInsert, "kind" | "status" | "label" | "description" | "address" | "capabilityNote" | "updatedAt">>;

export function createInputRouteQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<InputRouteRow[]> {
      return db
        .select()
        .from(schema.inputRoutes)
        .where(eq(schema.inputRoutes.workspaceId, workspaceId))
        .orderBy(desc(schema.inputRoutes.createdAt));
    },

    async listByWorker(workerId: string): Promise<InputRouteRow[]> {
      return db
        .select()
        .from(schema.inputRoutes)
        .where(eq(schema.inputRoutes.workerId, workerId))
        .orderBy(desc(schema.inputRoutes.createdAt));
    },

    async findById(workspaceId: string, id: string): Promise<InputRouteRow | null> {
      const row = await db.query.inputRoutes.findFirst({
        where: and(eq(schema.inputRoutes.workspaceId, workspaceId), eq(schema.inputRoutes.id, id)),
      });
      return row ?? null;
    },

    async create(input: InputRouteInsert): Promise<InputRouteRow> {
      const [row] = await db.insert(schema.inputRoutes).values(input).returning();
      if (!row) throw new Error("Expected input_route row to be returned.");
      return row;
    },

    async update(id: string, input: InputRouteUpdate): Promise<InputRouteRow> {
      const [row] = await db.update(schema.inputRoutes).set(input).where(eq(schema.inputRoutes.id, id)).returning();
      if (!row) throw new Error("Expected input_route row to be returned.");
      return row;
    },

    async findByAddress(address: string): Promise<InputRouteRow | null> {
      const row = await db.query.inputRoutes.findFirst({
        where: and(
          eq(schema.inputRoutes.address, address),
          eq(schema.inputRoutes.status, "active"),
        ),
      });
      return row ?? null;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.inputRoutes).where(eq(schema.inputRoutes.id, id));
    },
  };
}
