import {
  listConnectors,
  listConnectorSyncJobs,
  type ConnectorRecord,
  type ConnectorSyncJobRecord,
} from "@/lib/control-plane";

export type ConnectorSyncJobsByConnector = Map<string, ConnectorSyncJobRecord[]>;

export type ConnectorSyncState = {
  connectors: ConnectorRecord[];
  syncJobsByConnector: ConnectorSyncJobsByConnector;
};

export const emptyConnectorSyncState: ConnectorSyncState = {
  connectors: [],
  syncJobsByConnector: new Map(),
};

export async function loadConnectorSyncState(): Promise<ConnectorSyncState> {
  const result = await listConnectors();
  const connectors = result.connectors;
  const syncJobsByConnector = new Map<string, ConnectorSyncJobRecord[]>();

  await Promise.all(
    connectors.map(async (connector) => {
      try {
        const jobResult = await listConnectorSyncJobs(connector.id);
        syncJobsByConnector.set(connector.id, jobResult.sync_jobs);
      } catch {
        syncJobsByConnector.set(connector.id, []);
      }
    }),
  );

  return {
    connectors,
    syncJobsByConnector,
  };
}

export function hasIndexedKnowledgeSync(jobs: ConnectorSyncJobRecord[]): boolean {
  return jobs.some((job) => {
    if (job.status !== "completed" || !job.stats) {
      return false;
    }

    return (
      job.stats.indexed_document_count > 0 ||
      job.stats.updated_document_count > 0 ||
      (job.stats.scanned_file_count > 0 && job.stats.error_count === 0)
    );
  });
}

export function hasReadyKnowledgeConnector(
  connectors: ConnectorRecord[],
  syncJobsByConnector: ConnectorSyncJobsByConnector,
): boolean {
  return connectors.some((connector) => {
    if (connector.type !== "local_directory" || connector.status !== "active") {
      return false;
    }

    const jobs = syncJobsByConnector.get(connector.id) ?? [];
    return hasIndexedKnowledgeSync(jobs);
  });
}
