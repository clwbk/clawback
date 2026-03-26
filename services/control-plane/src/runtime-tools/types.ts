import type { z } from "zod";

import type {
  approvalRequestRecordSchema,
  runtimeCreateTicketRequestSchema,
  runtimeCreateTicketResponseSchema,
  runtimeDraftTicketRequestSchema,
  runtimeDraftTicketResponseSchema,
  runtimeTicketLookupRequestSchema,
  runtimeTicketLookupResponseSchema,
  ticketDraftSchema,
  ticketRecordSchema,
} from "@clawback/contracts";

export type StoredRun = {
  id: string;
  workspaceId: string;
  conversationId: string;
  initiatedBy: string;
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

export type StoredTicketRecord = {
  id: string;
  workspaceId: string;
  runId: string | null;
  approvalRequestId: string | null;
  provider: "mock";
  status: "draft" | "created" | "failed";
  externalRef: string | null;
  title: string;
  summary: string;
  bodyJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
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

export interface RuntimeToolStore {
  findActiveRunBySessionKey(sessionKey: string): Promise<StoredRun | null>;
  getMaxRunEventSequence(runId: string): Promise<number>;
  appendRunEvent(input: StoredRunEvent): Promise<void>;
  updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "currentStep" | "updatedAt">>,
  ): Promise<StoredRun>;
  searchTickets(input: { workspaceId: string; query?: string; limit?: number }): Promise<StoredTicketRecord[]>;
  createTicket(input: StoredTicketRecord): Promise<StoredTicketRecord>;
  findApprovalRequestByRunToolInvocation(runId: string, toolInvocationId: string): Promise<StoredApprovalRequest | null>;
  findApprovalRequestById(approvalId: string): Promise<StoredApprovalRequest | null>;
  findApprovalDecisionByApprovalId(approvalId: string): Promise<StoredApprovalDecision | null>;
  createApprovalRequest(input: StoredApprovalRequest): Promise<StoredApprovalRequest>;
  findTicketByApprovalRequest(approvalRequestId: string): Promise<StoredTicketRecord | null>;
  appendAuditEvent(input: StoredAuditEvent): Promise<void>;
}

export type RuntimeTicketLookupInput = z.infer<typeof runtimeTicketLookupRequestSchema>;
export type RuntimeTicketLookupView = z.infer<typeof runtimeTicketLookupResponseSchema>;
export type RuntimeDraftTicketInput = z.infer<typeof runtimeDraftTicketRequestSchema>;
export type RuntimeDraftTicketView = z.infer<typeof runtimeDraftTicketResponseSchema>;
export type RuntimeCreateTicketInput = z.infer<typeof runtimeCreateTicketRequestSchema>;
export type RuntimeCreateTicketView = z.infer<typeof runtimeCreateTicketResponseSchema>;
export type RuntimeApprovalView = z.infer<typeof approvalRequestRecordSchema>;
export type TicketDraftView = z.infer<typeof ticketDraftSchema>;
export type TicketRecordView = z.infer<typeof ticketRecordSchema>;

export type FollowUpDraftInput = {
  runtime_session_key: string;
  tool_invocation_id: string;
  draft: {
    to?: string;
    subject?: string;
    body?: string;
    context_summary?: string;
    source_event_id?: string;
  };
};

export type FollowUpDraftResult = {
  draft: {
    work_item_id: string;
    status: string;
    to: string | null;
    subject: string | null;
    body: string | null;
  };
};

export type FollowUpRecapInput = {
  runtime_session_key: string;
  tool_invocation_id: string;
  recap: {
    to?: string;
    subject?: string;
    meeting_summary?: string;
    action_items?: string[];
    decisions?: string[];
  };
};

export type FollowUpRecapResult = {
  draft: {
    work_item_id: string;
    status: string;
    to: string | null;
    subject: string | null;
    meeting_summary: string | null;
    action_items: string[];
    decisions: string[];
  };
};

export type FollowUpRequestSendInput = {
  runtime_session_key: string;
  tool_invocation_id: string;
  send_request: {
    work_item_id: string;
    to: string;
    subject: string;
    body: string;
  };
};

export type FollowUpRequestSendResult = {
  status: string;
  approval_request_id: string;
  message: string;
};

export interface RuntimeToolServiceContract {
  lookupTickets(input: RuntimeTicketLookupInput): Promise<RuntimeTicketLookupView>;
  draftTicket(input: RuntimeDraftTicketInput): Promise<RuntimeDraftTicketView>;
  createTicket(input: RuntimeCreateTicketInput): Promise<RuntimeCreateTicketView>;
  draftFollowUp(input: FollowUpDraftInput): Promise<FollowUpDraftResult>;
  draftRecap(input: FollowUpRecapInput): Promise<FollowUpRecapResult>;
  requestSend(input: FollowUpRequestSendInput): Promise<FollowUpRequestSendResult>;
}
