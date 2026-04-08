import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getRuntimeReadinessStatus,
  getWorkspaceToday,
  listRegistry,
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInbox,
  listWorkspaceInputRoutes,
  listWorkspaceWork,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import type { RegistryConnectionProvider } from "@/lib/control-plane";
import {
  daveTodayResponse,
  followUpActions,
  followUpConnections,
  followUpRoutes,
  inboxItems as fixtureInboxItems,
  workers as fixtureWorkers,
  workItems as fixtureWorkItems,
} from "@/lib/dev-fixtures";
import { buildPilotSetupSteps } from "../_lib/setup-progress";
import {
  emptyConnectorSyncState,
  loadConnectorSyncState,
} from "../_lib/knowledge-path";

// Side-effect import: registers all first-party setup evaluators
import "../_lib/evaluator-registrations";

function runtimeBadgeClass(status: "ready" | "degraded" | "blocked") {
  switch (status) {
    case "ready":
      return "border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400";
    case "degraded":
      return "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400";
    case "blocked":
      return "border-destructive/20 bg-destructive/5 text-destructive";
  }
}

function runtimeStatusLabel(status: "ready" | "degraded" | "blocked") {
  switch (status) {
    case "ready":
      return "Runtime ready";
    case "degraded":
      return "Runtime degraded";
    case "blocked":
      return "Runtime blocked";
  }
}

export default async function SetupPage() {
  let viewer = daveTodayResponse.viewer;
  let workers = fixtureWorkers;
  let connections = followUpConnections;
  let inputRoutes = followUpRoutes;
  let actionCapabilities = followUpActions;
  let inboxItems = fixtureInboxItems;
  let workItems = fixtureWorkItems;
  let connectors = emptyConnectorSyncState.connectors;
  let syncJobsByConnector = emptyConnectorSyncState.syncJobsByConnector;
  let registryProviders: RegistryConnectionProvider[] = [];
  let runtimeReadiness:
    | Awaited<ReturnType<typeof getRuntimeReadinessStatus>>
    | null = null;
  let runtimeReadinessError: string | null = null;
  let usingFixtureFallback = false;

  const [
    todayResult,
    workerResult,
    connectionResult,
    routeResult,
    actionResult,
    inboxResult,
    workResult,
    registryResult,
    connectorState,
  ] = await Promise.all([
    getWorkspaceToday().catch(() => null),
    listWorkspaceWorkers().catch(() => null),
    listWorkspaceConnections().catch(() => null),
    listWorkspaceInputRoutes().catch(() => null),
    listWorkspaceActionCapabilities().catch(() => null),
    listWorkspaceInbox().catch(() => null),
    listWorkspaceWork().catch(() => null),
    listRegistry().catch(() => null),
    loadConnectorSyncState().catch(() => null),
  ]);

  if (todayResult) {
    viewer = todayResult.viewer;
  } else {
    usingFixtureFallback = true;
  }

  if (workerResult) {
    workers = workerResult.workers;
  } else {
    usingFixtureFallback = true;
  }

  if (connectionResult) {
    connections = connectionResult.connections;
  } else {
    usingFixtureFallback = true;
  }

  if (routeResult) {
    inputRoutes = routeResult.input_routes;
  } else {
    usingFixtureFallback = true;
  }

  if (actionResult) {
    actionCapabilities = actionResult.action_capabilities;
  } else {
    usingFixtureFallback = true;
  }

  if (inboxResult) {
    inboxItems = inboxResult.items;
  } else {
    usingFixtureFallback = true;
  }

  if (workResult) {
    workItems = workResult.work_items;
  } else {
    usingFixtureFallback = true;
  }

  if (registryResult) {
    registryProviders = registryResult?.connection_providers ?? [];
  }

  if (connectorState) {
    connectors = connectorState.connectors;
    syncJobsByConnector = connectorState.syncJobsByConnector;
  } else {
    usingFixtureFallback = true;
  }

  try {
    runtimeReadiness = await getRuntimeReadinessStatus();
  } catch (error) {
    runtimeReadinessError =
      error instanceof Error ? error.message : "Failed to load runtime readiness.";
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
    inboxItems,
    workItems,
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
            Complete each step to get your workspace fully operational. The fastest honest proof is
            still no-Google first: confirm seeded Knowledge, then use Run sample activity to watch
            the follow-up worker create real inbox, work, and activity state.
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

        <Card className={runtimeReadiness ? "" : "border-border/60"}>
          <CardHeader className="space-y-2 pb-4">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">Model runtime readiness</CardTitle>
              {runtimeReadiness ? (
                <Badge variant="outline" className={runtimeBadgeClass(runtimeReadiness.status)}>
                  {runtimeStatusLabel(runtimeReadiness.status)}
                </Badge>
              ) : (
                <Badge variant="outline">Unavailable</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              This checks whether the OpenClaw runtime is reachable and whether the expected
              model-provider key is present on the host. It does not replace a full end-to-end
              demo run, but it catches the common “seeded stack is up, live answers still fail”
              class of issue.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            {runtimeReadiness ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Configured provider
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {runtimeReadiness.configured_provider}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {runtimeReadiness.configured_provider_env_var
                        ? `${runtimeReadiness.configured_provider_env_var} ${
                            runtimeReadiness.configured_provider_key_present ? "is present." : "is missing."
                          }`
                        : "No known env-var mapping for this provider."}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                      Gateway primary model
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {runtimeReadiness.gateway_main_model ?? "Not discovered"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {runtimeReadiness.gateway_main_provider_env_var
                        ? `${runtimeReadiness.gateway_main_provider_env_var} ${
                            runtimeReadiness.gateway_main_provider_key_present ? "is present." : "is missing."
                          }`
                        : runtimeReadiness.gateway_main_provider
                          ? "No known env-var mapping for the discovered gateway provider."
                          : "The gateway responded, but no primary model was discovered."}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  {[
                    runtimeReadiness.checks.gateway,
                    runtimeReadiness.checks.configured_provider_key,
                    runtimeReadiness.checks.gateway_main_provider_key,
                  ]
                    .filter((check): check is NonNullable<typeof runtimeReadiness.checks.gateway_main_provider_key> => check !== null)
                    .map((check) => (
                      <div
                        key={check.summary}
                        className={`rounded-lg border p-3 ${
                          check.ok
                            ? "border-emerald-500/10 bg-emerald-500/[0.03]"
                            : "border-destructive/15 bg-destructive/[0.04]"
                        }`}
                      >
                        <p className="text-sm font-medium text-foreground">{check.summary}</p>
                        {check.detail ? (
                          <p className="mt-1 text-xs text-muted-foreground">{check.detail}</p>
                        ) : null}
                      </div>
                    ))}
                </div>

                <p className="text-xs text-muted-foreground">
                  Published Clawback runtime agents discovered in OpenClaw: {runtimeReadiness.published_agent_count}
                </p>
              </>
            ) : (
              <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                <p className="text-sm font-medium text-foreground">
                  Runtime readiness is unavailable from this page right now.
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {runtimeReadinessError ?? "The control plane could not load runtime readiness."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

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
