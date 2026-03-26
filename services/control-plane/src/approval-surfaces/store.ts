import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createApprovalSurfaceIdentityQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type {
  ApprovalSurfaceIdentityStore,
  StoredApprovalSurfaceIdentity,
} from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(
  row: Awaited<ReturnType<ReturnType<typeof createApprovalSurfaceIdentityQueries>["listByWorkspace"]>>[number],
): StoredApprovalSurfaceIdentity {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    channel: row.channel,
    userId: row.userId,
    externalIdentity: row.externalIdentity,
    label: row.label,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleApprovalSurfaceIdentityStore implements ApprovalSurfaceIdentityStore {
  private readonly queries: ReturnType<typeof createApprovalSurfaceIdentityQueries>;

  constructor(db: Db) {
    this.queries = createApprovalSurfaceIdentityQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredApprovalSurfaceIdentity[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredApprovalSurfaceIdentity | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async findByChannelAndUser(
    workspaceId: string,
    channel: StoredApprovalSurfaceIdentity["channel"],
    userId: string,
  ): Promise<StoredApprovalSurfaceIdentity | null> {
    const row = await this.queries.findByChannelAndUser(workspaceId, channel, userId);
    return row ? rowToStored(row) : null;
  }

  async findByChannelAndIdentity(
    workspaceId: string,
    channel: StoredApprovalSurfaceIdentity["channel"],
    externalIdentity: string,
  ): Promise<StoredApprovalSurfaceIdentity | null> {
    const row = await this.queries.findByChannelAndIdentity(workspaceId, channel, externalIdentity);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredApprovalSurfaceIdentity): Promise<StoredApprovalSurfaceIdentity> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      channel: input.channel,
      userId: input.userId,
      externalIdentity: input.externalIdentity,
      label: input.label,
      status: input.status,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(
    id: string,
    input: Partial<StoredApprovalSurfaceIdentity>,
  ): Promise<StoredApprovalSurfaceIdentity> {
    const row = await this.queries.update(id, stripUndefined({
      externalIdentity: input.externalIdentity,
      label: input.label,
      status: input.status,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }

  async remove(id: string): Promise<void> {
    await this.queries.remove(id);
  }
}
