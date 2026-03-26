import {
  connectorListResponseSchema,
  connectorRecordSchema,
  connectorSyncJobListResponseSchema,
  connectorSyncJobSchema,
  createConnectorRequestSchema,
  getConnectorResponseSchema,
  localDirectoryConnectorConfigSchema,
  requestConnectorSyncResponseSchema,
  updateConnectorRequestSchema,
} from "@clawback/contracts";
import { AuthServiceError, type SessionContext } from "@clawback/auth";
import {
  CONNECTOR_SYNC_JOB_NAME,
  createClawbackId,
  normalizeConnectorRootPath,
  normalizeLocalDirectoryExtension,
} from "@clawback/domain";

import type {
  ConnectorServiceContract,
  ConnectorStore,
  ConnectorSyncQueue,
  StoredConnector,
  StoredConnectorSyncJob,
} from "./types.js";

type ConnectorServiceOptions = {
  store: ConnectorStore;
  queue: ConnectorSyncQueue;
  now?: () => Date;
  localPathBase?: string;
};

export class ConnectorService implements ConnectorServiceContract {
  private readonly now: () => Date;
  private readonly localPathBase: string | undefined;

  constructor(private readonly options: ConnectorServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.localPathBase = options.localPathBase;
  }

  async listConnectors(actor: SessionContext) {
    this.assertAdmin(actor);
    const connectors = await this.options.store.listConnectors(actor.workspace.id);
    return connectorListResponseSchema.parse({
      connectors: connectors.map((connector) => this.toConnectorView(connector)),
    });
  }

