import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorkspaceReview,
  getWorkspaceWorkItem,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import {
  reviewDetail as fixtureReviewDetail,
  workItems as fixtureWorkItems,
  workers as fixtureWorkers,
} from "@/lib/dev-fixtures";
import {
  activityAccentClassName,
  executionStatusVariant,
  humanizeLabel,
  reviewStatusVariant,
  shadowModeDescription,
  titleFromId,
  workKindVariant,
  workStatusVariant,
} from "../../_lib/presentation";
import { ExecutionOutcomeCard } from "../../_components/execution-outcome-card";
import { ExecutionStateCard } from "../../_components/execution-state-card";
import { ReviewedSendRetryButton } from "../../_components/reviewed-send-retry-button";
import { TriageDetailsCard } from "../../_components/triage-details-card";

type WorkItemDetailPageProps = {
  params: Promise<{ id: string }>;
};

export default async function WorkItemDetailPage({ params }: WorkItemDetailPageProps) {
  const { id } = await params;
  let item = fixtureWorkItems.find((workItem) => workItem.id === id) ?? null;
  let workers = fixtureWorkers;
  let usingFixtureFallback = false;

  try {
    const [workItem, workerResult] = await Promise.all([
      getWorkspaceWorkItem(id),
      listWorkspaceWorkers(),
    ]);
    item = workItem;
    workers = workerResult.workers;
  } catch {
    usingFixtureFallback = true;
  }

  if (!item) {
    return (
      <div className="flex h-full items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-foreground">Work item not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No work item with id &ldquo;{id}&rdquo;
          </p>
          <Link href="/workspace/work">
            <Button variant="outline" className="mt-4">
              Back to Work
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]));
  let review = item.review_id === fixtureReviewDetail.id ? fixtureReviewDetail : null;
  if (item.review_id) {
    try {
      review = await getWorkspaceReview(item.review_id);
    } catch {
      if (!usingFixtureFallback) {
        review = null;
      }
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Work
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">{item.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge
              variant={workKindVariant(item.kind)}
              className={activityAccentClassName({
                routeKind: item.source_route_kind,
                resultKind: item.review_id ? null : "shadow_draft_created",
              })}
            >
              {item.source_route_kind === "watched_inbox" && !item.review_id
                && item.kind === "email_draft"
                ? "shadow draft"
                : humanizeLabel(item.kind)}
            </Badge>
            <Badge variant={workStatusVariant(item.status)}>{humanizeLabel(item.status)}</Badge>
            {item.execution_status !== "not_requested" ? (
              <Badge variant={executionStatusVariant(item.execution_status)}>
                {humanizeLabel(item.execution_status)}
              </Badge>
            ) : null}
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              <Detail
                label="Worker"
                value={workerNames.get(item.worker_id) ?? titleFromId(item.worker_id)}
              />
              <Detail label="Route" value={humanizeLabel(item.source_route_kind)} />
              <Detail label="Status" value={humanizeLabel(item.status)} />
              <Detail label="Execution" value={humanizeLabel(item.execution_status)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-foreground">{item.summary ?? "No summary available."}</p>
          </CardContent>
        </Card>

        {item.triage_json ? <TriageDetailsCard triage={item.triage_json} workerNames={workerNames} /> : null}

        {item.execution_state_json ? (
          <ExecutionStateCard executionState={item.execution_state_json} workerNames={workerNames} />
        ) : null}

        {item.source_inbox_item_id ? (
          <Card className="border-purple-200 dark:border-purple-900">
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-base">Route origin</CardTitle>
                <Badge variant="outline" className="border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400">
                  Routed handoff
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This work was created from a reviewed route suggestion. An operator confirmed the handoff from the origin worker.
              </p>
              {item.triage_json?.reasons ? (
                <div className="grid grid-cols-2 gap-3">
                  <Detail label="Assigned to" value={workerNames.get(item.worker_id) ?? titleFromId(item.worker_id)} />
                  <Detail label="Intent" value={humanizeLabel(item.triage_json.intent)} />
                </div>
              ) : null}
              <Link href={`/workspace/inbox?item=${item.source_inbox_item_id}`}>
                <Button variant="outline" size="sm">
                  Open originating route
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {item.draft_subject || item.draft_body ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Draft</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Detail label="To" value={item.draft_to ?? "N/A"} />
              <Detail label="Subject" value={item.draft_subject ?? "(no subject)"} />
              <pre className="whitespace-pre-wrap text-sm text-foreground">
                {item.draft_body}
              </pre>
            </CardContent>
          </Card>
        ) : null}

        {item.execution_error ? (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-base">Execution error</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-foreground">{item.execution_error}</p>
            </CardContent>
          </Card>
        ) : null}

        {item.execution_outcome_json ? (
          <ExecutionOutcomeCard outcome={item.execution_outcome_json} />
        ) : null}

        {item.execution_status === "failed"
          && item.execution_outcome_json?.kind === "reviewed_send_email" ? (
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-base">Recovery</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-foreground">
                Approval is already recorded. Retry stays on the same reviewed-send record and increments the attempt count instead of creating a duplicate send.
              </p>
              <ReviewedSendRetryButton
                workItemId={item.id}
                outcome={item.execution_outcome_json}
                showGuidance
              />
            </CardContent>
          </Card>
        ) : null}

        {item.source_route_kind === "watched_inbox" && !item.review_id && item.kind === "email_draft" ? (
          <Card className="border-sky-200 dark:border-sky-900">
            <CardHeader>
              <CardTitle className="text-base">Shadow suggestion</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {shadowModeDescription({ routeKind: item.source_route_kind })}
              </p>
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
                >
                  read-only
                </Badge>
                <Badge
                  variant="outline"
                  className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300"
                >
                  no external action
                </Badge>
              </div>
              <Link href={`/workspace/inbox?work_item=${item.id}`}>
                <Button variant="outline" size="sm">
                  Open in inbox
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : null}

        {review ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linked review</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <Detail label="Action" value={humanizeLabel(review.action_kind)} />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Status</p>
                  <Badge variant={reviewStatusVariant(review.status)}>
                    {humanizeLabel(review.status)}
                  </Badge>
                </div>
                <Detail label="Destination" value={review.action_destination ?? "N/A"} />
              </div>
              <Link href={`/workspace/inbox?work_item=${item.id}`}>
                <Button variant="outline" size="sm">
                  Open in inbox
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : null}

        <div>
          <Link href="/workspace/work">
            <Button variant="outline">Back to Work</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
