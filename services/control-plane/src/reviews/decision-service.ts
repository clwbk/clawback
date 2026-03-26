import { reviewDecisionRecordSchema, type ReviewDecisionSurface } from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type { ReviewRecordView } from "./types.js";
import type {
  ReviewDecisionRecordView,
  ReviewDecisionStore,
  StoredReviewDecision,
} from "./decision-types.js";

type RecordReviewDecisionInput = {
  decision: "approved" | "denied";
  surface: ReviewDecisionSurface;
  decidedByUserId?: string | null;
  actorExternalId?: string | null;
  rationale?: string | null;
  payload?: Record<string, unknown>;
  occurredAt?: Date;
};

type ReviewDecisionServiceOptions = {
  store: ReviewDecisionStore;
  now?: () => Date;
};

export class ReviewDecisionService {
  private readonly now: () => Date;

  constructor(private readonly options: ReviewDecisionServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async findByReviewId(
    workspaceId: string,
    reviewId: string,
  ): Promise<ReviewDecisionRecordView | null> {
    const row = await this.options.store.findByReviewId(workspaceId, reviewId);
    return row ? this.toView(row) : null;
  }

  async record(
    workspaceId: string,
    review: Pick<ReviewRecordView, "id" | "status">,
    input: RecordReviewDecisionInput,
  ): Promise<ReviewDecisionRecordView> {
    const existing = await this.options.store.findByReviewId(workspaceId, review.id);
    if (existing) {
      return this.toView(existing);
    }

    const occurredAt = input.occurredAt ?? this.now();
    const created = await this.options.store.create({
      id: createClawbackId("rdc"),
      workspaceId,
      reviewId: review.id,
      decision: input.decision,
      surface: input.surface,
      decidedByUserId: input.decidedByUserId ?? null,
      actorExternalId: input.actorExternalId ?? null,
      rationale: input.rationale ?? null,
      payloadJson: input.payload ?? {},
      occurredAt,
      createdAt: occurredAt,
    });
    return this.toView(created);
  }

  private toView(row: StoredReviewDecision): ReviewDecisionRecordView {
    return reviewDecisionRecordSchema.parse({
      id: row.id,
      workspace_id: row.workspaceId,
      review_id: row.reviewId,
      decision: row.decision,
      surface: row.surface,
      decided_by_user_id: row.decidedByUserId,
      actor_external_id: row.actorExternalId,
      rationale: row.rationale,
      payload: row.payloadJson,
      occurred_at: row.occurredAt.toISOString(),
      created_at: row.createdAt.toISOString(),
    });
  }
}