  async createConnector(actor: SessionContext, input: unknown) {
    this.assertAdmin(actor);
    const parsed = createConnectorRequestSchema.parse(input);
    const now = this.now();

    return await this.options.store.runInTransaction(async (store) => {
      const connector = await store.createConnector({
        id: createClawbackId("ctr"),
        workspaceId: actor.workspace.id,
        type: parsed.type,
        name: parsed.name,
        status: "active",
        configJson: this.normalizeLocalDirectoryConfig(parsed.config),
        createdBy: actor.user.id,
        createdAt: now,
        updatedAt: now,
      });

      await store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: actor.workspace.id,
        actorType: "user",
        actorId: actor.user.id,
        eventType: "connector.created",
        targetType: "connector",
        targetId: connector.id,
        summary: "Connector created",
        payloadJson: {
          connector_id: connector.id,
          connector_type: connector.type,
        },
        occurredAt: now,
      });

      return connectorRecordSchema.parse(this.toConnectorView(connector));
    });
  }

  async getConnector(actor: SessionContext, connectorId: string) {
    this.assertAdmin(actor);
    const connector = await this.getRequiredConnector(actor.workspace.id, connectorId);
    return getConnectorResponseSchema.parse(this.toConnectorView(connector));
  }

  async updateConnector(actor: SessionContext, connectorId: string, input: unknown) {
    this.assertAdmin(actor);
    const parsed = updateConnectorRequestSchema.parse(input);
    const connector = await this.getRequiredConnector(actor.workspace.id, connectorId);
    const updated = await this.options.store.updateConnector(connectorId, {
      name: parsed.name ?? connector.name,
      status: parsed.status ?? connector.status,
      configJson: parsed.config
        ? this.normalizeLocalDirectoryConfig(parsed.config)
        : connector.configJson,
      updatedAt: this.now(),
    });

    return getConnectorResponseSchema.parse(this.toConnectorView(updated));
  }

  async requestSync(actor: SessionContext, connectorId: string) {
    this.assertAdmin(actor);
    const connector = await this.getRequiredConnector(actor.workspace.id, connectorId);
    const now = this.now();

    const syncJob = await this.options.store.createSyncJob({
      id: createClawbackId("csj"),
      workspaceId: actor.workspace.id,
      connectorId: connector.id,
      status: "queued",
      requestedBy: actor.user.id,
      startedAt: null,
      completedAt: null,
      errorSummary: null,
      statsJson: null,
      createdAt: now,
      updatedAt: now,
    });

    try {
      await this.options.queue.enqueueConnectorSync({
        job_type: CONNECTOR_SYNC_JOB_NAME,
        sync_job_id: syncJob.id,
        connector_id: connector.id,
        workspace_id: actor.workspace.id,
        attempt: 1,
        queued_at: now.toISOString(),
      });
    } catch (error) {
      const failedAt = this.now();
      const failed = await this.options.store.updateSyncJob(syncJob.id, {
        status: "failed",
        errorSummary: error instanceof Error ? error.message : "Connector sync queue dispatch failed.",
        completedAt: failedAt,
        updatedAt: failedAt,
      });

      throw new AuthServiceError({
        code: "connector_sync_enqueue_failed",
        message: failed.errorSummary ?? "Connector sync could not be queued.",
        statusCode: 502,
      });
    }

    await this.options.store.appendAuditEvent({
      id: createClawbackId("aud"),
      workspaceId: actor.workspace.id,
      actorType: "user",
      actorId: actor.user.id,
      eventType: "connector.sync.requested",
      targetType: "connector",
      targetId: connector.id,
      summary: "Connector sync queued",
      payloadJson: {
        connector_id: connector.id,
        sync_job_id: syncJob.id,
      },
      occurredAt: now,
    });

    return requestConnectorSyncResponseSchema.parse({
      sync_job: this.toSyncJobView(syncJob),
    });
  }

  async listSyncJobs(actor: SessionContext, connectorId: string) {
    this.assertAdmin(actor);
    await this.getRequiredConnector(actor.workspace.id, connectorId);
    const jobs = await this.options.store.listSyncJobs(actor.workspace.id, connectorId);

    return connectorSyncJobListResponseSchema.parse({
      sync_jobs: jobs.map((job) => this.toSyncJobView(job)),
    });
  }

  private assertAdmin(actor: SessionContext) {
    if (actor.membership.role !== "admin") {
      throw new AuthServiceError({
        code: "forbidden",
        message: "Admin access is required.",
        statusCode: 403,
      });
    }
  }

  private async getRequiredConnector(workspaceId: string, connectorId: string) {
    const connector = await this.options.store.findConnector(workspaceId, connectorId);
    if (!connector) {
      throw new AuthServiceError({
        code: "connector_not_found",
        message: "Connector not found.",
        statusCode: 404,
      });
    }

    return connector;
  }

  private normalizeLocalDirectoryConfig(input: unknown) {
    const parsed = localDirectoryConnectorConfigSchema.parse(input);
    return {
      root_path: normalizeConnectorRootPath(parsed.root_path, this.localPathBase),
      recursive: parsed.recursive,
      include_extensions: parsed.include_extensions
        .map((value) => normalizeLocalDirectoryExtension(value))
        .filter(Boolean),
    };
  }

  private toConnectorView(connector: StoredConnector) {
    return {
      id: connector.id,
      workspace_id: connector.workspaceId,
      type: connector.type,
      name: connector.name,
      status: connector.status,
      config: localDirectoryConnectorConfigSchema.parse(connector.configJson),
      created_by: connector.createdBy,
      created_at: connector.createdAt.toISOString(),
      updated_at: connector.updatedAt.toISOString(),
    };
  }

  private toSyncJobView(job: StoredConnectorSyncJob) {
    return connectorSyncJobSchema.parse({
      id: job.id,
      workspace_id: job.workspaceId,
      connector_id: job.connectorId,
      status: job.status,
      requested_by: job.requestedBy,
      started_at: job.startedAt?.toISOString() ?? null,
      completed_at: job.completedAt?.toISOString() ?? null,
      error_summary: job.errorSummary,
      stats: job.statsJson,
      created_at: job.createdAt.toISOString(),
      updated_at: job.updatedAt.toISOString(),
    });
  }
}
