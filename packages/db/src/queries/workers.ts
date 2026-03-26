import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type WorkerRow = typeof schema.workers.$inferSelect;
export type WorkerInsert = typeof schema.workers.$inferInsert;
export type WorkerUpdate = Partial<Pick<WorkerInsert, "name" | "slug" | "kind" | "scope" | "status" | "summary" | "memberIds" | "assigneeIds" | "reviewerIds" | "inputRouteIds" | "connectionIds" | "actionIds" | "updatedAt">>;

export function createWorkerQueries(db: Db) {
  return {
    async list(workspaceId: string): Promise<WorkerRow[]> {
      return db
        .select()
        .from(schema.workers)
        .where(eq(schema.workers.workspaceId, workspaceId))
        .orderBy(desc(schema.workers.updatedAt));
    },

    async findById(workspaceId: string, id: string): Promise<WorkerRow | null> {
      const row = await db.query.workers.findFirst({
        where: and(eq(schema.workers.workspaceId, workspaceId), eq(schema.workers.id, id)),
      });
      return row ?? null;
    },

    async findBySlug(workspaceId: string, slug: string): Promise<WorkerRow | null> {
      const row = await db.query.workers.findFirst({
        where: and(eq(schema.workers.workspaceId, workspaceId), eq(schema.workers.slug, slug)),
      });
      return row ?? null;
    },

    async create(input: WorkerInsert): Promise<WorkerRow> {
      const [row] = await db.insert(schema.workers).values(input).returning();
      if (!row) throw new Error("Expected worker row to be returned.");
      return row;
    },

    async update(id: string, input: WorkerUpdate): Promise<WorkerRow> {
      const [row] = await db.update(schema.workers).set(input).where(eq(schema.workers.id, id)).returning();
      if (!row) throw new Error("Expected worker row to be returned.");
      return row;
    },

    async remove(id: string): Promise<void> {
      await db.delete(schema.workers).where(eq(schema.workers.id, id));
    },
  };
}
