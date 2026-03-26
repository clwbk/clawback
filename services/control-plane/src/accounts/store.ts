import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createAccountQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { StoredAccount, AccountStore } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(row: Awaited<ReturnType<ReturnType<typeof createAccountQueries>["listByWorkspace"]>>[number]): StoredAccount {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    primaryDomain: row.primaryDomain ?? null,
    relationshipClass: (row.relationshipClass ?? null) as StoredAccount["relationshipClass"],
    ownerUserId: row.ownerUserId ?? null,
    handlingNote: row.handlingNote ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleAccountStore implements AccountStore {
  private readonly queries: ReturnType<typeof createAccountQueries>;

  constructor(db: Db) {
    this.queries = createAccountQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredAccount[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredAccount | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async findByDomain(workspaceId: string, domain: string): Promise<StoredAccount | null> {
    const row = await this.queries.findByDomain(workspaceId, domain);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredAccount): Promise<StoredAccount> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      name: input.name,
      primaryDomain: input.primaryDomain,
      relationshipClass: input.relationshipClass,
      ownerUserId: input.ownerUserId,
      handlingNote: input.handlingNote,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredAccount>): Promise<StoredAccount> {
    const row = await this.queries.update(id, stripUndefined({
      name: input.name,
      primaryDomain: input.primaryDomain,
      relationshipClass: input.relationshipClass,
      ownerUserId: input.ownerUserId,
      handlingNote: input.handlingNote,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }
}
