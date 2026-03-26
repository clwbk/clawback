import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createInputRouteQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { InputRouteStore, StoredInputRoute } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(
  row: Awaited<ReturnType<ReturnType<typeof createInputRouteQueries>["listByWorkspace"]>>[number],
): StoredInputRoute {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workerId: row.workerId,
    kind: row.kind,
    status: row.status,
    label: row.label,
    description: row.description,
    address: row.address,
    capabilityNote: row.capabilityNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleInputRouteStore implements InputRouteStore {
  private readonly queries: ReturnType<typeof createInputRouteQueries>;

  constructor(db: Db) {
    this.queries = createInputRouteQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredInputRoute[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredInputRoute | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredInputRoute): Promise<StoredInputRoute> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      workerId: input.workerId,
      kind: input.kind,
      status: input.status,
      label: input.label,
      description: input.description,
      address: input.address,
      capabilityNote: input.capabilityNote,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredInputRoute>): Promise<StoredInputRoute> {
    const row = await this.queries.update(id, stripUndefined({
      kind: input.kind,
      status: input.status,
      label: input.label,
      description: input.description,
      address: input.address,
      capabilityNote: input.capabilityNote,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }
}
