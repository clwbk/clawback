import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listConnectors,
  listConnectorSyncJobs,
} from "@/lib/control-plane";
import type { ConnectorRecord, ConnectorSyncJobRecord } from "@/lib/control-plane";
import { hasReadyKnowledgeConnector } from "../_lib/knowledge-path";
import { AddConnectorButton } from "./add-connector-button";
import { SyncConnectorButton } from "./sync-connector-button";

function syncStatusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "completed":
      return "default";
    case "running":
    case "queued":
      return "secondary";
    case "failed":
      return "destructive";
    default:
      return "outline";
  }
}

function connectorStatusVariant(status: string): "default" | "secondary" | "outline" | "destructive" {
  switch (status) {
    case "active":
      return "default";
    case "disabled":
      return "secondary";
    default:
      return "outline";
  }
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ConnectorsPage() {
  let connectors: ConnectorRecord[] = [];
  let syncJobsByConnector = new Map<string, ConnectorSyncJobRecord[]>();
  let usingFixtureFallback = false;

  try {
    const result = await listConnectors();
    connectors = result.connectors;

    // Fetch sync jobs for each connector in parallel
    const jobResults = await Promise.all(
      connectors.map(async (connector) => {
        try {
          const jobResult = await listConnectorSyncJobs(connector.id);
          return { connectorId: connector.id, jobs: jobResult.sync_jobs };
        } catch {
          return { connectorId: connector.id, jobs: [] as ConnectorSyncJobRecord[] };
        }
      }),
    );

    syncJobsByConnector = new Map(
      jobResults.map((r) => [r.connectorId, r.jobs]),
    );
  } catch {
    usingFixtureFallback = true;
  }

  const knowledgeReady = hasReadyKnowledgeConnector(connectors, syncJobsByConnector);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Knowledge
              </p>
              {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">
              Knowledge sources
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Connect local directories to index documents for retrieval. Synced content is available as context for workers, and the seeded Incident Copilot Demo source is the default public demo path.
            </p>
          </div>
          <AddConnectorButton />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="default">{connectors.length} {connectors.length === 1 ? "connector" : "connectors"}</Badge>
          <Badge variant="secondary">
            {connectors.filter((c) => c.status === "active").length} active
          </Badge>
        </div>

        {knowledgeReady ? (
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Retrieval is ready
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  A local knowledge source has already been indexed. The next honest proof is to
                  open Chat and run a grounded prompt through Incident Copilot.
                </p>
              </div>
              <Button asChild>
                <Link href="/workspace/chat">Try grounded chat</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {connectors.length === 0 && !usingFixtureFallback ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No connectors configured yet. Add a local directory connector to index documents for retrieval.
              </p>
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6">
          {connectors.map((connector) => {
            const jobs = syncJobsByConnector.get(connector.id) ?? [];
            const latestJob = jobs.length > 0 ? jobs[0] : null;

            return (
              <Card key={connector.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{connector.name}</CardTitle>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Type: {connector.type.replace(/_/g, " ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={connectorStatusVariant(connector.status)}>
                        {connector.status}
                      </Badge>
                      <SyncConnectorButton connectorId={connector.id} />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Config details */}
                  <div className="rounded-lg border border-border p-3 text-xs space-y-1">
                    <div className="flex gap-2">
                      <span className="font-medium text-muted-foreground">Root path:</span>
                      <span className="font-mono text-foreground">{connector.config.root_path}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium text-muted-foreground">Recursive:</span>
                      <span className="text-foreground">{connector.config.recursive ? "Yes" : "No"}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="font-medium text-muted-foreground">Extensions:</span>
                      <span className="text-foreground">{connector.config.include_extensions.join(", ")}</span>
                    </div>
                  </div>

                  {/* Latest sync job */}
                  {latestJob ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Latest sync</p>
                      <div className="rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-xs space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={syncStatusVariant(latestJob.status)} className="text-[10px]">
                                {latestJob.status}
                              </Badge>
                              <span className="text-muted-foreground">
                                {formatTimestamp(latestJob.completed_at ?? latestJob.started_at ?? latestJob.created_at)}
                              </span>
                            </div>
                            {latestJob.stats ? (
                              <div className="flex flex-wrap gap-3 text-muted-foreground mt-1">
                                <span>{latestJob.stats.scanned_file_count} scanned</span>
                                <span>{latestJob.stats.indexed_document_count} indexed</span>
                                <span>{latestJob.stats.updated_document_count} updated</span>
                                {latestJob.stats.error_count > 0 ? (
                                  <span className="text-destructive">{latestJob.stats.error_count} errors</span>
                                ) : null}
                              </div>
                            ) : null}
                            {latestJob.error_summary ? (
                              <p className="text-destructive mt-1">{latestJob.error_summary}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No sync jobs yet. Request a sync to index documents.</p>
                  )}

                  {/* Sync history (show up to 3 older jobs) */}
                  {jobs.length > 1 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">Sync history</p>
                      <div className="space-y-1">
                        {jobs.slice(1, 4).map((job) => (
                          <div key={job.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant={syncStatusVariant(job.status)} className="text-[10px]">
                              {job.status}
                            </Badge>
                            <span>{formatTimestamp(job.completed_at ?? job.started_at ?? job.created_at)}</span>
                            {job.stats ? (
                              <span>({job.stats.indexed_document_count} indexed)</span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <p className="text-[10px] text-muted-foreground">
                    Created {formatTimestamp(connector.created_at)} &middot; Updated {formatTimestamp(connector.updated_at)}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
