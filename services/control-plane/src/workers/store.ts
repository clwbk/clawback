import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createWorkerQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { StoredWorker, WorkerStore } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(row: Awaited<ReturnType<ReturnType<typeof createWorkerQueries>["list"]>>[number]): StoredWorker {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    slug: row.slug,
    name: row.name,
    kind: row.kind,
    scope: row.scope,
    status: row.status,
    summary: row.summary,
    memberIds: row.memberIds as string[],
    assigneeIds: row.assigneeIds as string[],
    reviewerIds: row.reviewerIds as string[],
    inputRouteIds: row.inputRouteIds as string[],
    connectionIds: row.connectionIds as string[],
    actionIds: row.actionIds as string[],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleWorkerStore implements WorkerStore {
  private readonly queries: ReturnType<typeof createWorkerQueries>;

  constructor(db: Db) {
    this.queries = createWorkerQueries(db as any);
  }

  async list(workspaceId: string): Promise<StoredWorker[]> {
    const rows = await this.queries.list(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredWorker | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async findBySlug(workspaceId: string, slug: string): Promise<StoredWorker | null> {
    const row = await this.queries.findBySlug(workspaceId, slug);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredWorker): Promise<StoredWorker> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      slug: input.slug,
      name: input.name,
      kind: input.kind,
      scope: input.scope,
      status: input.status,
      summary: input.summary,
      memberIds: input.memberIds,
      assigneeIds: input.assigneeIds,
      reviewerIds: input.reviewerIds,
      inputRouteIds: input.inputRouteIds,
      connectionIds: input.connectionIds,
      actionIds: input.actionIds,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredWorker>): Promise<StoredWorker> {
    const row = await this.queries.update(id, stripUndefined({
      name: input.name,
      status: input.status,
      summary: input.summary,
      memberIds: input.memberIds,
      assigneeIds: input.assigneeIds,
      reviewerIds: input.reviewerIds,
      inputRouteIds: input.inputRouteIds,
      connectionIds: input.connectionIds,
      actionIds: input.actionIds,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }

  async remove(id: string): Promise<void> {
    await this.queries.remove(id);
  }
}
