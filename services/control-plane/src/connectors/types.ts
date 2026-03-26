import type { z } from "zod";

import type {
  connectorListResponseSchema,
  connectorRecordSchema,
  connectorSyncJobExecuteSchema,
  connectorSyncJobListResponseSchema,
  connectorSyncJobSchema,
  createConnectorRequestSchema,
  createConnectorResponseSchema,
  getConnectorResponseSchema,
  requestConnectorSyncResponseSchema,
  updateConnectorRequestSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

export type StoredConnector = {
  id: string;
  workspaceId: string;
  type: "local_directory";
  name: string;
  status: "active" | "disabled";
  configJson: Record<string, unknown>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredConnectorSyncJob = {
  id: string;
  workspaceId: string;
  connectorId: string;
  status: "queued" | "running" | "completed" | "failed";
  requestedBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  errorSummary: string | null;
  statsJson: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
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

export interface ConnectorSyncQueue {
  enqueueConnectorSync(job: z.infer<typeof connectorSyncJobExecuteSchema>): Promise<void>;
}

export interface ConnectorStore {
  runInTransaction<T>(callback: (store: ConnectorStore) => Promise<T>): Promise<T>;
  listConnectors(workspaceId: string): Promise<StoredConnector[]>;
  findConnector(workspaceId: string, connectorId: string): Promise<StoredConnector | null>;
  createConnector(input: StoredConnector): Promise<StoredConnector>;
  updateConnector(
    connectorId: string,
    input: Partial<Pick<StoredConnector, "name" | "status" | "configJson" | "updatedAt">>,
  ): Promise<StoredConnector>;
  createSyncJob(input: StoredConnectorSyncJob): Promise<StoredConnectorSyncJob>;
  updateSyncJob(
    syncJobId: string,
    input: Partial<Pick<StoredConnectorSyncJob, "status" | "errorSummary" | "statsJson" | "startedAt" | "completedAt" | "updatedAt">>,
  ): Promise<StoredConnectorSyncJob>;
  listSyncJobs(workspaceId: string, connectorId: string): Promise<StoredConnectorSyncJob[]>;
  appendAuditEvent(event: StoredAuditEvent): Promise<void>;
}

export type ConnectorView = z.infer<typeof connectorRecordSchema>;
export type ConnectorListView = z.infer<typeof connectorListResponseSchema>;
export type ConnectorSyncJobView = z.infer<typeof connectorSyncJobSchema>;
export type ConnectorSyncJobListView = z.infer<typeof connectorSyncJobListResponseSchema>;
export type CreateConnectorInputDto = z.infer<typeof createConnectorRequestSchema>;
export type UpdateConnectorInputDto = z.infer<typeof updateConnectorRequestSchema>;
export type CreateConnectorView = z.infer<typeof createConnectorResponseSchema>;
export type GetConnectorView = z.infer<typeof getConnectorResponseSchema>;
export type RequestConnectorSyncView = z.infer<typeof requestConnectorSyncResponseSchema>;

export interface ConnectorServiceContract {
  listConnectors(actor: SessionContext): Promise<ConnectorListView>;
  createConnector(actor: SessionContext, input: CreateConnectorInputDto): Promise<CreateConnectorView>;
  getConnector(actor: SessionContext, connectorId: string): Promise<GetConnectorView>;
  updateConnector(
    actor: SessionContext,
    connectorId: string,
    input: UpdateConnectorInputDto,
  ): Promise<GetConnectorView>;
  requestSync(actor: SessionContext, connectorId: string): Promise<RequestConnectorSyncView>;
  listSyncJobs(actor: SessionContext, connectorId: string): Promise<ConnectorSyncJobListView>;
}
