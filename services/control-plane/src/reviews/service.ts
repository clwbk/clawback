import { reviewRecordSchema } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  CreateReviewInput,
  ResolveReviewInput,
  ReviewRecordView,
  ReviewStore,
  StoredReview,
} from "./types.js";

type ReviewServiceOptions = {
  store: ReviewStore;
  now?: () => Date;
};

export class ReviewService {
  private readonly now: () => Date;

  constructor(private readonly options: ReviewServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async list(workspaceId: string): Promise<{ reviews: ReviewRecordView[] }> {
    const rows = await this.options.store.listByWorkspace(workspaceId);
    return { reviews: rows.map((r) => this.toView(r)) };
  }

  async listPending(workspaceId: string): Promise<{ reviews: ReviewRecordView[] }> {
    const rows = await this.options.store.listPending(workspaceId);
    return { reviews: rows.map((r) => this.toView(r)) };
  }

  async getById(workspaceId: string, id: string): Promise<ReviewRecordView> {
    const row = await this.options.store.findById(workspaceId, id);
    if (!row) throw new ReviewNotFoundError(id);
    return this.toView(row);
  }

  async create(workspaceId: string, input: CreateReviewInput): Promise<ReviewRecordView> {
    const now = this.now();
    const stored: StoredReview = {
      id: createClawbackId("rev"),
      workspaceId,
      actionKind: input.actionKind,
      status: "pending",
      workerId: input.workerId,
      workItemId: input.workItemId ?? null,
      reviewerIds: input.reviewerIds ?? [],
      assigneeIds: input.assigneeIds ?? [],
      sourceRouteKind: input.sourceRouteKind ?? null,
      actionDestination: input.actionDestination ?? null,
      requestPayloadJson: input.requestPayload ?? null,
      requestedAt: now,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const created = await this.options.store.create(stored);
    return this.toView(created);
  }

  async resolve(workspaceId: string, id: string, input: ResolveReviewInput): Promise<{ review: ReviewRecordView; alreadyResolved: boolean }> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new ReviewNotFoundError(id);

    // Idempotent: if already resolved, return the existing result
    if (existing.status !== "pending") {
      return { review: this.toView(existing), alreadyResolved: true };
    }

    const now = this.now();
    const updated = await this.options.store.update(id, {
      status: input.status,
      resolvedAt: now,
      updatedAt: now,
    });
    return { review: this.toView(updated), alreadyResolved: false };
  }

  async setStatus(
    workspaceId: string,
    id: string,
    status: ReviewRecordView["status"],
  ): Promise<ReviewRecordView> {
    const existing = await this.options.store.findById(workspaceId, id);
    if (!existing) throw new ReviewNotFoundError(id);
    if (existing.status === status) {
      return this.toView(existing);
    }

    const now = this.now();
    const updated = await this.options.store.update(id, {
      status,
      resolvedAt: existing.resolvedAt ?? now,
      updatedAt: now,
    });
    return this.toView(updated);
  }

  private toView(row: StoredReview): ReviewRecordView {
    return reviewRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      action_kind: row.actionKind,
      status: row.status,
      worker_id: row.workerId,
      work_item_id: row.workItemId,
      reviewer_ids: row.reviewerIds,
      assignee_ids: row.assigneeIds,
      source_route_kind: row.sourceRouteKind,
      action_destination: row.actionDestination,
      request_payload: row.requestPayloadJson ?? null,
      requested_at: row.requestedAt.toISOString(),
      resolved_at: row.resolvedAt?.toISOString() ?? null,
      created_at: row.createdAt.toISOString(),
      updated_at: row.updatedAt.toISOString(),
    });
  }
}

export class ReviewNotFoundError extends Error {
  readonly code = "review_not_found";
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Review not found: ${id}`);
  }
}

export class ReviewStateError extends Error {
  readonly code = "review_invalid_state";
  readonly statusCode = 409;
  constructor(id: string, current: string, target: string) {
    super(`Review ${id} is ${current}, cannot transition to ${target}`);
  }
}
