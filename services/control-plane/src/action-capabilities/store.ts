import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createActionCapabilityQueries } from "@clawback/db";

import type { ActionCapabilityStore, StoredActionCapability } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(
  row: Awaited<ReturnType<ReturnType<typeof createActionCapabilityQueries>["listByWorkspace"]>>[number],
): StoredActionCapability {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workerId: row.workerId,
    kind: row.kind,
    boundaryMode: row.boundaryMode,
    reviewerIds: row.reviewerIds as string[],
    destinationConnectionId: row.destinationConnectionId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleActionCapabilityStore implements ActionCapabilityStore {
  private readonly queries: ReturnType<typeof createActionCapabilityQueries>;

  constructor(db: Db) {
    this.queries = createActionCapabilityQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredActionCapability[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredActionCapability | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredActionCapability): Promise<StoredActionCapability> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      workerId: input.workerId,
      kind: input.kind,
      boundaryMode: input.boundaryMode,
      reviewerIds: input.reviewerIds,
      destinationConnectionId: input.destinationConnectionId,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredActionCapability>): Promise<StoredActionCapability> {
    const updates: Parameters<typeof this.queries.update>[1] = {};
    if (input.kind !== undefined) updates.kind = input.kind;
    if (input.boundaryMode !== undefined) updates.boundaryMode = input.boundaryMode;
    if (input.reviewerIds !== undefined) updates.reviewerIds = input.reviewerIds;
    if (input.destinationConnectionId !== undefined) {
      updates.destinationConnectionId = input.destinationConnectionId;
    }
    if (input.updatedAt !== undefined) updates.updatedAt = input.updatedAt;

    const row = await this.queries.update(id, updates);
    return rowToStored(row);
  }
}
