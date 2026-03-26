import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listRegistry,
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInputRoutes,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import type { RegistryConnectionProvider } from "@/lib/control-plane";
import {
  followUpActions,
  followUpConnections,
  followUpRoutes,
  workers as fixtureWorkers,
} from "@/lib/dev-fixtures";
import {
  boundaryModeVariant,
  connectionAccentClassName,
  connectionStatusVariant,
  humanizeLabel,
  routeAccentClassName,
  routeStatusVariant,
} from "../_lib/presentation";
import { PilotSetupGuide } from "../_components/pilot-setup-guide";
import { buildPilotSetupSteps } from "../_lib/setup-progress";
import {
  emptyConnectorSyncState,
  hasReadyKnowledgeConnector,
  loadConnectorSyncState,
} from "../_lib/knowledge-path";
import { resolvePanelPropsMap } from "../_lib/provider-panel-resolver";
import { ProviderSetupCard } from "./provider-setup-card";
import { groupProvidersByCategory } from "./provider-grouping";
import { FocusSection } from "./focus-section";
import { CollapsibleReferenceSection } from "./collapsible-reference-section";

// Side-effect import: registers all first-party custom panels, resolvers, and evaluators
import "./panel-registrations";

type ConnectionsPageProps = {
  searchParams: Promise<{ focus?: string; from?: string }>;
};

