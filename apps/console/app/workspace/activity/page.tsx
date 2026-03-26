import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listWorkspaceActivity, listWorkspaceWorkers } from "@/lib/control-plane";
import { activityEvents as fixtureEvents, workers as fixtureWorkers } from "@/lib/dev-fixtures";
import {
  activityAccentClassName,
  activityResultVariant,
  formatClockTime,
  humanizeLabel,
  titleFromId,
} from "../_lib/presentation";

export default async function ActivityPage() {
  let events = fixtureEvents;
  let workers = fixtureWorkers;
  let usingFixtureFallback = false;

  try {
    const [activityResult, workerResult] = await Promise.all([
      listWorkspaceActivity(),
      listWorkspaceWorkers(),
    ]);
    events = activityResult.events;
    workers = workerResult.workers;
  } catch {
    usingFixtureFallback = true;
  }

  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]));
  const workerSummary = workers
    .map((worker) => {
      const workerEvents = events.filter((event) => event.worker_id === worker.id);
      return {
        id: worker.id,
        name: worker.name,
        runCount: workerEvents.length,
        reviewCount: workerEvents.filter((event) => event.result_kind.includes("review")).length,
        shadowCount: workerEvents.filter((event) => event.result_kind === "shadow_draft_created").length,
      };
    })
    .filter((summary) => summary.runCount > 0);
  const routeKinds = Array.from(new Set(events.map((event) => event.route_kind).filter(Boolean)));
  const proactiveCount = events.filter((event) => event.result_kind === "shadow_draft_created").length;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Activity
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Workspace activity</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            What workers noticed, prepared, reviewed, and completed across the workspace.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant="default">{events.length} events</Badge>
            <Badge
              variant="outline"
              className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
            >
              {proactiveCount} proactive
            </Badge>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {events.map((event) => (
                    <div key={event.id} className="flex gap-4">
                      <div className="w-16 shrink-0 text-right">
                        <p className="text-xs font-medium text-muted-foreground">
                          {formatClockTime(event.timestamp)}
                        </p>
                      </div>
                      <div className="relative flex-1 rounded-lg border border-border p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium text-foreground">{event.title}</p>
                            {event.summary ? (
                              <p className="mt-0.5 text-xs text-muted-foreground">
                                {event.summary}
                              </p>
                            ) : null}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <Badge variant="outline" className="text-[10px]">
                                {event.worker_id
                                  ? workerNames.get(event.worker_id) ?? titleFromId(event.worker_id)
                                  : "System"}
                              </Badge>
                              {event.route_kind ? (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${activityAccentClassName({
                                    routeKind: event.route_kind,
                                    resultKind: event.result_kind,
                                  })}`}
                                >
                                  {humanizeLabel(event.route_kind)}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <Badge
                            variant={activityResultVariant(event.result_kind)}
                            className={`shrink-0 text-[10px] ${activityAccentClassName({
                              routeKind: event.route_kind,
                              resultKind: event.result_kind,
                            })}`}
                          >
                            {event.result_kind === "shadow_draft_created"
                              ? "proactive draft"
                              : humanizeLabel(event.result_kind)}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">By worker</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {workerSummary.map((summary) => (
                  <div
                    key={summary.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{summary.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {summary.runCount} event{summary.runCount === 1 ? "" : "s"}
                        {summary.reviewCount > 0
                          ? `, ${summary.reviewCount} review item${summary.reviewCount === 1 ? "" : "s"}`
                          : ""}
                        {summary.shadowCount > 0
                          ? `${summary.reviewCount > 0 ? "," : ""} ${summary.shadowCount} proactive draft${summary.shadowCount === 1 ? "" : "s"}`
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">By route</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {routeKinds.map((routeKind) => (
                    <div key={routeKind} className="rounded-lg border border-border p-3">
                      <p className="text-sm font-medium text-foreground">
                        {humanizeLabel(routeKind)}
                      </p>
                      {routeKind === "watched_inbox" ? (
                        <p className="mt-1 text-xs text-sky-700 dark:text-sky-300">
                          Proactive route from Gmail read-only. Creates shadow suggestions only.
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">
                        {events.filter((event) => event.route_kind === routeKind).length} event
                        {events.filter((event) => event.route_kind === routeKind).length === 1
                          ? ""
                          : "s"}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
