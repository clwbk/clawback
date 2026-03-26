import { connectorSyncStatsSchema } from "@clawback/contracts";

import type { ConnectorSyncJob, ConnectorSyncStore } from "./types.js";

type ConnectorSyncServiceOptions = {
  store: ConnectorSyncStore;
  syncConnector: (input: { workspaceId: string; connectorId: string }) => Promise<unknown>;
  now?: () => Date;
};

export class ConnectorSyncService {
  private readonly now: () => Date;

  constructor(private readonly options: ConnectorSyncServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async execute(job: ConnectorSyncJob) {
    const context = await this.options.store.getConnectorSyncContext(
      job.workspace_id,
      job.connector_id,
      job.sync_job_id,
    );

    if (!context) {
      return { outcome: "missing" as const };
    }

    if (context.syncJob.status === "completed") {
      return { outcome: "ignored" as const };
    }

    const startedAt = this.now();
    await this.options.store.updateSyncJob(job.sync_job_id, {
      status: "running",
      startedAt,
      completedAt: null,
      errorSummary: null,
      updatedAt: startedAt,
    });

    try {
      const stats = connectorSyncStatsSchema.parse(
        await this.options.syncConnector({
          workspaceId: job.workspace_id,
          connectorId: job.connector_id,
        }),
      );

      const completedAt = this.now();
      await this.options.store.updateSyncJob(job.sync_job_id, {
        status: "completed",
        statsJson: stats,
        completedAt,
        updatedAt: completedAt,
      });

      return { outcome: "completed" as const };
    } catch (error) {
      const completedAt = this.now();
      await this.options.store.updateSyncJob(job.sync_job_id, {
        status: "failed",
        errorSummary: error instanceof Error ? error.message : String(error),
        completedAt,
        updatedAt: completedAt,
      });

      return { outcome: "failed" as const };
    }
  }
}
