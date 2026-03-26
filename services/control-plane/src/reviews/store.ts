import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createReviewQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { ReviewStore, StoredReview } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(row: Awaited<ReturnType<ReturnType<typeof createReviewQueries>["listByWorkspace"]>>[number]): StoredReview {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    actionKind: row.actionKind,
    status: row.status,
    workerId: row.workerId,
    workItemId: row.workItemId,
    reviewerIds: row.reviewerIds as string[],
    assigneeIds: row.assigneeIds as string[],
    sourceRouteKind: row.sourceRouteKind,
    actionDestination: row.actionDestination,
    ...(row.requestPayloadJson !== null
      ? {
          requestPayloadJson: row.requestPayloadJson as NonNullable<
            StoredReview["requestPayloadJson"]
          >,
        }
      : {}),
    requestedAt: row.requestedAt,
    resolvedAt: row.resolvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleReviewStore implements ReviewStore {
  private readonly queries: ReturnType<typeof createReviewQueries>;

  constructor(db: Db) {
    this.queries = createReviewQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredReview[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async listPending(workspaceId: string): Promise<StoredReview[]> {
    const rows = await this.queries.listPending(workspaceId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredReview | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredReview): Promise<StoredReview> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      actionKind: input.actionKind,
      status: input.status,
      workerId: input.workerId,
      workItemId: input.workItemId,
      reviewerIds: input.reviewerIds,
      assigneeIds: input.assigneeIds,
      sourceRouteKind: input.sourceRouteKind,
      actionDestination: input.actionDestination,
      ...(input.requestPayloadJson !== undefined
        ? { requestPayloadJson: input.requestPayloadJson }
        : {}),
      requestedAt: input.requestedAt,
      resolvedAt: input.resolvedAt,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredReview>): Promise<StoredReview> {
    const row = await this.queries.update(id, stripUndefined({
      status: input.status,
      workItemId: input.workItemId,
      reviewerIds: input.reviewerIds,
      assigneeIds: input.assigneeIds,
      actionDestination: input.actionDestination,
      ...(input.requestPayloadJson !== undefined
        ? { requestPayloadJson: input.requestPayloadJson }
        : {}),
      resolvedAt: input.resolvedAt,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }

  async remove(id: string): Promise<void> {
    await this.queries.remove(id);
  }
}
