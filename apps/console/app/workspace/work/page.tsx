import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listWorkspaceWork,
  listWorkspaceWorkers,
  type WorkspaceWorkItemRecord,
} from "@/lib/control-plane";
import { workItems as fixtureWorkItems, workers as fixtureWorkers } from "@/lib/dev-fixtures";
import {
  activityAccentClassName,
  executionStatusVariant,
  humanizeLabel,
  shadowModeDescription,
  titleFromId,
  workKindVariant,
  workStatusVariant,
} from "../_lib/presentation";
import { ExecutionOutcomeCard } from "../_components/execution-outcome-card";
import { ExecutionStateCard } from "../_components/execution-state-card";
import { ReviewedSendRetryButton } from "../_components/reviewed-send-retry-button";
import { TriageDetailsCard } from "../_components/triage-details-card";

type WorkPageProps = {
  searchParams: Promise<{ item?: string }>;
};

export default async function WorkPage({ searchParams }: WorkPageProps) {
  const { item } = await searchParams;
  let workItems = fixtureWorkItems;
  let workers = fixtureWorkers;
  let usingFixtureFallback = false;

  try {
    const [workResult, workerResult] = await Promise.all([
      listWorkspaceWork(),
      listWorkspaceWorkers(),
    ]);
    workItems = workResult.work_items;
    workers = workerResult.workers;
  } catch {
    usingFixtureFallback = true;
  }

  const selectedId = item ?? workItems[0]?.id ?? null;
  const selectedItem = workItems.find((workItem) => workItem.id === selectedId) ?? null;
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]));

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Work
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">Durable outputs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drafts, proposals, tickets, and saved work across the workspace.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {workItems.map((itemRecord) => (
                    <Link
                      key={itemRecord.id}
                      href={`/workspace/work?item=${itemRecord.id}`}
                      className={[
                        "block w-full p-4 text-left transition-colors hover:bg-muted/50",
                        selectedId === itemRecord.id ? "bg-muted/50" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{itemRecord.title}</p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                            {itemRecord.summary}
                          </p>
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            <Badge variant="outline" className="text-[10px]">
                              {workerNames.get(itemRecord.worker_id) ?? titleFromId(itemRecord.worker_id)}
                            </Badge>
                            {itemRecord.source_route_kind ? (
                              <Badge
                                variant="outline"
                                className={`text-[10px] ${activityAccentClassName({
                                  routeKind: itemRecord.source_route_kind,
                                  resultKind: itemRecord.review_id ? null : "shadow_draft_created",
                                })}`}
                              >
                                {humanizeLabel(itemRecord.source_route_kind)}
                              </Badge>
                            ) : null}
                            {itemRecord.source_inbox_item_id ? (
                              <Badge variant="outline" className="text-[10px] border-purple-200 text-purple-600 dark:border-purple-800 dark:text-purple-400">
                                routed
                              </Badge>
                            ) : null}
                            {itemRecord.review_id ? (
                              <Badge variant="secondary" className="text-[10px]">
                                review linked
                              </Badge>
                            ) : itemRecord.source_route_kind === "watched_inbox" && itemRecord.kind === "email_draft" ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
                              >
                                shadow
                              </Badge>
                            ) : null}
                            {itemRecord.execution_status !== "not_requested" ? (
                              <Badge variant={executionStatusVariant(itemRecord.execution_status)} className="text-[10px]">
                                {humanizeLabel(itemRecord.execution_status)}
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                        <Badge
                          variant={workKindVariant(itemRecord.kind)}
                        className={`shrink-0 ${activityAccentClassName({
                          routeKind: itemRecord.source_route_kind,
                          resultKind: itemRecord.review_id ? null : "shadow_draft_created",
                        })}`}
                      >
                          {itemRecord.source_route_kind === "watched_inbox" && !itemRecord.review_id && itemRecord.kind === "email_draft"
                            ? "shadow draft"
                            : humanizeLabel(itemRecord.kind)}
                        </Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3">
            {selectedItem ? (
              <WorkItemPanel item={selectedItem} workerName={workerNames.get(selectedItem.worker_id)} workerNames={workerNames} />
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">
                    Select a work item to see details.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkItemPanel({
  item,
  workerName,
  workerNames,
}: {
  item: WorkspaceWorkItemRecord;
  workerName: string | undefined;
  workerNames: Map<string, string>;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{item.title}</CardTitle>
          <Badge variant={workStatusVariant(item.status)}>{humanizeLabel(item.status)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Worker</p>
            <p className="text-sm text-foreground">
              {workerName ?? titleFromId(item.worker_id)}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Type</p>
            <Badge variant={workKindVariant(item.kind)}>{humanizeLabel(item.kind)}</Badge>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Route</p>
            <p className="text-sm text-foreground">{humanizeLabel(item.source_route_kind)}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Execution</p>
            <Badge variant={executionStatusVariant(item.execution_status)}>
              {humanizeLabel(item.execution_status)}
            </Badge>
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Summary</p>
          <p className="text-sm text-foreground">{item.summary ?? "No summary available."}</p>
        </div>

        {item.source_inbox_item_id ? (
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-900 dark:bg-purple-950/30">
            <p className="text-xs font-medium text-purple-800 dark:text-purple-300">
              Route origin
            </p>
            <p className="mt-0.5 text-sm text-purple-700 dark:text-purple-400">
              This work was created from a reviewed route handoff.
            </p>
          </div>
        ) : null}

        {item.triage_json ? <TriageDetailsCard triage={item.triage_json} workerNames={workerNames} /> : null}

        {item.execution_state_json ? (
          <ExecutionStateCard executionState={item.execution_state_json} workerNames={workerNames} />
        ) : null}

        {item.draft_subject || item.draft_body ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Draft</p>
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">
                {item.draft_subject ?? "(no subject)"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                To {item.draft_to ?? "N/A"}
              </p>
              <pre className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                {item.draft_body}
              </pre>
            </div>
          </div>
        ) : null}

        {item.execution_error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <p className="text-xs font-medium uppercase tracking-widest text-destructive">
              Execution error
            </p>
            <p className="mt-1 text-sm text-foreground">{item.execution_error}</p>
          </div>
        ) : null}

        {item.execution_outcome_json ? (
          <ExecutionOutcomeCard outcome={item.execution_outcome_json} />
        ) : null}

        {item.execution_status === "failed"
          && item.execution_outcome_json?.kind === "reviewed_send_email" ? (
          <div className="rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Recovery
            </p>
            <p className="mt-1 text-sm text-foreground">
              Approval is already recorded. Retry stays on the same reviewed-send record and increments the attempt count instead of creating a duplicate send.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <ReviewedSendRetryButton
                workItemId={item.id}
                outcome={item.execution_outcome_json}
                showGuidance
              />
              <Link href={`/workspace/inbox?work_item=${item.id}`}>
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                  Open linked review
                </Badge>
              </Link>
            </div>
          </div>
        ) : null}

        {item.source_route_kind === "watched_inbox" && !item.review_id && item.kind === "email_draft" ? (
          <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900 dark:bg-sky-950/20">
            <p className="text-xs font-medium uppercase tracking-widest text-sky-700 dark:text-sky-300">
              Proactive suggestion
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {shadowModeDescription({ routeKind: item.source_route_kind })}
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link href={`/workspace/work/${item.id}`}>
            <Badge variant="outline" className="cursor-pointer hover:bg-muted">
              Open detail
            </Badge>
          </Link>
          {item.source_inbox_item_id ? (
            <Link href={`/workspace/inbox?item=${item.source_inbox_item_id}`}>
              <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                Open originating route
              </Badge>
            </Link>
          ) : null}
          {item.review_id ? (
            <Link href={`/workspace/inbox?work_item=${item.id}`}>
              <Badge variant="secondary" className="cursor-pointer hover:bg-muted">
                Open linked review
              </Badge>
            </Link>
          ) : item.source_route_kind === "watched_inbox" && item.kind === "email_draft" ? (
            <Link href={`/workspace/inbox?work_item=${item.id}`}>
              <Badge
                variant="outline"
                className="cursor-pointer border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
              >
                Open shadow suggestion
              </Badge>
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
