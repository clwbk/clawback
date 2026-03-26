import { workerRecordSchema } from "@clawback/contracts";
import { createClawbackId, buildUniqueSlug } from "@clawback/domain";

import type {
  CreateWorkerInput,
  StoredWorker,
  UpdateWorkerInput,
  WorkerRecordView,
  WorkerStore,
} from "./types.js";

type WorkerServiceOptions = {
  store: WorkerStore;
  now?: () => Date;
};

export class WorkerService {
  private readonly now: () => Date;

  constructor(private readonly options: WorkerServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(workspaceId: string): Promise<{ workers: WorkerRecordView[] }> {
    const rows = await this.options.store.list(workspaceId);
    return { workers: rows.map((row) => this.toView(row)) };
  }

  async getById(workspaceId: string, id: string): Promise<WorkerRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new WorkerNotFoundError(id);
    return this.toView(row);
  }

  async create(workspaceId: string, input: CreateWorkerInput): Promise<WorkerRecordView> {
    const now = this.now();
    const existing = await this.options.store.list(workspaceId);
    const slugs = existing.map((w) => w.slug);
    const slug = buildUniqueSlug(input.name, slugs);

    const stored: StoredWorker = {
      id: createClawbackId("wkr"),
      workspaceId,
      slug,
      name: input.name,
      kind: input.kind,
      scope: input.scope,
      status: "draft",
      summary: input.summary ?? null,
      memberIds: input.memberIds ?? [],
      assigneeIds: input.assigneeIds ?? [],
      reviewerIds: input.reviewerIds ?? [],
      inputRouteIds: [],
      connectionIds: [],
      actionIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const created = await this.options.store.create(stored);
    return this.toView(created);
  }

  async update(workspaceId: string, id: string, input: UpdateWorkerInput): Promise<WorkerRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new WorkerNotFoundError(id);

    const now = this.now();
    const updates: Partial<StoredWorker> = { updatedAt: now };
    if (input.name !== undefined) updates.name = input.name;
    if (input.status !== undefined) updates.status = input.status;
    if (input.summary !== undefined) updates.summary = input.summary;
    if (input.memberIds !== undefined) updates.memberIds = input.memberIds;
    if (input.assigneeIds !== undefined) updates.assigneeIds = input.assigneeIds;
    if (input.reviewerIds !== undefined) updates.reviewerIds = input.reviewerIds;
    if (input.inputRouteIds !== undefined) updates.inputRouteIds = input.inputRouteIds;
    if (input.connectionIds !== undefined) updates.connectionIds = input.connectionIds;
    if (input.actionIds !== undefined) updates.actionIds = input.actionIds;

    const updated = await this.options.store.update(id, updates);
    return this.toView(updated);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new WorkerNotFoundError(id);
    await this.options.store.remove(id);
  }

  private toView(row: StoredWorker): WorkerRecordView {
    return workerRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      slug: row.slug,
      name: row.name,
      kind: row.kind,
      scope: row.scope,
      status: row.status,
      summary: row.summary,
      member_ids: row.memberIds,
      assignee_ids: row.assigneeIds,
      reviewer_ids: row.reviewerIds,
      input_route_ids: row.inputRouteIds,
      connection_ids: row.connectionIds,
      action_ids: row.actionIds,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class WorkerNotFoundError extends Error {
  readonly code = "worker_not_found";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Worker not found: ${id}`);
  }
}
