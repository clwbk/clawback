import type {
  ExternalWorkflowRequest,
  ReviewRecord,
  ReviewActionKind,
  ReviewStatus,
  InputRouteKind,
} from "@clawback/contracts";

export type StoredReview = {
  id: string;
  workspaceId: string;
  actionKind: ReviewActionKind;
  status: ReviewStatus;
  workerId: string;
  workItemId: string | null;
  reviewerIds: string[];
  assigneeIds: string[];
  sourceRouteKind: InputRouteKind | null;
  actionDestination: string | null;
  requestPayloadJson?: ExternalWorkflowRequest | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateReviewInput = {
  actionKind: ReviewActionKind;
  workerId: string;
  workItemId?: string | null;
  reviewerIds?: string[];
  assigneeIds?: string[];
  sourceRouteKind?: InputRouteKind | null;
  actionDestination?: string | null;
  requestPayload?: ExternalWorkflowRequest | null;
};

export type ResolveReviewInput = {
  status: "approved" | "denied";
};

export interface ReviewStore {
  listByWorkspace(workspaceId: string): Promise<StoredReview[]>;
  listPending(workspaceId: string): Promise<StoredReview[]>;
  findById(workspaceId: string, id: string): Promise<StoredReview | null>;
  create(input: StoredReview): Promise<StoredReview>;
  update(id: string, input: Partial<StoredReview>): Promise<StoredReview>;
  remove(id: string): Promise<void>;
}

export type ReviewRecordView = ReviewRecord;
