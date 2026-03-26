import { and, eq } from "drizzle-orm";

import { connectorSyncJobs, connectors, createDb } from "@clawback/db";

import type { ConnectorSyncStore, StoredConnector, StoredConnectorSyncJob } from "./types.js";

type RuntimeWorkerDb = ReturnType<typeof createDb>;

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function mapConnector(row: typeof connectors.$inferSelect): StoredConnector {
  return {
    ...row,
    configJson: toRecord(row.configJson),
  };
}

function mapSyncJob(row: typeof connectorSyncJobs.$inferSelect): StoredConnectorSyncJob {
  return {
    ...row,
    statsJson: row.statsJson ? toRecord(row.statsJson) : null,
  };
}

function expectRow<T>(value: T | undefined, entity: string) {
  if (!value) {
    throw new Error(`Expected ${entity} row to be returned.`);
  }

  return value;
}

export class DrizzleConnectorSyncStore implements ConnectorSyncStore {
  constructor(private readonly db: RuntimeWorkerDb) {}

  async getConnectorSyncContext(workspaceId: string, connectorId: string, syncJobId: string) {
    const connector = await this.db.query.connectors.findFirst({
      where: and(eq(connectors.workspaceId, workspaceId), eq(connectors.id, connectorId)),
    });
    const syncJob = await this.db.query.connectorSyncJobs.findFirst({
      where: and(
        eq(connectorSyncJobs.workspaceId, workspaceId),
        eq(connectorSyncJobs.id, syncJobId),
        eq(connectorSyncJobs.connectorId, connectorId),
      ),
    });

    if (!connector || !syncJob) {
      return null;
    }

    return {
      connector: mapConnector(connector),
      syncJob: mapSyncJob(syncJob),
    };
  }

  async updateSyncJob(
    syncJobId: string,
    patch: Partial<Pick<StoredConnectorSyncJob, "status" | "statsJson" | "errorSummary" | "startedAt" | "completedAt" | "updatedAt">>,
  ) {
    const [row] = await this.db
      .update(connectorSyncJobs)
      .set(patch)
      .where(eq(connectorSyncJobs.id, syncJobId))
      .returning();

    return mapSyncJob(expectRow(row, "connector sync job"));
  }
}
