import { and, desc, eq } from "drizzle-orm";

import { auditEvents, connectorSyncJobs, connectors, createDb } from "@clawback/db";

import type {
  ConnectorStore,
  StoredConnector,
  StoredConnectorSyncJob,
  StoredAuditEvent,
} from "./types.js";

type ControlPlaneDb = ReturnType<typeof createDb>;

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function expectRow<T>(value: T | undefined, entity: string) {
  if (!value) {
    throw new Error(`Expected ${entity} row to be returned.`);
  }

  return value;
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

export class DrizzleConnectorStore implements ConnectorStore {
  constructor(private readonly db: ControlPlaneDb) {}

  async runInTransaction<T>(callback: (store: ConnectorStore) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      const store = new DrizzleConnectorStore(tx as unknown as ControlPlaneDb);
      return await callback(store);
    });
  }

  async listConnectors(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(connectors)
      .where(eq(connectors.workspaceId, workspaceId))
      .orderBy(desc(connectors.updatedAt), desc(connectors.createdAt));

    return rows.map(mapConnector);
  }

  async findConnector(workspaceId: string, connectorId: string) {
    const row = await this.db.query.connectors.findFirst({
      where: and(eq(connectors.workspaceId, workspaceId), eq(connectors.id, connectorId)),
    });

    return row ? mapConnector(row) : null;
  }

  async createConnector(input: StoredConnector) {
    const [row] = await this.db.insert(connectors).values(input).returning();
    return mapConnector(expectRow(row, "connector"));
  }

  async updateConnector(
    connectorId: string,
    input: Partial<Pick<StoredConnector, "name" | "status" | "configJson" | "updatedAt">>,
  ) {
    const [row] = await this.db
      .update(connectors)
      .set(input)
      .where(eq(connectors.id, connectorId))
      .returning();

    return mapConnector(expectRow(row, "connector"));
  }

  async createSyncJob(input: StoredConnectorSyncJob) {
    const [row] = await this.db.insert(connectorSyncJobs).values(input).returning();
    return mapSyncJob(expectRow(row, "connector sync job"));
  }

  async updateSyncJob(
    syncJobId: string,
    input: Partial<Pick<StoredConnectorSyncJob, "status" | "errorSummary" | "statsJson" | "startedAt" | "completedAt" | "updatedAt">>,
  ) {
    const [row] = await this.db
      .update(connectorSyncJobs)
      .set(input)
      .where(eq(connectorSyncJobs.id, syncJobId))
      .returning();

    return mapSyncJob(expectRow(row, "connector sync job"));
  }

  async listSyncJobs(workspaceId: string, connectorId: string) {
    const rows = await this.db
      .select()
      .from(connectorSyncJobs)
      .where(
        and(
          eq(connectorSyncJobs.workspaceId, workspaceId),
          eq(connectorSyncJobs.connectorId, connectorId),
        ),
      )
      .orderBy(desc(connectorSyncJobs.createdAt));

    return rows.map(mapSyncJob);
  }

  async appendAuditEvent(event: StoredAuditEvent) {
    await this.db.insert(auditEvents).values({
      id: event.id,
      workspaceId: event.workspaceId,
      actorType: event.actorType,
      actorId: event.actorId,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      summary: event.summary,
      payloadJson: event.payloadJson,
      occurredAt: event.occurredAt,
    });
  }
}
