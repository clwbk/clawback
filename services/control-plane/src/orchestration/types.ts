import type { z } from "zod";

import type {
  conversationListQuerySchema,
  conversationListResponseSchema,
  conversationDetailResponseSchema,
  conversationSchema,
  createConversationRequestSchema,
  createRunRequestSchema,
  createRunResponseSchema,
  getRunResponseSchema,
  runEventSchema,
  runEventListResponseSchema,
  runSnapshotSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

export type StoredAgent = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  scope: "personal" | "shared";
  ownerUserId: string | null;
  status: "active" | "archived";
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredAgentVersion = {
  id: string;
  workspaceId: string;
  agentId: string;
  versionNumber: number;
  status: "draft" | "published" | "superseded";
  personaJson: Record<string, unknown>;
  instructionsMarkdown: string;
  modelRoutingJson: Record<string, unknown>;
  toolPolicyJson: Record<string, unknown>;
  connectorPolicyJson: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  publishedAt: Date | null;
};

export type StoredConversation = {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  channel: "web";
  startedBy: string;
  status: "active" | "archived";
  title: string | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredMessage = {
  id: string;
  workspaceId: string;
  conversationId: string;
  runId: string | null;
  sequence: number;
  role: "user" | "assistant";
  authorUserId: string | null;
  contentJson: unknown[];
  citationsJson: unknown[] | null;
  tokenUsageJson: Record<string, number> | null;
  createdAt: Date;
};

export type StoredRun = {
  id: string;
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  conversationId: string;
  inputMessageId: string;
  initiatedBy: string;
  channel: "web";
  status:
    | "queued"
    | "running"
    | "waiting_for_approval"
    | "completed"
    | "failed"
    | "canceled";
  startedAt: Date | null;
  completedAt: Date | null;
  currentStep: string | null;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredRunSnapshot = {
  id: string;
  workspaceId: string;
  runId: string;
  snapshotVersion: number;
  agentSnapshotJson: Record<string, unknown>;
  toolPolicyJson: Record<string, unknown>;
  connectorScopeJson: Record<string, unknown>;
  modelProfileJson: Record<string, unknown>;
  actorSummaryJson: Record<string, unknown>;
  approvalPolicyJson: Record<string, unknown>;
  conversationBindingJson: Record<string, unknown>;
  inputMessageJson: Record<string, unknown>;
  createdAt: Date;
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
  createdAt?: Date;
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

export type AgentConversationBinding = {
  agent: StoredAgent;
  publishedVersion: StoredAgentVersion | null;
};

export type ConversationBundle = {
  conversation: StoredConversation;
  agent: StoredAgent;
  agentVersion: StoredAgentVersion;
};

export interface RunQueue {
  enqueueRun(job: z.infer<typeof import("@clawback/contracts").runExecuteJobSchema>): Promise<void>;
}

export interface OrchestrationStore {
  runInTransaction<T>(callback: (store: OrchestrationStore) => Promise<T>): Promise<T>;
  findAgentConversationBinding(
    workspaceId: string,
    agentId: string,
  ): Promise<AgentConversationBinding | null>;
  listConversations(
    workspaceId: string,
    options?: {
      agentId?: string;
      startedBy?: string;
    },
  ): Promise<StoredConversation[]>;
  createConversation(input: Omit<StoredConversation, "channel" | "status" | "title"> & {
    channel?: "web";
    status?: "active" | "archived";
    title?: string | null;
  }): Promise<StoredConversation>;
  findConversationBundle(
    workspaceId: string,
    conversationId: string,
  ): Promise<ConversationBundle | null>;
  listMessages(workspaceId: string, conversationId: string): Promise<StoredMessage[]>;
  getNextMessageSequence(conversationId: string): Promise<number>;
  createMessage(input: StoredMessage): Promise<StoredMessage>;
  touchConversation(conversationId: string, timestamp: Date): Promise<void>;
  createRun(input: StoredRun): Promise<StoredRun>;
  updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "completedAt" | "currentStep" | "summary" | "updatedAt">>,
  ): Promise<StoredRun>;
  createRunSnapshot(input: StoredRunSnapshot): Promise<StoredRunSnapshot>;
  appendRunEvent(input: StoredRunEvent): Promise<StoredRunEvent>;
  appendAuditEvent(input: StoredAuditEvent): Promise<void>;
  getRunEventsAfter(runId: string, afterSequence: number): Promise<StoredRunEvent[]>;
  findRunById(workspaceId: string, runId: string): Promise<StoredRun | null>;
}

export type ListConversationsInputDto = z.infer<typeof conversationListQuerySchema>;
export type CreateConversationInputDto = z.infer<typeof createConversationRequestSchema>;
export type CreateRunInputDto = z.infer<typeof createRunRequestSchema>;
export type ConversationView = z.infer<typeof conversationSchema>;
export type ConversationListView = z.infer<typeof conversationListResponseSchema>;
export type ConversationDetailView = z.infer<typeof conversationDetailResponseSchema>;
export type CreateRunView = z.infer<typeof createRunResponseSchema>;
export type RunRecordView = z.infer<typeof getRunResponseSchema>;
export type RunSnapshotView = z.infer<typeof runSnapshotSchema>;
export type RunEventView = z.infer<typeof runEventSchema>;
export type RunEventListView = z.infer<typeof runEventListResponseSchema>;

export interface ConversationRunServiceContract {
  listConversations(
    actor: SessionContext,
    input: ListConversationsInputDto,
  ): Promise<ConversationListView>;
  createConversation(actor: SessionContext, input: CreateConversationInputDto): Promise<ConversationView>;
  getConversation(actor: SessionContext, conversationId: string): Promise<ConversationDetailView>;
  createRun(actor: SessionContext, input: CreateRunInputDto): Promise<CreateRunView>;
  getRun(actor: SessionContext, runId: string): Promise<RunRecordView>;
  listRunEvents(actor: SessionContext, runId: string): Promise<RunEventView[]>;
  getRunStreamContext(
    actor: SessionContext,
    runId: string,
  ): Promise<{ runId: string; conversationId: string; terminal: boolean }>;
  listRunEventsAfter(
    actor: SessionContext,
    runId: string,
    afterSequence: number,
  ): Promise<RunEventView[]>;
}
