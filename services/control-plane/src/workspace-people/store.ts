import { asc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { memberships, users } from "@clawback/db";

import type { StoredWorkspacePerson, WorkspacePeopleStore } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

export class DrizzleWorkspacePeopleStore implements WorkspacePeopleStore {
  constructor(private readonly db: Db) {}

  async listByWorkspace(workspaceId: string): Promise<StoredWorkspacePerson[]> {
    const rows = await this.db
      .select({
        id: users.id,
        email: users.email,
        displayName: users.displayName,
        role: memberships.role,
      })
      .from(memberships)
      .innerJoin(users, eq(memberships.userId, users.id))
      .where(eq(memberships.workspaceId, workspaceId))
      .orderBy(asc(memberships.createdAt));

    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
    }));
  }
}
