import type { z } from "zod";

import type {
  agentDraftRecordSchema,
  agentRecordSchema,
  createAgentRequestSchema,
  getAgentDraftResponseSchema,
  publishAgentResponseSchema,
  publishAgentRequestSchema,
  updateAgentDraftRequestSchema,
  updateAgentRequestSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";
import type { RuntimePublicationResult } from "@clawback/model-adapters";

export type AgentScope = "personal" | "shared";
export type AgentStatus = "active" | "archived";
export type AgentVersionStatus = "draft" | "published" | "superseded";

export type StoredAgent = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  scope: AgentScope;
  ownerUserId: string | null;
  status: AgentStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredAgentVersion = {
  id: string;
  workspaceId: string;
  agentId: string;
  versionNumber: number;
  status: AgentVersionStatus;
  personaJson: Record<string, unknown>;
  instructionsMarkdown: string;
  modelRoutingJson: Record<string, unknown>;
  toolPolicyJson: Record<string, unknown>;
  connectorPolicyJson: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  publishedAt: Date | null;
};

export type AgentAggregate = {
  agent: StoredAgent;
  draftVersion: StoredAgentVersion | null;
  publishedVersion: StoredAgentVersion | null;
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

export type CreateAgentInput = StoredAgent;
export type CreateAgentVersionInput = StoredAgentVersion;

export type UpdateAgentInput = Partial<
  Pick<StoredAgent, "name" | "status" | "updatedAt">
>;

export type UpdateAgentVersionInput = Partial<
  Pick<
    StoredAgentVersion,
    | "status"
    | "personaJson"
    | "instructionsMarkdown"
    | "modelRoutingJson"
    | "toolPolicyJson"
    | "connectorPolicyJson"
    | "publishedAt"
  >
>;

export interface AgentStore {
  runInTransaction<T>(callback: (store: AgentStore) => Promise<T>): Promise<T>;
  listAgentSlugs(workspaceId: string): Promise<string[]>;
  listAgentAggregates(workspaceId: string): Promise<AgentAggregate[]>;
  findAgentAggregate(workspaceId: string, agentId: string): Promise<AgentAggregate | null>;
  createAgent(input: CreateAgentInput): Promise<StoredAgent>;
  createAgentVersion(input: CreateAgentVersionInput): Promise<StoredAgentVersion>;
  updateAgent(agentId: string, input: UpdateAgentInput): Promise<StoredAgent>;
  updateAgentVersion(versionId: string, input: UpdateAgentVersionInput): Promise<StoredAgentVersion>;
  supersedePublishedVersions(agentId: string): Promise<void>;
  appendAuditEvent(event: StoredAuditEvent): Promise<void>;
}

export type CreateAgentInputDto = z.infer<typeof createAgentRequestSchema>;
export type UpdateAgentInputDto = z.infer<typeof updateAgentRequestSchema>;
export type UpdateAgentDraftInputDto = z.infer<typeof updateAgentDraftRequestSchema>;
export type PublishAgentInputDto = z.infer<typeof publishAgentRequestSchema>;

export type AgentRecordView = z.infer<typeof agentRecordSchema>;
export type AgentDraftView = z.infer<typeof agentDraftRecordSchema>;
export type GetAgentDraftView = z.infer<typeof getAgentDraftResponseSchema>;
export type PublishAgentView = z.infer<typeof publishAgentResponseSchema>;

export interface AgentServiceContract {
  listAgents(actor: SessionContext): Promise<{ agents: AgentRecordView[] }>;
  createAgent(actor: SessionContext, input: CreateAgentInputDto): Promise<AgentRecordView>;
  getAgent(actor: SessionContext, agentId: string): Promise<AgentRecordView>;
  updateAgent(
    actor: SessionContext,
    agentId: string,
    input: UpdateAgentInputDto,
  ): Promise<AgentRecordView>;
  getDraft(actor: SessionContext, agentId: string): Promise<GetAgentDraftView>;
  updateDraft(
    actor: SessionContext,
    agentId: string,
    input: UpdateAgentDraftInputDto,
  ): Promise<GetAgentDraftView>;
  publishAgent(
    actor: SessionContext,
    agentId: string,
    input: PublishAgentInputDto,
  ): Promise<PublishAgentView>;
}

export interface RuntimePublisher {
  publishAgentVersion(input: {
    workspaceId: string;
    agentId: string;
    agentVersionId: string;
    agentName: string;
    instructionsMarkdown: string;
    persona: Record<string, unknown>;
    modelRouting: {
      provider: string;
      model: string;
    };
    toolPolicy: {
      allowedTools: string[];
    };
    runtimeAgentId: string;
  }): Promise<RuntimePublicationResult>;
}
