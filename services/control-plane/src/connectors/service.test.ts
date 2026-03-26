import { beforeEach, describe, expect, it } from "vitest";

import type { SessionContext } from "@clawback/auth";

import { ConnectorService } from "./service.js";
import type {
  ConnectorStore,
  ConnectorSyncQueue,
  StoredAuditEvent,
  StoredConnector,
  StoredConnectorSyncJob,
} from "./types.js";

class MemoryConnectorQueue implements ConnectorSyncQueue {
  jobs: Array<Record<string, unknown>> = [];

  async enqueueConnectorSync(job: Record<string, unknown>) {
    this.jobs.push(job);
  }
}

class MemoryConnectorStore implements ConnectorStore {
  connectors: StoredConnector[] = [];
  syncJobs: StoredConnectorSyncJob[] = [];
  auditEvents: StoredAuditEvent[] = [];

  async runInTransaction<T>(callback: (store: ConnectorStore) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async listConnectors(workspaceId: string) {
    return this.connectors.filter((connector) => connector.workspaceId === workspaceId);
  }

  async findConnector(workspaceId: string, connectorId: string) {
    return this.connectors.find(
      (connector) => connector.workspaceId === workspaceId && connector.id === connectorId,
    ) ?? null;
  }

  async createConnector(input: StoredConnector) {
    this.connectors.push(input);
    return input;
  }

  async updateConnector(
    connectorId: string,
    input: Partial<Pick<StoredConnector, "name" | "status" | "configJson" | "updatedAt">>,
  ) {
    const connector = this.connectors.find((entry) => entry.id === connectorId);
    if (!connector) {
      throw new Error("connector not found");
    }

    Object.assign(connector, input);
    return connector;
  }

  async createSyncJob(input: StoredConnectorSyncJob) {
    this.syncJobs.push(input);
    return input;
  }

  async updateSyncJob(
    syncJobId: string,
    input: Partial<Pick<StoredConnectorSyncJob, "status" | "errorSummary" | "statsJson" | "startedAt" | "completedAt" | "updatedAt">>,
  ) {
    const job = this.syncJobs.find((entry) => entry.id === syncJobId);
    if (!job) {
      throw new Error("sync job not found");
    }

    Object.assign(job, input);
    return job;
  }

  async listSyncJobs(_workspaceId: string, connectorId: string) {
    return this.syncJobs.filter((job) => job.connectorId === connectorId);
  }

  async appendAuditEvent(event: StoredAuditEvent) {
    this.auditEvents.push(event);
  }
}

const adminActor: SessionContext = {
  session: {
    id: "ses_1",
    workspaceId: "ws_1",
    userId: "usr_1",
    tokenHash: "hash",
    expiresAt: new Date("2026-03-11T12:00:00Z"),
    revokedAt: null,
    lastSeenAt: new Date("2026-03-10T12:00:00Z"),
    createdAt: new Date("2026-03-10T12:00:00Z"),
  },
  user: {
    id: "usr_1",
    email: "admin@example.com",
    normalizedEmail: "admin@example.com",
    displayName: "Admin",
    kind: "human",
    status: "active",
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  },
  workspace: {
    id: "ws_1",
    slug: "acme",
    name: "Acme",
    status: "active",
    settingsJson: {},
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  },
  membership: {
    workspaceId: "ws_1",
    userId: "usr_1",
    role: "admin",
    createdAt: new Date("2026-03-10T12:00:00Z"),
  },
};

describe("ConnectorService", () => {
  let store: MemoryConnectorStore;
  let queue: MemoryConnectorQueue;

  beforeEach(() => {
    store = new MemoryConnectorStore();
    queue = new MemoryConnectorQueue();
  });

  it("creates and lists a local-directory connector", async () => {
    const service = new ConnectorService({
      store,
      queue,
      now: () => new Date("2026-03-10T12:00:00Z"),
      localPathBase: "/repo-root",
    });

    const created = await service.createConnector(adminActor, {
      name: "Docs",
      type: "local_directory",
      config: {
        root_path: "./docs",
        recursive: true,
        include_extensions: [".md", "txt"],
      },
    });

    expect(created.name).toBe("Docs");
    expect(created.config.root_path).toBe("/repo-root/docs");
    expect(created.config.include_extensions).toEqual([".md", ".txt"]);

    const list = await service.listConnectors(adminActor);
    expect(list.connectors).toHaveLength(1);
    expect(store.auditEvents[0]?.eventType).toBe("connector.created");
  });

  it("normalizes updated local-directory roots against the configured base path", async () => {
    const connector: StoredConnector = {
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
    store.connectors.push(connector);

    const service = new ConnectorService({
      store,
      queue,
      now: () => new Date("2026-03-10T12:05:00Z"),
      localPathBase: "/repo-root",
    });

    const updated = await service.updateConnector(adminActor, connector.id, {
      config: {
        root_path: "testdata/connectors/smoke-knowledge-base",
        recursive: true,
        include_extensions: [".md"],
      },
    });

    expect(updated.config.root_path).toBe("/repo-root/testdata/connectors/smoke-knowledge-base");
  });

  it("queues a connector sync job", async () => {
    const connector: StoredConnector = {
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
    store.connectors.push(connector);

    const service = new ConnectorService({
      store,
      queue,
      now: () => new Date("2026-03-10T12:05:00Z"),
    });

    const response = await service.requestSync(adminActor, connector.id);

    expect(response.sync_job.status).toBe("queued");
    expect(store.syncJobs).toHaveLength(1);
    expect(queue.jobs).toHaveLength(1);
    expect(queue.jobs[0]?.job_type).toBe("connector.sync");
    expect(store.auditEvents[0]?.eventType).toBe("connector.sync.requested");
  });
});