export default async function ConnectionsPage({ searchParams }: ConnectionsPageProps) {
  const { focus, from } = await searchParams;
  let inputRoutes = followUpRoutes;
  let connections = followUpConnections;
  let actionCapabilities = followUpActions;
  let workers = fixtureWorkers;
  let connectors = emptyConnectorSyncState.connectors;
  let syncJobsByConnector = emptyConnectorSyncState.syncJobsByConnector;
  let registryProviders: RegistryConnectionProvider[] = [];
  let usingFixtureFallback = false;

  try {
    const [routeResult, connectionResult, actionResult, workerResult, registryResult, connectorState] = await Promise.all([
      listWorkspaceInputRoutes(),
      listWorkspaceConnections(),
      listWorkspaceActionCapabilities(),
      listWorkspaceWorkers(),
      listRegistry().catch(() => null),
      loadConnectorSyncState().catch(() => emptyConnectorSyncState),
    ]);
    inputRoutes = routeResult.input_routes;
    connections = connectionResult.connections;
    actionCapabilities = actionResult.action_capabilities;
    workers = workerResult.workers;
    registryProviders = registryResult?.connection_providers ?? [];
    connectors = connectorState.connectors;
    syncJobsByConnector = connectorState.syncJobsByConnector;
  } catch {
    usingFixtureFallback = true;
  }

  // Build a lookup from provider name to registry metadata
  const providerMeta = new Map(
    registryProviders.map((p) => [p.provider, p]),
  );

  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]));
  const connectedCount = connections.filter((c) => c.status === "connected").length;

  const setupSteps = buildPilotSetupSteps({
    workers,
    connections,
    inputRoutes,
    actionCapabilities,
    connectors,
    syncJobsByConnector,
    providerMeta,
  });
  const knowledgeReady = hasReadyKnowledgeConnector(connectors, syncJobsByConnector);

  // Use the resolver layer to build panel props generically (no provider-specific branching)
  const panelPropsMap = resolvePanelPropsMap({
    connections,
    inputRoutes,
    workers,
    usingFixtureFallback,
  });

  return (
    <div className="h-full overflow-y-auto bg-background">
      <FocusSection focus={focus ?? null} />
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        {from === "setup" ? (
          <Link
            href="/workspace/setup"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to setup
          </Link>
        ) : null}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Connections
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Inputs, systems, and destinations
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Forwarding stays explicit. Gmail read-only unlocks watched inbox and shadow suggestions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="default">{inputRoutes.length} input routes</Badge>
            <Badge variant="secondary">{connectedCount}/{connections.length} connected</Badge>
            <Badge variant="outline">{actionCapabilities.length} action destinations</Badge>
          </div>
        </div>

        <Link
          href="/workspace/connectors"
          className="block rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-foreground">
                Knowledge lives on its own page
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {knowledgeReady
                  ? "The seeded Company Docs connector is indexed and ready for retrieval."
                  : "Open Knowledge to confirm the seeded Company Docs connector is indexed before testing retrieval."}
              </p>
            </div>
            <span className="text-sm font-medium text-primary">Open Knowledge &rarr;</span>
          </div>
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-3">
            <PilotSetupGuide
              variant="detailed"
              storageKey="pilot-setup-guide:connections"
              steps={setupSteps}
            />
          </div>

          {groupProvidersByCategory(registryProviders).map((group) => (
            <div key={group.category} className="lg:col-span-3 space-y-4">
              <h2 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {group.label}
              </h2>
              {group.providers.map((provider) => {
                const sectionId = `${provider.provider}-section`;
                return (
                  <div key={provider.id} id={sectionId}>
                    <ProviderSetupCard
                      provider={provider}
                      panelProps={panelPropsMap.get(provider.id)}
                      connectionStatus={connections.find(c => c.provider === provider.provider)?.status ?? null}
                    />
                  </div>
                );
              })}
            </div>
          ))}

        </div>

        <CollapsibleReferenceSection>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Input routes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {inputRoutes.map((route) => (
                  <div key={route.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{route.label}</p>
                        <p className="text-xs text-muted-foreground">{route.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Worker: {workerNames.get(route.worker_id) ?? route.worker_id}
                        </p>
                        {route.address ? (
                          <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                            {route.address}
                          </p>
                        ) : null}
                        {route.kind === "watched_inbox" ? (
                          <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                            Proactive route. Notices inbox activity and prepares a shadow draft. No send occurs.
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant={routeStatusVariant(route.status)}
                        className={`shrink-0 ${routeAccentClassName(route.kind)}`}
                      >
                        {humanizeLabel(route.status)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Connected systems</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {connections.map((connection) => {
                  const attachedWorkerNames = connection.attached_worker_ids
                    .map((id) => workerNames.get(id) ?? id)
                    .filter(Boolean);
                  const meta = providerMeta.get(connection.provider);

                  return (
                    <div key={connection.id} className="rounded-lg border border-border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {meta?.display_name ?? connection.label}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {meta?.description ?? `${humanizeLabel(connection.provider)} / ${humanizeLabel(connection.access_mode)}`}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {connection.capabilities.join(", ")}
                          </p>
                          {attachedWorkerNames.length > 0 ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Workers: {attachedWorkerNames.join(", ")}
                            </p>
                          ) : null}
                          {connection.status === "connected" ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Connected since {new Date(connection.updated_at).toLocaleDateString()}
                            </p>
                          ) : null}
                          {meta && meta.stability !== "pilot" && meta.stability !== "stable" ? (
                            <Badge variant="outline" className="mt-1 text-[10px]">Coming soon</Badge>
                          ) : null}
                        </div>
                        <Badge
                          variant={connectionStatusVariant(connection.status)}
                          className={`shrink-0 ${connectionAccentClassName({
                            provider: connection.provider,
                            accessMode: connection.access_mode,
                            status: connection.status,
                          })}`}
                        >
                          {humanizeLabel(connection.status)}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Action destinations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {actionCapabilities.map((action) => (
                  <div key={action.id} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {humanizeLabel(action.kind)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Worker: {workerNames.get(action.worker_id) ?? action.worker_id}
                        </p>
                        {action.boundary_mode === "ask_me" ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Review-required write. This wave does not send automatically from Gmail.
                          </p>
                        ) : null}
                      </div>
                      <Badge
                        variant={boundaryModeVariant(action.boundary_mode)}
                        className="shrink-0"
                      >
                        {humanizeLabel(action.boundary_mode)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trust posture</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Zero trust</p>
                  <p className="text-sm text-foreground">Demo, upload, forward</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Low trust</p>
                  <p className="text-sm text-foreground">Read-only systems</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Higher trust</p>
                  <p className="text-sm text-foreground">Review-required writes</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </CollapsibleReferenceSection>
      </div>
    </div>
  );
}
