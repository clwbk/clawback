import type {
  ApprovalSurfaceChannel,
  ApprovalSurfaceIdentityRecord,
  ApprovalSurfaceIdentityStatus,
  ReviewDecisionRecord,
} from "@clawback/contracts";

export type StoredApprovalSurfaceIdentity = {
  id: string;
  workspaceId: string;
  channel: ApprovalSurfaceChannel;
  userId: string;
  externalIdentity: string;
  label: string;
  status: ApprovalSurfaceIdentityStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateApprovalSurfaceIdentityInput = {
  channel: ApprovalSurfaceChannel;
  userId: string;
  externalIdentity: string;
  label?: string;
};

export type UpdateApprovalSurfaceIdentityInput = {
  externalIdentity?: string;
  label?: string;
  status?: ApprovalSurfaceIdentityStatus;
};

export interface ApprovalSurfaceIdentityStore {
  listByWorkspace(workspaceId: string): Promise<StoredApprovalSurfaceIdentity[]>;
  findById(workspaceId: string, id: string): Promise<StoredApprovalSurfaceIdentity | null>;
  findByChannelAndUser(
    workspaceId: string,
    channel: ApprovalSurfaceChannel,
    userId: string,
  ): Promise<StoredApprovalSurfaceIdentity | null>;
  findByChannelAndIdentity(
    workspaceId: string,
    channel: ApprovalSurfaceChannel,
    externalIdentity: string,
  ): Promise<StoredApprovalSurfaceIdentity | null>;
  create(input: StoredApprovalSurfaceIdentity): Promise<StoredApprovalSurfaceIdentity>;
  update(
    id: string,
    input: Partial<StoredApprovalSurfaceIdentity>,
  ): Promise<StoredApprovalSurfaceIdentity>;
  remove(id: string): Promise<void>;
}

export type ApprovalSurfaceIdentityRecordView = ApprovalSurfaceIdentityRecord;

export type ApprovalSurfaceActionTokenPayload = {
  version: 1;
  workspaceId: string;
  reviewId: string;
  channel: ApprovalSurfaceChannel;
  decision: ReviewDecisionRecord["decision"];
  userId: string;
  actorIdentity: string;
  expiresAt: string;
};
