import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createContactQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { StoredContact, ContactStore } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(row: Awaited<ReturnType<ReturnType<typeof createContactQueries>["listByWorkspace"]>>[number]): StoredContact {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    primaryEmail: row.primaryEmail,
    displayName: row.displayName,
    accountId: row.accountId ?? null,
    relationshipClass: (row.relationshipClass ?? null) as StoredContact["relationshipClass"],
    ownerUserId: row.ownerUserId ?? null,
    handlingNote: row.handlingNote ?? null,
    doNotAutoReply: row.doNotAutoReply,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleContactStore implements ContactStore {
  private readonly queries: ReturnType<typeof createContactQueries>;

  constructor(db: Db) {
    this.queries = createContactQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredContact[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredContact | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async findByEmail(workspaceId: string, email: string): Promise<StoredContact | null> {
    const row = await this.queries.findByEmail(workspaceId, email);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredContact): Promise<StoredContact> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      primaryEmail: input.primaryEmail,
      displayName: input.displayName,
      accountId: input.accountId,
      relationshipClass: input.relationshipClass,
      ownerUserId: input.ownerUserId,
      handlingNote: input.handlingNote,
      doNotAutoReply: input.doNotAutoReply,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredContact>): Promise<StoredContact> {
    const row = await this.queries.update(id, stripUndefined({
      primaryEmail: input.primaryEmail,
      displayName: input.displayName,
      accountId: input.accountId,
      relationshipClass: input.relationshipClass,
      ownerUserId: input.ownerUserId,
      handlingNote: input.handlingNote,
      doNotAutoReply: input.doNotAutoReply,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }
}
