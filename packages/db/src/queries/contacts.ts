import { and, desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import * as schema from "../schema.js";

type Db = NodePgDatabase<typeof schema>;

export type ContactRow = typeof schema.contacts.$inferSelect;
export type ContactInsert = typeof schema.contacts.$inferInsert;
export type ContactUpdate = Partial<Pick<
  ContactInsert,
  | "primaryEmail"
  | "displayName"
  | "accountId"
  | "relationshipClass"
  | "ownerUserId"
  | "handlingNote"
  | "doNotAutoReply"
  | "updatedAt"
>>;

export function createContactQueries(db: Db) {
  return {
    async listByWorkspace(workspaceId: string): Promise<ContactRow[]> {
      return db
        .select()
        .from(schema.contacts)
        .where(eq(schema.contacts.workspaceId, workspaceId))
        .orderBy(desc(schema.contacts.updatedAt));
    },

    async findById(workspaceId: string, id: string): Promise<ContactRow | null> {
      const row = await db.query.contacts.findFirst({
        where: and(eq(schema.contacts.workspaceId, workspaceId), eq(schema.contacts.id, id)),
      });
      return row ?? null;
    },

    async findByEmail(workspaceId: string, email: string): Promise<ContactRow | null> {
      const row = await db.query.contacts.findFirst({
        where: and(
          eq(schema.contacts.workspaceId, workspaceId),
          eq(schema.contacts.primaryEmail, email),
        ),
      });
      return row ?? null;
    },

    async create(input: ContactInsert): Promise<ContactRow> {
      const [row] = await db.insert(schema.contacts).values(input).returning();
      if (!row) throw new Error("Expected contact row to be returned.");
      return row;
    },

    async update(id: string, input: ContactUpdate): Promise<ContactRow> {
      const [row] = await db
        .update(schema.contacts)
        .set(input)
        .where(eq(schema.contacts.id, id))
        .returning();
      if (!row) throw new Error("Expected contact row to be returned.");
      return row;
    },
  };
}
