import type { z } from "zod";

import type {
  messageSchema,
  runEventSchema,
  runExecuteJobSchema,
  runRecordSchema,
  runSnapshotSchema,
} from "@clawback/contracts";

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

export interface RunExecutionStore {
  getRunExecutionContext(
    workspaceId: string,
    runId: string,
  ): Promise<{ run: StoredRun; snapshot: StoredRunSnapshot } | null>;
  updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "startedAt" | "completedAt" | "currentStep" | "summary" | "updatedAt">>,
  ): Promise<StoredRun>;
  getMaxRunEventSequence(runId: string): Promise<number>;
  appendRunEvent(event: StoredRunEvent): Promise<void>;
  getNextMessageSequence(conversationId: string): Promise<number>;
  createMessage(message: StoredMessage): Promise<StoredMessage>;
  touchConversation(conversationId: string, timestamp: Date): Promise<void>;
}

export type RunJob = z.infer<typeof runExecuteJobSchema>;
export type RunRecordView = z.infer<typeof runRecordSchema>;
export type RunSnapshotView = z.infer<typeof runSnapshotSchema>;
export type RunEventView = z.infer<typeof runEventSchema>;
export type MessageView = z.infer<typeof messageSchema>;
