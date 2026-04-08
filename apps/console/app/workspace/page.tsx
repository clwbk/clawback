import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorkspaceToday,
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInputRoutes,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import {
  daveTodayResponse,
  followUpActions,
  followUpConnections,
  followUpRoutes,
  workers as fixtureWorkers,
} from "@/lib/dev-fixtures";
import {
  activityAccentClassName,
  inboxKindVariant,
  humanizeLabel,
  shadowBadgeClassName,
  workKindVariant,
} from "./_lib/presentation";
import { buildPilotSetupSteps } from "./_lib/setup-progress";
import {
  emptyConnectorSyncState,
  hasReadyKnowledgeConnector,
  loadConnectorSyncState,
} from "./_lib/knowledge-path";

export default async function TodayPage() {
  let today = daveTodayResponse;
  let workers = fixtureWorkers;
  let connections = followUpConnections;
  let inputRoutes = followUpRoutes;
  let actionCapabilities = followUpActions;
  let connectors = emptyConnectorSyncState.connectors;
  let syncJobsByConnector = emptyConnectorSyncState.syncJobsByConnector;
  let usingFixtureFallback = false;

  try {
    const [
      todayResult,
      workerResult,
      connectionResult,
      inputRouteResult,
      actionResult,
      connectorState,
    ] = await Promise.all([
      getWorkspaceToday(),
      listWorkspaceWorkers(),
      listWorkspaceConnections(),
      listWorkspaceInputRoutes(),
      listWorkspaceActionCapabilities(),
      loadConnectorSyncState().catch(() => emptyConnectorSyncState),
    ]);
    today = todayResult;
    workers = workerResult.workers;
    connections = connectionResult.connections;
    inputRoutes = inputRouteResult.input_routes;
    actionCapabilities = actionResult.action_capabilities;
    connectors = connectorState.connectors;
    syncJobsByConnector = connectorState.syncJobsByConnector;
  } catch {
    usingFixtureFallback = true;
  }

  const forYouShadowCount = today.for_you.filter((item) => item.kind === "shadow").length;
  const forYouReviewCount = today.for_you.filter((item) => item.kind === "review").length;
  const recentShadowCount = today.recent_work.filter(
    (item) => item.source_route_kind === "watched_inbox" && !item.review_id && item.kind === "email_draft",
  ).length;
  const setupSteps = buildPilotSetupSteps({
    workers,
    connections,
    inputRoutes,
    actionCapabilities,
    connectors,
    syncJobsByConnector,
  });
  const knowledgeReady = hasReadyKnowledgeConnector(connectors, syncJobsByConnector);

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Today
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            For {today.viewer.display_name}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {today.viewer.role === "admin"
              ? "Owner view across shared workers, proactive suggestions, and gated actions."
              : "Your assigned reviews, proactive suggestions, and recent worker output."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="destructive">{forYouReviewCount} review</Badge>
            <Badge variant="secondary" className={shadowBadgeClassName("shadow")}>
              {forYouShadowCount} shadow
            </Badge>
            <Badge variant="outline">{recentShadowCount} proactive draft</Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard value={today.stats.inbox_waiting} label="items waiting on you" />
          <StatCard value={today.stats.team_items_today} label="team items today" />
          <StatCard value={today.stats.workers_active} label="active workers" />
          <StatCard value={today.stats.connections_active} label="connected systems" />
        </div>

        {today.viewer.role === "admin" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Link
              href="/workspace/setup"
              className="block rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Setup: {setupSteps.filter((s) => s.complete).length}/{setupSteps.length} complete
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {setupSteps.every((s) => s.complete)
                      ? "All setup steps are complete. Review configuration any time."
                      : `Next: ${setupSteps.find((s) => !s.complete)?.title}`}
                  </p>
                </div>
                <span className="text-sm font-medium text-primary">
                  {setupSteps.every((s) => s.complete) ? "Review setup" : "Continue setup"} &rarr;
                </span>
              </div>
            </Link>

            <Link
              href="/workspace/connectors"
              className="block rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Knowledge: {knowledgeReady ? "ready" : "needs attention"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {knowledgeReady
                      ? "A seeded knowledge source is indexed and ready for retrieval proof."
                      : "Open Knowledge and confirm the seeded incident demo sync indexed real documents."}
                  </p>
                </div>
                <span className="text-sm font-medium text-primary">
                  Open Knowledge &rarr;
                </span>
              </div>
            </Link>
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">For you</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {today.for_you.length > 0 ? (
                today.for_you.map((item) => (
                  <Link
                    key={item.id}
                    href={`/workspace/inbox?item=${item.id}`}
                    className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
                      </div>
                      <Badge
                        variant={inboxKindVariant(item.kind)}
                        className={shadowBadgeClassName(item.kind)}
                      >
                        {humanizeLabel(item.kind)}
                      </Badge>
                    </div>
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Team</CardTitle>
                <Link
                  href="/workspace/work"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  View all work
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {today.team.map((item) => (
                <Link
                  key={item.id}
                  href={`/workspace/work/${item.id}`}
                  className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
                    </div>
                    <Badge
                      variant={workKindVariant(item.kind)}
                      className={activityAccentClassName({
                        resultKind: item.review_id ? null : "shadow_draft_created",
                        routeKind: item.source_route_kind,
                      })}
                    >
                      {item.source_route_kind === "watched_inbox" && !item.review_id && item.kind === "email_draft"
                        ? "shadow draft"
                        : humanizeLabel(item.kind)}
                    </Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Workers in use</CardTitle>
                <Link
                  href="/workspace/workers"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  All workers
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {today.worker_snapshots.map((worker) => (
                <Link
                  key={worker.id}
                  href={`/workspace/workers/${worker.id}`}
                  className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{worker.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {worker.open_inbox_count} inbox / {worker.recent_work_count} work items
                      </p>
                    </div>
                    <Badge variant="outline">{humanizeLabel(worker.kind)}</Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Recent work</CardTitle>
                <Link
                  href="/workspace/work"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Open work
                </Link>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {today.recent_work.map((item) => (
                <Link
                  key={item.id}
                  href={`/workspace/work/${item.id}`}
                  className="block rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.title}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{item.summary}</p>
                    </div>
                    <Badge
                      variant={workKindVariant(item.kind)}
                      className={activityAccentClassName({
                        resultKind: item.review_id ? null : "shadow_draft_created",
                        routeKind: item.source_route_kind,
                      })}
                    >
                      {item.source_route_kind === "watched_inbox" && !item.review_id && item.kind === "email_draft"
                        ? "shadow draft"
                        : humanizeLabel(item.kind)}
                    </Badge>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold text-foreground">{value}</div>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}
