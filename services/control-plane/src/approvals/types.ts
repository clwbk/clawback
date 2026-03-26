import type { z } from "zod";

import type {
  approvalDecisionRecordSchema,
  approvalRequestRecordSchema,
  getApprovalResponseSchema,
  listApprovalsResponseSchema,
  resolveApprovalRequestSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

export type StoredApprovalRequest = {
  id: string;
  workspaceId: string;
  runId: string;
  toolInvocationId: string;
  toolName: string;
  actionType: string;
  riskClass: "safe" | "guarded" | "approval_gated" | "restricted";
  status: "pending" | "approved" | "denied" | "expired" | "canceled";
  requestedBy: string | null;
  approverScopeJson: Record<string, unknown>;
  requestPayloadJson: Record<string, unknown>;
  decisionDueAt: Date | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredApprovalDecision = {
  id: string;
  workspaceId: string;
  approvalRequestId: string;
  runId: string;
  decision: "approved" | "denied" | "expired" | "canceled";
  decidedBy: string | null;
  rationale: string | null;
  payloadJson: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
};

export type StoredAuditEvent = {
  id: string;
  workspaceId: string;
  actorType: "user" | "service" | "system";
  actorId: string;
  eventType: string;
  targetType: string;
  targetId: string | null;
  summary: string;
  payloadJson: Record<string, unknown>;
  occurredAt: Date;
};

export type StoredRun = {
  id: string;
  workspaceId: string;
  status:
    | "queued"
    | "running"
    | "waiting_for_approval"
    | "completed"
    | "failed"
    | "canceled";
  currentStep: string | null;
  updatedAt: Date;
};

export type StoredRunEvent = {
  id: string;
  workspaceId: string;
  runId: string;
  eventType: string;
  sequence: number;
  actorType: "user" | "service" | "system";
  actorId: string;
  payloadJson: Record<string, unknown>;
  occurredAt: Date;
};

export interface ApprovalStore {
  runInTransaction<T>(callback: (store: ApprovalStore) => Promise<T>): Promise<T>;
  listApprovalRequests(workspaceId: string): Promise<StoredApprovalRequest[]>;
  findApprovalRequest(workspaceId: string, approvalId: string): Promise<StoredApprovalRequest | null>;
  listApprovalDecisions(workspaceId: string, approvalId: string): Promise<StoredApprovalDecision[]>;
  updateApprovalRequest(
    approvalId: string,
    patch: Partial<
      Pick<StoredApprovalRequest, "status" | "resolvedAt" | "updatedAt" | "requestPayloadJson">
    >,
  ): Promise<StoredApprovalRequest>;
  createApprovalDecision(input: StoredApprovalDecision): Promise<StoredApprovalDecision>;
  updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "currentStep" | "updatedAt">>,
  ): Promise<StoredRun>;
  getMaxRunEventSequence(runId: string): Promise<number>;
  appendRunEvent(event: StoredRunEvent): Promise<void>;
  appendAuditEvent(event: StoredAuditEvent): Promise<void>;
}

export type ApprovalRequestView = z.infer<typeof approvalRequestRecordSchema>;
export type ApprovalDecisionView = z.infer<typeof approvalDecisionRecordSchema>;
export type ApprovalListView = z.infer<typeof listApprovalsResponseSchema>;
export type ApprovalDetailView = z.infer<typeof getApprovalResponseSchema>;
export type ResolveApprovalInputDto = z.infer<typeof resolveApprovalRequestSchema>;

export interface ApprovalServiceContract {
  listApprovals(actor: SessionContext): Promise<ApprovalListView>;
  getApproval(actor: SessionContext, approvalId: string): Promise<ApprovalDetailView>;
  resolveApproval(
    actor: SessionContext,
    approvalId: string,
    input: ResolveApprovalInputDto,
  ): Promise<ApprovalDetailView>;
}
