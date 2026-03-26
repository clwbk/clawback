import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorkspaceToday,
  listRegistry,
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInputRoutes,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import type { RegistryConnectionProvider } from "@/lib/control-plane";
import {
  daveTodayResponse,
  followUpActions,
  followUpConnections,
  followUpRoutes,
  workers as fixtureWorkers,
} from "@/lib/dev-fixtures";
import { buildPilotSetupSteps } from "../_lib/setup-progress";
import {
  emptyConnectorSyncState,
  loadConnectorSyncState,
} from "../_lib/knowledge-path";

// Side-effect import: registers all first-party setup evaluators
import "../_lib/evaluator-registrations";

export default async function SetupPage() {
  let viewer = daveTodayResponse.viewer;
  let workers = fixtureWorkers;
  let connections = followUpConnections;
  let inputRoutes = followUpRoutes;
  let actionCapabilities = followUpActions;
  let connectors = emptyConnectorSyncState.connectors;
  let syncJobsByConnector = emptyConnectorSyncState.syncJobsByConnector;
  let registryProviders: RegistryConnectionProvider[] = [];
  let usingFixtureFallback = false;

  try {
    const [todayResult, workerResult, connectionResult, routeResult, actionResult, registryResult, connectorState] =
      await Promise.all([
        getWorkspaceToday(),
        listWorkspaceWorkers(),
        listWorkspaceConnections(),
        listWorkspaceInputRoutes(),
        listWorkspaceActionCapabilities(),
        listRegistry().catch(() => null),
        loadConnectorSyncState().catch(() => emptyConnectorSyncState),
      ]);
    viewer = todayResult.viewer;
    workers = workerResult.workers;
    connections = connectionResult.connections;
    inputRoutes = routeResult.input_routes;
    actionCapabilities = actionResult.action_capabilities;
    registryProviders = registryResult?.connection_providers ?? [];
    connectors = connectorState.connectors;
    syncJobsByConnector = connectorState.syncJobsByConnector;
  } catch {
    usingFixtureFallback = true;
  }

  // Build a lookup from provider name to registry metadata for setup step enrichment
  const providerMeta = new Map(
    registryProviders.map((p) => [p.provider, p]),
  );

  if (viewer.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Admin only
          </p>
          <h1 className="mt-4 text-xl font-semibold text-foreground">
            Setup is managed by admins
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Contact your workspace admin if you need changes to the system configuration.
          </p>
          <Link href="/workspace">
            <Button variant="outline" className="mt-6">
              Back to Today
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const setupSteps = buildPilotSetupSteps({
    workers,
    connections,
    inputRoutes,
    actionCapabilities,
    connectors,
    syncJobsByConnector,
    providerMeta,
  });

  const completeCount = setupSteps.filter((s) => s.complete).length;
  const allComplete = setupSteps.length > 0 && completeCount === setupSteps.length;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Setup
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Workspace setup
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete each step to get your workspace fully operational. You can return to this
            page at any time from the Setup icon in the navigation rail.
          </p>
        </div>

        {/* Overall progress */}
        <div
          className={`rounded-lg border p-4 ${
            allComplete
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-border bg-muted/30"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                {allComplete ? "Setup complete" : "Setup in progress"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {completeCount} of {setupSteps.length} steps complete
              </p>
            </div>
            <div className="flex items-center gap-3">
              {/* Progress bar */}
              <div className="h-2 w-32 overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${
                    allComplete ? "bg-emerald-500" : "bg-primary"
                  }`}
                  style={{
                    width: `${setupSteps.length > 0 ? (completeCount / setupSteps.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <Badge variant={allComplete ? "default" : "secondary"}>
                {completeCount}/{setupSteps.length}
              </Badge>
            </div>
          </div>
        </div>

        {/* Setup steps */}
        <div className="space-y-3">
          {setupSteps.map((step, index) => (
            <Card
              key={step.id}
              className={
                step.complete
                  ? "border-emerald-500/10 bg-emerald-500/[0.02]"
                  : "border-border"
              }
            >
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 gap-3">
                    {/* Step number / check */}
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        step.complete
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {step.complete ? "\u2713" : index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{step.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Status badge - visually inert */}
                    <Badge
                      variant="outline"
                      className={
                        step.complete
                          ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
                          : "border-border bg-muted/30 text-muted-foreground"
                      }
                    >
                      {step.complete ? "Complete" : "Incomplete"}
                    </Badge>
                    {/* Primary action button - solid background, obviously clickable */}
                    <Link href={`${step.href}${step.href.includes("?") ? "&" : "?"}from=setup`}>
                      <Button
                        size="sm"
                        variant={step.complete ? "outline" : "default"}
                      >
                        {step.ctaLabel}
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Useful commands section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Useful commands</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded-md bg-muted px-3 py-3 text-xs text-foreground">
{`./scripts/test-forward-email.sh
./scripts/test-watched-inbox.sh
./scripts/test-smtp-send.sh
./scripts/public-try-verify.sh`}
            </pre>
            <p className="mt-3 text-xs text-muted-foreground">
              These scripts hit the real ingress and reviewed-send paths. They are the fastest way
              to rehearse a public self-hosted deployment after setup.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
