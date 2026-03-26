import type {
  ReviewDecisionRecord,
  ReviewDecisionSurface,
} from "@clawback/contracts";

export type StoredReviewDecision = {
  id: string;
  workspaceId: string;
  reviewId: string;
  decision: "approved" | "denied";
  surface: ReviewDecisionSurface;
  decidedByUserId: string | null;
  actorExternalId: string | null;
  rationale: string | null;
  payloadJson: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
};

export interface ReviewDecisionStore {
  findByReviewId(workspaceId: string, reviewId: string): Promise<StoredReviewDecision | null>;
  create(input: StoredReviewDecision): Promise<StoredReviewDecision>;
}

export type ReviewDecisionRecordView = ReviewDecisionRecord;
