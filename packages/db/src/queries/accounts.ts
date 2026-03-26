import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type AccountRow = typeof schema.accounts.$inferSelect;
export type AccountInsert = typeof schema.accounts.$inferInsert;
export type AccountUpdate = Partial<Pick<
  AccountInsert,
  | "name"
  | "primaryDomain"
  | "relationshipClass"
  | "ownerUserId"
  | "handlingNote"
  | "updatedAt"
>>;

export function createAccountQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<AccountRow[]> {
      return db
        .select()
        .from(schema.accounts)
        .where(eq(schema.accounts.workspaceId, workspaceId))
        .orderBy(desc(schema.accounts.updatedAt));
    },

    async findById(workspaceId: string, id: string): Promise<AccountRow | null> {
      const row = await db.query.accounts.findFirst({
        where: and(eq(schema.accounts.workspaceId, workspaceId), eq(schema.accounts.id, id)),
      });
      return row ?? null;
    },

    async findByDomain(workspaceId: string, domain: string): Promise<AccountRow | null> {
      const row = await db.query.accounts.findFirst({
        where: and(
          eq(schema.accounts.workspaceId, workspaceId),
          eq(schema.accounts.primaryDomain, domain),
        ),
      });
      return row ?? null;
    },

    async create(input: AccountInsert): Promise<AccountRow> {
      const [row] = await db.insert(schema.accounts).values(input).returning();
      if (!row) throw new Error("Expected account row to be returned.");
      return row;
    },

    async update(id: string, input: AccountUpdate): Promise<AccountRow> {
      const [row] = await db
        .update(schema.accounts)
        .set(input)
        .where(eq(schema.accounts.id, id))
        .returning();
      if (!row) throw new Error("Expected account row to be returned.");
      return row;
    },
  };
}
