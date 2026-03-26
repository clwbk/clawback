import { workItemRecordSchema } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  CreateWorkItemInput,
  StoredWorkItem,
  UpdateWorkItemInput,
  WorkItemRecordView,
  WorkItemStore,
} from "./types.js";

type WorkItemServiceOptions = {
  store: WorkItemStore;
  now?: () => Date;
};

export class WorkItemService {
  private readonly now: () => Date;

  constructor(private readonly options: WorkItemServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async listByWorkspace(workspaceId: string): Promise<{ work_items: WorkItemRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { work_items: rows.map((r) => this.toAuthorityView(r)) };
  }

  async listByWorker(workerId: string): Promise<{ work_items: WorkItemRecordView[] }> {
    const rows = await this.options.store.listByWorker(workerId);
    return { work_items: rows.map((r) => this.toAuthorityView(r)) };
  }

  async getById(workspaceId: string, id: string): Promise<WorkItemRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new WorkItemNotFoundError(id);
    return this.toAuthorityView(row);
  }

  async findBySourceInboxItemId(
    workspaceId: string,
    sourceInboxItemId: string,
  ): Promise<WorkItemRecordView | null> {
    const row = this.options.store.findBySourceInboxItemId
      ? await this.options.store.findBySourceInboxItemId(workspaceId, sourceInboxItemId)
      : (await this.options.store.listByWorkspace(workspaceId)).find(
          (item) => item.sourceInboxItemId === sourceInboxItemId,
        ) ?? null;
    return row ? this.toAuthorityView(row) : null;
  }

  async create(workspaceId: string, input: CreateWorkItemInput): Promise<WorkItemRecordView> {
    const now = this.now();
    const stored: StoredWorkItem = {
      id: createClawbackId("wi"),
      workspaceId,
      workerId: input.workerId,
      kind: input.kind,
      status: "draft",
      title: input.title,
      summary: input.summary ?? null,
      draftTo: input.draftTo ?? null,
      draftSubject: input.draftSubject ?? null,
      draftBody: input.draftBody ?? null,
      executionStatus: input.executionStatus ?? "not_requested",
      executionError: input.executionError ?? null,
      assigneeIds: input.assigneeIds ?? [],
      reviewerIds: input.reviewerIds ?? [],
      sourceRouteKind: input.sourceRouteKind ?? null,
      sourceEventId: input.sourceEventId ?? null,
      sourceInboxItemId: input.sourceInboxItemId ?? null,
      reviewId: input.reviewId ?? null,
      runId: input.runId ?? null,
      triageJson: input.triageJson ?? null,
      executionStateJson: input.executionStateJson ?? null,
      executionOutcomeJson: input.executionOutcomeJson ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.options.store.create(stored);
    return this.toAuthorityView(created);
  }

  async update(workspaceId: string, id: string, input: UpdateWorkItemInput): Promise<WorkItemRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new WorkItemNotFoundError(id);

    const now = this.now();
    const updates: Partial<StoredWorkItem> = { updatedAt: now };
    if (input.status !== undefined) updates.status = input.status;
    if (input.title !== undefined) updates.title = input.title;
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.draftTo !== undefined) updates.draftTo = input.draftTo;
    if (input.draftSubject !== undefined) updates.draftSubject = input.draftSubject;
    if (input.draftBody !== undefined) updates.draftBody = input.draftBody;
    if (input.executionStatus !== undefined) updates.executionStatus = input.executionStatus;
    if (input.executionError !== undefined) updates.executionError = input.executionError;
    if (input.assigneeIds !== undefined) updates.assigneeIds = input.assigneeIds;
    if (input.reviewerIds !== undefined) updates.reviewerIds = input.reviewerIds;
    if (input.reviewId !== undefined) updates.reviewId = input.reviewId;
    if (input.runId !== undefined) updates.runId = input.runId;
    if (input.executionStateJson !== undefined) updates.executionStateJson = input.executionStateJson;
    if (input.executionOutcomeJson !== undefined) updates.executionOutcomeJson = input.executionOutcomeJson;

    const updated = await this.options.store.update(id, updates);
    return this.toAuthorityView(updated);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new WorkItemNotFoundError(id);
    await this.options.store.remove(id);
  }

  // `work_item` remains the authoritative persisted execution continuity view.
  private toAuthorityView(row: StoredWorkItem): WorkItemRecordView {
    return workItemRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      worker_id: row.workerId,
      kind: row.kind,
      status: row.status,
      title: row.title,
      summary: row.summary,
      draft_to: row.draftTo ?? null,
      draft_subject: row.draftSubject ?? null,
      draft_body: row.draftBody ?? null,
      execution_status: row.executionStatus ?? "not_requested",
      execution_error: row.executionError ?? null,
      assignee_ids: row.assigneeIds,
      reviewer_ids: row.reviewerIds,
      source_route_kind: row.sourceRouteKind,
      source_event_id: row.sourceEventId,
      source_inbox_item_id: row.sourceInboxItemId ?? null,
      review_id: row.reviewId,
      run_id: row.runId,
      triage_json: row.triageJson ?? null,
      execution_state_json: row.executionStateJson ?? null,
      execution_outcome_json: row.executionOutcomeJson ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class WorkItemNotFoundError extends Error {
  readonly code = "work_item_not_found";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Work item not found: ${id}`);
  }
}
