import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import {
  executionContinuityStateSchema,
  type WorkItemExecutionContinuityRecord,
  type WorkItemExecutionOutcome,
} from "@clawback/contracts";
import { createWorkItemQueries } from "@clawback/db";

import { stripUndefined } from "../store-utils.js";
import type { StoredWorkItem, WorkItemStore } from "./types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(row: Awaited<ReturnType<ReturnType<typeof createWorkItemQueries>["listByWorkspace"]>>[number]): StoredWorkItem {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    workerId: row.workerId,
    kind: row.kind,
    status: row.status,
    title: row.title,
    summary: row.summary,
    draftTo: row.draftTo,
    draftSubject: row.draftSubject,
    draftBody: row.draftBody,
    executionStatus: row.executionStatus,
    executionError: row.executionError,
    assigneeIds: row.assigneeIds as string[],
    reviewerIds: row.reviewerIds as string[],
    sourceRouteKind: row.sourceRouteKind,
    sourceEventId: row.sourceEventId,
    sourceInboxItemId: row.sourceInboxItemId,
    reviewId: row.reviewId,
    runId: row.runId,
    triageJson: (row.triageJson ?? null) as StoredWorkItem["triageJson"],
    executionStateJson: row.executionStateJson
      ? executionContinuityStateSchema.parse(row.executionStateJson) as WorkItemExecutionContinuityRecord
      : null,
    executionOutcomeJson: (row.executionOutcomeJson ?? null) as WorkItemExecutionOutcome | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleWorkItemStore implements WorkItemStore {
  private readonly queries: ReturnType<typeof createWorkItemQueries>;

  constructor(db: Db) {
    this.queries = createWorkItemQueries(db as any);
  }

  async listByWorkspace(workspaceId: string): Promise<StoredWorkItem[]> {
    const rows = await this.queries.listByWorkspace(workspaceId);
    return rows.map(rowToStored);
  }

  async listByWorker(workerId: string): Promise<StoredWorkItem[]> {
    const rows = await this.queries.listByWorker(workerId);
    return rows.map(rowToStored);
  }

  async findById(workspaceId: string, id: string): Promise<StoredWorkItem | null> {
    const row = await this.queries.findById(workspaceId, id);
    return row ? rowToStored(row) : null;
  }

  async findBySourceInboxItemId(
    workspaceId: string,
    sourceInboxItemId: string,
  ): Promise<StoredWorkItem | null> {
    const row = await this.queries.findBySourceInboxItemId(workspaceId, sourceInboxItemId);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredWorkItem): Promise<StoredWorkItem> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      workerId: input.workerId,
      kind: input.kind,
      status: input.status,
      title: input.title,
      summary: input.summary,
      draftTo: input.draftTo,
      draftSubject: input.draftSubject,
      draftBody: input.draftBody,
      executionStatus: input.executionStatus,
      executionError: input.executionError,
      assigneeIds: input.assigneeIds,
      reviewerIds: input.reviewerIds,
      sourceRouteKind: input.sourceRouteKind,
      sourceEventId: input.sourceEventId,
      sourceInboxItemId: input.sourceInboxItemId,
      reviewId: input.reviewId,
      runId: input.runId,
      triageJson: input.triageJson,
      executionStateJson: input.executionStateJson,
      executionOutcomeJson: input.executionOutcomeJson,
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
    });
    return rowToStored(row);
  }

  async update(id: string, input: Partial<StoredWorkItem>): Promise<StoredWorkItem> {
    const row = await this.queries.update(id, stripUndefined({
      status: input.status,
      title: input.title,
      summary: input.summary,
      draftTo: input.draftTo,
      draftSubject: input.draftSubject,
      draftBody: input.draftBody,
      executionStatus: input.executionStatus,
      executionError: input.executionError,
      assigneeIds: input.assigneeIds,
      reviewerIds: input.reviewerIds,
      reviewId: input.reviewId,
      runId: input.runId,
      executionStateJson: input.executionStateJson,
      executionOutcomeJson: input.executionOutcomeJson,
      updatedAt: input.updatedAt,
    }) as any);
    return rowToStored(row);
  }

  async remove(id: string): Promise<void> {
    await this.queries.remove(id);
  }
}
