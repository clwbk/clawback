import { inboxItemRecordSchema } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  CreateInboxItemInput,
  InboxItemRecordView,
  InboxItemStore,
  StoredInboxItem,
  UpdateInboxItemInput,
} from "./types.js";

type InboxItemServiceOptions = {
  store: InboxItemStore;
  now?: () => Date;
};

export class InboxItemService {
  private readonly now: () => Date;

  constructor(private readonly options: InboxItemServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(workspaceId: string): Promise<{ items: InboxItemRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { items: rows.map((r) => this.toProjectionView(r)) };
  }

  async listOpen(workspaceId: string): Promise<{ items: InboxItemRecordView[] }> {
    const rows = await this.options.store.listOpen(workspaceId);
    return { items: rows.map((r) => this.toProjectionView(r)) };
  }

  async getById(workspaceId: string, id: string): Promise<InboxItemRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new InboxItemNotFoundError(id);
    return this.toProjectionView(row);
  }

  async create(workspaceId: string, input: CreateInboxItemInput): Promise<InboxItemRecordView> {
    const now = this.now();
    const stored: StoredInboxItem = {
      id: createClawbackId("inb"),
      workspaceId,
      kind: input.kind,
      title: input.title,
      summary: input.summary ?? null,
      assigneeIds: input.assigneeIds ?? [],
      workerId: input.workerId ?? null,
      workItemId: input.workItemId ?? null,
      reviewId: input.reviewId ?? null,
      routeKind: input.routeKind ?? null,
      state: "open",
      triageJson: input.triageJson ?? null,
      executionStateJson: input.executionStateJson ?? null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.options.store.create(stored);
    return this.toProjectionView(created);
  }

  async findByReviewId(workspaceId: string, reviewId: string): Promise<InboxItemRecordView | null> {
    const row = await this.options.store.findByReviewId(workspaceId, reviewId);
    return row ? this.toProjectionView(row) : null;
  }

  async findByWorkItemId(workspaceId: string, workItemId: string): Promise<InboxItemRecordView | null> {
    const row = this.options.store.findByWorkItemId
      ? await this.options.store.findByWorkItemId(workspaceId, workItemId)
      : (await this.options.store.listByWorkspace(workspaceId)).find(
          (item) => item.workItemId === workItemId,
        ) ?? null;
    return row ? this.toProjectionView(row) : null;
  }

  async resolve(workspaceId: string, id: string): Promise<InboxItemRecordView> {
    return this.updateState(workspaceId, id, "resolved");
  }

  async dismiss(workspaceId: string, id: string): Promise<InboxItemRecordView> {
    return this.updateState(workspaceId, id, "dismissed");
  }

  async update(workspaceId: string, id: string, input: UpdateInboxItemInput): Promise<InboxItemRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new InboxItemNotFoundError(id);

    const now = this.now();
    const updates: Partial<StoredInboxItem> = { updatedAt: now };
    if (input.state !== undefined) updates.state = input.state;
    if (input.title !== undefined) updates.title = input.title;
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.assigneeIds !== undefined) updates.assigneeIds = input.assigneeIds;
    if (input.workItemId !== undefined) updates.workItemId = input.workItemId;
    if (input.executionStateJson !== undefined) updates.executionStateJson = input.executionStateJson;

    const updated = await this.options.store.update(id, updates);
    return this.toProjectionView(updated);
  }

  private async updateState(workspaceId: string, id: string, state: "resolved" | "dismissed"): Promise<InboxItemRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new InboxItemNotFoundError(id);
    if (existing.state !== "open") {
      throw new InboxItemStateError(id, existing.state, state);
    }
    const updated = await this.options.store.update(id, { state, updatedAt: this.now() });
    return this.toProjectionView(updated);
  }

  // `inbox_item` exposes a synced execution projection for operator UX only.
  private toProjectionView(row: StoredInboxItem): InboxItemRecordView {
    return inboxItemRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      kind: row.kind,
      title: row.title,
      summary: row.summary,
      assignee_ids: row.assigneeIds,
      worker_id: row.workerId,
      work_item_id: row.workItemId,
      review_id: row.reviewId,
      route_kind: row.routeKind,
      state: row.state,
      triage_json: row.triageJson ?? null,
      execution_state_json: row.executionStateJson ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class InboxItemNotFoundError extends Error {
  readonly code = "inbox_item_not_found";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Inbox item not found: ${id}`);
  }
}

export class InboxItemStateError extends Error {
  readonly code = "inbox_item_invalid_state";
  readonly statusCode = 409;
  constructor(id: string, current: string, target: string) {
    super(`Inbox item ${id} is ${current}, cannot transition to ${target}`);
  }
}
