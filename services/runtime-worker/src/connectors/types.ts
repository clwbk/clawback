import type { z } from "zod";

import type { connectorSyncJobExecuteSchema } from "@clawback/contracts";

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

export interface ConnectorSyncStore {
  getConnectorSyncContext(
    workspaceId: string,
    connectorId: string,
    syncJobId: string,
  ): Promise<{ connector: StoredConnector; syncJob: StoredConnectorSyncJob } | null>;
  updateSyncJob(
    syncJobId: string,
    patch: Partial<Pick<StoredConnectorSyncJob, "status" | "statsJson" | "errorSummary" | "startedAt" | "completedAt" | "updatedAt">>,
  ): Promise<StoredConnectorSyncJob>;
}

export type ConnectorSyncJob = z.infer<typeof connectorSyncJobExecuteSchema>;
