import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createActivityEventQueries } from "@clawback/db";

import type { ActivityEventStore, StoredActivityEvent } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(row: Awaited<ReturnType<ReturnType<typeof createActivityEventQueries>["listByWorkspace"]>>[number]): StoredActivityEvent {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    timestamp: row.timestamp,
    workerId: row.workerId,
    routeKind: row.routeKind,
    resultKind: row.resultKind,
    title: row.title,
    summary: row.summary,
    assigneeIds: row.assigneeIds as string[],
    runId: row.runId,
    workItemId: row.workItemId,
    reviewId: row.reviewId,
  };
}

export class DrizzleActivityEventStore implements ActivityEventStore {
  private readonly queries: ReturnType<typeof createActivityEventQueries>;

  constructor(db: Db) {
    this.queries = createActivityEventQueries(db as any);
  }

  async listByWorkspace(workspaceId: string, limit?: number): Promise<StoredActivityEvent[]> {
    const rows = await this.queries.listByWorkspace(workspaceId, limit);
    return rows.map(rowToStored);
  }

  async findByReviewResult(
    workspaceId: string,
    reviewId: string,
    resultKind: string,
  ): Promise<StoredActivityEvent | null> {
    const row = await this.queries.findByReviewResult(workspaceId, reviewId, resultKind);
    return row ? rowToStored(row) : null;
  }

  async findByWorkItemResult(
    workspaceId: string,
    workItemId: string,
    resultKind: string,
  ): Promise<StoredActivityEvent | null> {
    const row = await this.queries.findByWorkItemResult(workspaceId, workItemId, resultKind);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredActivityEvent): Promise<StoredActivityEvent> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      timestamp: input.timestamp,
      workerId: input.workerId,
      routeKind: input.routeKind,
      resultKind: input.resultKind,
      title: input.title,
      summary: input.summary,
      assigneeIds: input.assigneeIds,
      runId: input.runId,
      workItemId: input.workItemId,
      reviewId: input.reviewId,
    });
    return rowToStored(row);
  }
}
