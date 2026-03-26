import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorkspaceWorker,
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInbox,
  listWorkspaceInputRoutes,
  listWorkspacePeople,
  listWorkspaceWork,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import {
  followUpActions,
  followUpConnections,
  followUpRoutes,
  inboxItems as fixtureInboxItems,
  workers as fixtureWorkers,
  workItems as fixtureWorkItems,
} from "@/lib/dev-fixtures";
import {
  boundaryModeVariant,
  connectionAccentClassName,
  connectionStatusVariant,
  humanizeLabel,
  inboxKindVariant,
  personName,
  routeAccentClassName,
  shadowBadgeClassName,
  routeStatusVariant,
  workerStatusVariant,
  workKindVariant,
} from "../../_lib/presentation";
import { WorkerConfigPanel } from "./worker-config-panel";
import { WorkerFocusSection } from "./worker-focus-section";

type WorkerDetailPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ focus?: string; from?: string }>;
};

export default async function WorkerDetailPage({ params, searchParams }: WorkerDetailPageProps) {
  const { id } = await params;
  const { focus, from } = await searchParams;
  let worker = fixtureWorkers.find((entry) => entry.id === id) ?? null;
  const initialWorkerId = worker?.id ?? null;
  let inputRoutes = initialWorkerId
    ? followUpRoutes.filter((route) => route.worker_id === initialWorkerId)
    : [];
  let allConnections = followUpConnections;
  let connections = initialWorkerId
    ? followUpConnections.filter((connection) =>
        connection.attached_worker_ids.includes(initialWorkerId),
      )
    : [];
  let actionCapabilities = initialWorkerId
    ? followUpActions.filter((action) => action.worker_id === initialWorkerId)
    : [];
  let inboxItems = fixtureInboxItems.filter((entry) => entry.worker_id === id);
  let workItems = fixtureWorkItems.filter((entry) => entry.worker_id === id);
  let people = new Map<string, string>([
    ["usr_dave_01", "Dave Hartwell"],
    ["usr_emma_01", "Emma Chen"],
  ]);
  let usingFixtureFallback = false;

  try {
    const [
      workerResult,
      routeResult,
      connectionResult,
      actionResult,
      inboxResult,
      workResult,
      workerListResult,
      peopleResult,
    ] = await Promise.all([
      getWorkspaceWorker(id),
      listWorkspaceInputRoutes({ workerId: id }),
      listWorkspaceConnections(),
      listWorkspaceActionCapabilities({ workerId: id }),
      listWorkspaceInbox(),
      listWorkspaceWork({ workerId: id }),
      listWorkspaceWorkers(),
      listWorkspacePeople(),
    ]);

    worker = workerResult;
    inputRoutes = routeResult.input_routes;
    allConnections = connectionResult.connections;
    connections = connectionResult.connections.filter((connection) =>
      connection.attached_worker_ids.includes(id),
    );
    actionCapabilities = actionResult.action_capabilities;
    inboxItems = inboxResult.items.filter((entry) => entry.worker_id === id);
    workItems = workResult.work_items;
    people = new Map(peopleResult.people.map((person) => [person.id, person.display_name]));
  } catch {
    usingFixtureFallback = true;
  }

  if (!worker) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Worker not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No worker with id &ldquo;{id}&rdquo;
          </p>
          <Link href="/workspace/workers">
            <Button variant="outline" className="mt-4">
              Back to Workers
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Derive Gmail monitoring status
  const gmailConnection = connections.find(
    (c) => c.provider === "gmail" && c.access_mode === "read_only",
  );
  const watchedInboxRoute = inputRoutes.find((r) => r.kind === "watched_inbox");
  const gmailMonitoringActive =
    gmailConnection?.status === "connected" && watchedInboxRoute?.status === "active";

  return (
    <div className="h-full overflow-y-auto bg-background">
      <WorkerFocusSection focus={focus ?? null} />
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        {from === "setup" ? (
          <Link
            href="/workspace/setup"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back to setup
          </Link>
        ) : null}
        {/* Breadcrumb + Identity header */}
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/workspace/workers"
              className="text-sm font-medium uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              Workers
            </Link>
            <span className="text-sm text-muted-foreground">/</span>
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              {worker.slug}
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{worker.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{worker.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={workerStatusVariant(worker.status)}>
              {humanizeLabel(worker.status)}
            </Badge>
            <Badge variant="outline">{worker.scope}</Badge>
            <Badge variant="secondary">{humanizeLabel(worker.kind)}</Badge>
          </div>
        </div>

        {/* Configuration panel */}
        <WorkerConfigPanel
          workerId={worker.id}
          initialName={worker.name}
          initialStatus={worker.status}
          initialMemberIds={worker.member_ids}
          initialAssigneeIds={worker.assignee_ids}
          initialReviewerIds={worker.reviewer_ids}
          inputRoutes={inputRoutes}
          connections={allConnections}
          actionCapabilities={actionCapabilities}
          usingFixtureFallback={usingFixtureFallback}
          people={Array.from(people.entries()).map(([id, display_name]) => ({
            id,
            display_name,
          }))}
        />

        <div className="grid gap-6 lg:grid-cols-5">
          {/* Main config column */}
          <div className="space-y-6 lg:col-span-3">
            {/* ── People ── */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">People</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <RoleList title="Members" ids={worker.member_ids} people={people} />
                  <RoleList title="Assignees" ids={worker.assignee_ids} people={people} />
                  <RoleList title="Reviewers" ids={worker.reviewer_ids} people={people} />
                </div>
              </CardContent>
            </Card>

            {/* ── Inputs ── */}
            <Card id="routes-section">
              <CardHeader>
                <CardTitle className="text-base">Inputs</CardTitle>
              </CardHeader>
              <CardContent>
                {inputRoutes.length > 0 ? (
                  <div className="space-y-3">
                    {inputRoutes.map((route) => (
                      <div
                        key={route.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{route.label}</p>
                              <Badge variant="outline" className="text-xs">
                                {humanizeLabel(route.kind)}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">{route.description}</p>
                          </div>
                          <Badge
                            variant={routeStatusVariant(route.status)}
                            className={`shrink-0 ${routeAccentClassName(route.kind)}`}
                          >
                            {humanizeLabel(route.status)}
                          </Badge>
                        </div>

                        {/* Forwarding address for forward_email routes */}
                        {route.kind === "forward_email" && route.address ? (
                          <div className="mt-2 rounded-md bg-muted/50 px-3 py-2">
                            <p className="text-xs text-muted-foreground">Forwarding address</p>
                            <p className="mt-0.5 font-mono text-xs text-foreground">{route.address}</p>
                          </div>
                        ) : null}

                        {/* Watched inbox address */}
                        {route.kind === "watched_inbox" && route.address ? (
                          <div className="mt-2 rounded-md bg-sky-50/50 px-3 py-2 dark:bg-sky-950/20">
                            <p className="text-xs text-sky-700 dark:text-sky-300">Monitoring</p>
                            <p className="mt-0.5 font-mono text-xs text-foreground">{route.address}</p>
                          </div>
                        ) : null}

                        {route.kind === "watched_inbox" ? (
                          <p className="mt-2 text-xs text-sky-700 dark:text-sky-300">
                            Proactive route. Notices inbox activity from Gmail read-only and creates shadow suggestions only.
                          </p>
                        ) : null}

                        {route.capability_note ? (
                          <p className="mt-1 text-xs italic text-muted-foreground">
                            {route.capability_note}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No input routes configured for this worker yet.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Connections ── */}
            <Card id="connections-section">
              <CardHeader>
                <CardTitle className="text-base">Connections</CardTitle>
              </CardHeader>
              <CardContent>
                {connections.length > 0 ? (
                  <div className="space-y-3">
                    {connections.map((connection) => (
                      <div
                        key={connection.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium text-foreground">{connection.label}</p>
                              <Badge variant="outline" className="text-xs">
                                {humanizeLabel(connection.access_mode)}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {connection.capabilities.join(", ")}
                            </p>
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

                        {/* Gmail-specific monitoring status */}
                        {connection.provider === "gmail" && connection.access_mode === "read_only" ? (
                          <div className="mt-2 rounded-md bg-sky-50/50 px-3 py-2 dark:bg-sky-950/20">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-block h-2 w-2 rounded-full ${
                                  gmailMonitoringActive
                                    ? "bg-emerald-500"
                                    : "bg-muted-foreground/40"
                                }`}
                              />
                              <p className="text-xs text-sky-700 dark:text-sky-300">
                                {gmailMonitoringActive
                                  ? "Monitoring active"
                                  : "Monitoring inactive"}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              Read-only connection. Enables watched inbox without enabling send.
                            </p>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No connections attached.</p>
                )}
              </CardContent>
            </Card>

            {/* ── Actions ── */}
            <Card id="actions-section">
              <CardHeader>
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent>
                {actionCapabilities.length > 0 ? (
                  <div className="space-y-3">
                    {actionCapabilities.map((action) => (
                      <div
                        key={action.id}
                        className="rounded-lg border border-border p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground">
                              {humanizeLabel(action.kind)}
                            </p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {boundaryModeDescription(action.boundary_mode)}
                            </p>
                            {action.reviewer_ids.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                                <span className="text-xs text-muted-foreground">Reviewers:</span>
                                {action.reviewer_ids.map((rid) => (
                                  <Badge key={rid} variant="outline" className="text-xs">
                                    {personName(people, rid)}
                                  </Badge>
                                ))}
                              </div>
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
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No actions configured.</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar: recent inbox + work */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Recent inbox</CardTitle>
                  <Link
                    href="/workspace/inbox"
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Open inbox
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {inboxItems.length > 0 ? (
                  inboxItems.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/workspace/inbox?item=${entry.id}`}
                      className="block rounded-lg border border-border p-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground">{entry.title}</p>
                        <Badge
                          variant={inboxKindVariant(entry.kind)}
                          className={`shrink-0 text-xs ${shadowBadgeClassName(entry.kind)}`}
                        >
                          {entry.kind === "shadow" ? "shadow suggestion" : humanizeLabel(entry.kind)}
                        </Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No inbox items for this worker.</p>
                )}
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
              <CardContent className="space-y-2">
                {workItems.length > 0 ? (
                  workItems.map((item) => (
                    <Link
                      key={item.id}
                      href={`/workspace/work/${item.id}`}
                      className="block rounded-lg border border-border p-2 transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-foreground">{item.title}</p>
                        <Badge variant={workKindVariant(item.kind)} className="shrink-0 text-xs">
                          {humanizeLabel(item.kind)}
                        </Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No work items for this worker.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoleList({
  title,
  ids,
  people,
}: {
  title: string;
  ids: string[];
  people: Map<string, string>;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1">
        {ids.length > 0 ? (
          ids.map((id) => (
            <Badge key={id} variant="outline" className="text-xs">
              {personName(people, id)}
            </Badge>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">None assigned</span>
        )}
      </div>
    </div>
  );
}

function boundaryModeDescription(mode: string): string {
  switch (mode) {
    case "auto":
      return "Executes automatically without review.";
    case "ask_me":
      return "Requires human review before execution.";
    case "never":
      return "Disabled. This action will never execute.";
    default:
      return "";
  }
}
