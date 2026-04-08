import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInputRoutes,
  listWorkspacePeople,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import {
  followUpActions,
  followUpConnections,
  followUpRoutes,
  workers as fixtureWorkers,
} from "@/lib/dev-fixtures";
import {
  connectionAccentClassName,
  humanizeLabel,
  personName,
  routeAccentClassName,
  workerStatusVariant,
} from "../_lib/presentation";
import { AddWorkerButton } from "./add-worker-button";

export default async function WorkersPage() {
  let workers = fixtureWorkers;
  let inputRoutes = followUpRoutes;
  let connections = followUpConnections;
  let actionCapabilities = followUpActions;
  let people = new Map<string, string>([
    ["usr_dave_01", "Dave Hartwell"],
    ["usr_emma_01", "Emma Chen"],
  ]);
  let usingFixtureFallback = false;

  try {
    const [workerResult, routeResult, connectionResult, actionResult, peopleResult] = await Promise.all([
      listWorkspaceWorkers(),
      listWorkspaceInputRoutes(),
      listWorkspaceConnections(),
      listWorkspaceActionCapabilities(),
      listWorkspacePeople(),
    ]);
    workers = workerResult.workers;
    inputRoutes = routeResult.input_routes;
    connections = connectionResult.connections;
    actionCapabilities = actionResult.action_capabilities;
    people = new Map(peopleResult.people.map((person) => [person.id, person.display_name]));
  } catch {
    usingFixtureFallback = true;
  }

  const sharedWorkers = workers.filter((worker) => worker.scope === "shared");
  const connectionsByWorker = new Map<string, typeof connections>();
  for (const connection of connections) {
    for (const workerId of connection.attached_worker_ids) {
      const current = connectionsByWorker.get(workerId) ?? [];
      current.push(connection);
      connectionsByWorker.set(workerId, current);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                Workers
              </p>
              {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Installed workers</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Shared roles, team access, inputs, connected systems, outputs, and governed actions.
            </p>
          </div>
          <AddWorkerButton />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-sky-500/20 bg-sky-500/5">
            <CardHeader className="pb-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Worker-first path
              </p>
              <CardTitle className="text-base">Install a role, then bring it live</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Start from a worker template, not a blank chat. After install, Clawback opens that
                worker&apos;s activation guide so you can assign people, confirm routes, and run
                sample activity when the template supports it.
              </p>
              <div className="flex flex-wrap gap-2">
                <AddWorkerButton />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Retrieval-first path
              </p>
              <CardTitle className="text-base">Prefer a no-Google proof first?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Open the seeded knowledge source, confirm it is indexed, then use Incident Copilot
                in Chat. This is the clearest retrieval-backed evaluator path when you want value
                before wiring live systems.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/workspace/connectors">Open Knowledge</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/workspace/chat">Open Chat</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="default">{sharedWorkers.length} shared</Badge>
          <Badge variant="outline">{workers.length - sharedWorkers.length} personal</Badge>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          {workers.map((worker) => {
            const workerRoutes = inputRoutes.filter((route) => route.worker_id === worker.id);
            const workerConnections = connectionsByWorker.get(worker.id) ?? [];
            const workerActions = actionCapabilities.filter((action) => action.worker_id === worker.id);

            return (
              <Link key={worker.id} href={`/workspace/workers/${worker.id}`}>
                <Card className="h-full cursor-pointer transition-colors hover:bg-muted/30">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base">{worker.name}</CardTitle>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {worker.summary}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge variant={workerStatusVariant(worker.status)}>
                          {humanizeLabel(worker.status)}
                        </Badge>
                        <Badge variant="outline">{worker.scope}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Summary counts row */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{worker.member_ids.length} {worker.member_ids.length === 1 ? "member" : "members"}</span>
                      <span className="text-border">|</span>
                      <span>{workerConnections.length} {workerConnections.length === 1 ? "connection" : "connections"}</span>
                      <span className="text-border">|</span>
                      <span>{workerRoutes.length} {workerRoutes.length === 1 ? "input" : "inputs"}</span>
                      <span className="text-border">|</span>
                      <span>{workerActions.length} {workerActions.length === 1 ? "action" : "actions"}</span>
                    </div>

                    <Section title="People">
                      {worker.member_ids.map((id) => (
                        <Badge key={id} variant="outline" className="text-xs">
                          {personName(people, id)}
                        </Badge>
                      ))}
                    </Section>

                    <Section title="Inputs">
                      {workerRoutes.length > 0
                        ? workerRoutes.map((route) => (
                            <Badge
                              key={route.id}
                              variant="secondary"
                              className={`text-xs ${routeAccentClassName(route.kind)}`}
                            >
                              {route.kind === "watched_inbox" ? "Watched inbox" : route.label}
                            </Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">No input routes</span>}
                    </Section>

                    <Section title="Connections">
                      {workerConnections.length > 0
                        ? workerConnections.map((connection) => (
                              <Badge
                                key={connection.id}
                                variant="secondary"
                                className={`text-xs ${connectionAccentClassName({
                                  provider: connection.provider,
                                  accessMode: connection.access_mode,
                                  status: connection.status,
                                })}`}
                              >
                                {connection.provider === "gmail" && connection.access_mode === "read_only"
                                  ? "Gmail read-only"
                                  : connection.label}
                              </Badge>
                            ))
                        : <span className="text-xs text-muted-foreground">No connections</span>}
                    </Section>

                    <Section title="Actions">
                      {workerActions.length > 0
                        ? workerActions.map((action) => (
                            <Badge key={action.id} variant="secondary" className="text-xs">
                              {humanizeLabel(action.kind)} ({humanizeLabel(action.boundary_mode)})
                            </Badge>
                          ))
                        : <span className="text-xs text-muted-foreground">No actions</span>}
                    </Section>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}
