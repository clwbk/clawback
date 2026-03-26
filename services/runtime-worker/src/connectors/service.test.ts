import { describe, expect, it } from "vitest";

import { ConnectorSyncService } from "./service.js";
import type { ConnectorSyncStore, StoredConnector, StoredConnectorSyncJob } from "./types.js";

class MemoryConnectorSyncStore implements ConnectorSyncStore {
  connector: StoredConnector = {
    id: "ctr_1",
    workspaceId: "ws_1",
    type: "local_directory",
    name: "Docs",
    status: "active",
    configJson: {
      root_path: "/tmp/docs",
      recursive: true,
      include_extensions: [".md"],
    },
    createdBy: "usr_1",
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  };

  syncJob: StoredConnectorSyncJob = {
    id: "csj_1",
    workspaceId: "ws_1",
    connectorId: "ctr_1",
    status: "queued",
    requestedBy: "usr_1",
    startedAt: null,
    completedAt: null,
    errorSummary: null,
    statsJson: null,
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  };

  async getConnectorSyncContext() {
    return {
      connector: this.connector,
      syncJob: this.syncJob,
    };
  }

  async updateSyncJob(_syncJobId: string, patch: Partial<StoredConnectorSyncJob>) {
    this.syncJob = {
      ...this.syncJob,
      ...patch,
    };
    return this.syncJob;
  }
}

describe("ConnectorSyncService", () => {
  it("marks a sync job completed when indexing succeeds", async () => {
    const store = new MemoryConnectorSyncStore();
    const service = new ConnectorSyncService({
      store,
      syncConnector: async () => ({
        scanned_file_count: 3,
        indexed_document_count: 2,
        updated_document_count: 0,
        deleted_document_count: 0,
        skipped_file_count: 1,
        error_count: 0,
      }),
      now: () => new Date("2026-03-10T12:05:00Z"),
    });

    const result = await service.execute({
      job_type: "connector.sync",
      sync_job_id: "csj_1",
      connector_id: "ctr_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(store.syncJob.status).toBe("completed");
    expect(store.syncJob.statsJson).toEqual({
      scanned_file_count: 3,
      indexed_document_count: 2,
      updated_document_count: 0,
      deleted_document_count: 0,
      skipped_file_count: 1,
      error_count: 0,
    });
  });

  it("marks a sync job failed when indexing throws", async () => {
    const store = new MemoryConnectorSyncStore();
    const service = new ConnectorSyncService({
      store,
      syncConnector: async () => {
        throw new Error("directory missing");
      },
      now: () => new Date("2026-03-10T12:05:00Z"),
    });

    const result = await service.execute({
      job_type: "connector.sync",
      sync_job_id: "csj_1",
      connector_id: "ctr_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("failed");
    expect(store.syncJob.status).toBe("failed");
    expect(store.syncJob.errorSummary).toBe("directory missing");
  });
});
