import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import {
  executionContinuityStateSchema,
  type InboxItemExecutionProjectionRecord,
} from "@clawback/contracts";
import { createInboxItemQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { InboxItemStore, StoredInboxItem } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(row: Awaited<ReturnType<ReturnType<typeof createInboxItemQueries>["listByWorkspace"]>>[number]): StoredInboxItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    kind: row.kind,
    title: row.title,
    summary: row.summary,
    assigneeIds: row.assigneeIds as string[],
    workerId: row.workerId,
    workItemId: row.workItemId,
    reviewId: row.reviewId,
    routeKind: row.routeKind,
    state: row.state,
    triageJson: (row.triageJson ?? null) as StoredInboxItem["triageJson"],
    executionStateJson: row.executionStateJson
      ? executionContinuityStateSchema.parse(row.executionStateJson) as InboxItemExecutionProjectionRecord
      : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleInboxItemStore implements InboxItemStore {
  private readonly queries: ReturnType<typeof createInboxItemQueries>;

  constructor(db: Db) {
    this.queries = createInboxItemQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredInboxItem[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async listOpen(workspaceId: string): Promise<StoredInboxItem[]> {
    const rows = await this.queries.listOpen(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredInboxItem | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async findByReviewId(workspaceId: string, reviewId: string): Promise<StoredInboxItem | null> {
    const row = await this.queries.findByReviewId(workspaceId, reviewId);
    return row ? rowToStored(row) : null;
  }

  async findByWorkItemId(workspaceId: string, workItemId: string): Promise<StoredInboxItem | null> {
    const row = await this.queries.findByWorkItemId(workspaceId, workItemId);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredInboxItem): Promise<StoredInboxItem> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      assigneeIds: input.assigneeIds,
      workerId: input.workerId,
      workItemId: input.workItemId,
      reviewId: input.reviewId,
      routeKind: input.routeKind,
      state: input.state,
      triageJson: input.triageJson,
      executionStateJson: input.executionStateJson,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredInboxItem>): Promise<StoredInboxItem> {
    const row = await this.queries.update(id, stripUndefined({
      kind: input.kind,
      title: input.title,
      summary: input.summary,
      assigneeIds: input.assigneeIds,
      workerId: input.workerId,
      workItemId: input.workItemId,
      reviewId: input.reviewId,
      routeKind: input.routeKind,
      state: input.state,
      executionStateJson: input.executionStateJson,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }

  async remove(id: string): Promise<void> {
    await this.queries.remove(id);
  }
}
