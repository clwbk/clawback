import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createConnectionQueries, type ConnectionInsert } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { ConnectionStore, StoredConnection } from "./types.js";

type Db = NodePgDatabase<typeof schema>;
type ConnectionQueryRows = Awaited<ReturnType<ReturnType<typeof createConnectionQueries>["list"]>>;
type ConnectionQueries = ReturnType<typeof createConnectionQueries> & {
  listAll(): Promise<ConnectionQueryRows>;
};

function rowToStored(row: ConnectionQueryRows[number]): StoredConnection {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    provider: row.provider,
    accessMode: row.accessMode,
    status: row.status,
    label: row.label,
    capabilities: row.capabilities as string[],
    attachedWorkerIds: row.attachedWorkerIds as string[],
    configJson: (row.configJson ?? {}) as Record<string, unknown>,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleConnectionStore implements ConnectionStore {
  private readonly queries: ConnectionQueries;

  constructor(db: Db) {
    this.queries = createConnectionQueries(db as any) as ConnectionQueries;
  }

  async listAll(): Promise<StoredConnection[]> {
    const rows = await this.queries.listAll();
    return rows.map(rowToStored);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredConnection[]> {
    const rows = await this.queries.list(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredConnection | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredConnection): Promise<StoredConnection> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      provider: input.provider,
      accessMode: input.accessMode,
      status: input.status,
      label: input.label,
      capabilities: input.capabilities,
      attachedWorkerIds: input.attachedWorkerIds,
      configJson: input.configJson ?? {},
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    } as ConnectionInsert);
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredConnection>): Promise<StoredConnection> {
    const row = await this.queries.update(id, stripUndefined({
      provider: input.provider,
      accessMode: input.accessMode,
      status: input.status,
      label: input.label,
      capabilities: input.capabilities,
      attachedWorkerIds: input.attachedWorkerIds,
      configJson: input.configJson,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }

  async remove(id: string): Promise<void> {
    await this.queries.remove(id);
  }
}
