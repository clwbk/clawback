import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getWorkspaceReview,
  getWorkspaceWorkItem,
  listWorkspaceInbox,
  listWorkspacePeople,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import {
  inboxItems as fixtureInboxItems,
  reviewDetail as fixtureReviewDetail,
  workItems as fixtureWorkItems,
  workers as fixtureWorkers,
} from "@/lib/dev-fixtures";
import {
  humanizeLabel,
  personNames,
  titleFromId,
} from "../_lib/presentation";
import { ExecutionOutcomeCard } from "../_components/execution-outcome-card";
import { ExecutionStateCard } from "../_components/execution-state-card";
import { TriageDetailsCard } from "../_components/triage-details-card";
import { RouteActions } from "./route-actions";
import { ReviewActions } from "./review-actions";

type InboxPageProps = {
  searchParams: Promise<{ item?: string; work_item?: string; review?: string }>;
};

// ---------------------------------------------------------------------------
// Badge logic — one clear signal per item
// ---------------------------------------------------------------------------

function itemBadge(
  entry: { kind: string; state: string; triage_json?: { decision?: string } | null },
  review: { status: string } | null,
  workItem?: { status: string; execution_status: string } | null,
) {
  // Resolved route handoff gets a distinct badge
  if (
    entry.state === "resolved"
    && entry.triage_json?.decision === "route_to_worker"
    && !review
  ) {
    return { label: "Routed", variant: "outline" as const, className: "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-400" };
  }

  // Resolved items show the outcome, not the type
  if (entry.state === "resolved" && review) {
    // Failed execution after approval — show failure even if inbox resolved
    if (workItem?.execution_status === "failed" || workItem?.status === "failed") {
      return { label: "Failed", variant: "destructive" as const, className: "" };
    }
    // Only show "Sent" when execution actually completed, not just review completed
    if (workItem?.execution_status === "completed" && (workItem?.status === "sent" || workItem?.status === "completed")) {
      return { label: "Sent", variant: "default" as const, className: "bg-green-600 hover:bg-green-600 text-white" };
    }
    // Execution still in progress
    if (workItem?.execution_status === "queued" || workItem?.execution_status === "executing") {
      return { label: "Sending...", variant: "secondary" as const, className: "" };
    }
    if (review.status === "denied") return { label: "Denied", variant: "secondary" as const, className: "" };
    if (review.status === "approved" || review.status === "completed") return { label: "Approved", variant: "secondary" as const, className: "" };
    return { label: "Resolved", variant: "secondary" as const, className: "" };
  }
  if (entry.state === "resolved") return { label: "Resolved", variant: "secondary" as const, className: "" };

  // Open items show what needs attention
  if (entry.kind === "review" && workItem?.execution_status === "failed") {
    return { label: "Send failed", variant: "destructive" as const, className: "" };
  }
  if (
    entry.kind === "review"
    && review?.status === "approved"
    && (workItem?.execution_status === "queued" || workItem?.execution_status === "executing")
  ) {
    return { label: "Sending", variant: "secondary" as const, className: "" };
  }
  if (entry.kind === "review") return { label: "Needs review", variant: "default" as const, className: "bg-amber-500 hover:bg-amber-500 text-white" };
  if (entry.kind === "shadow") return { label: "Suggestion", variant: "outline" as const, className: "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400" };
  if (entry.kind === "setup") return { label: "Setup", variant: "outline" as const, className: "" };
  if (entry.kind === "boundary") return { label: "Boundary", variant: "outline" as const, className: "" };
  return { label: humanizeLabel(entry.kind), variant: "outline" as const, className: "" };
}

export default async function InboxPage({ searchParams }: InboxPageProps) {
  const { item, work_item: workItemId, review: reviewId } = await searchParams;
  let inboxItems = fixtureInboxItems;
  let workers = fixtureWorkers;
  let people = new Map<string, string>([
    ["usr_dave_01", "Dave Hartwell"],
    ["usr_emma_01", "Emma Chen"],
  ]);
  let usingFixtureFallback = false;

  try {
    const [inboxResult, workerResult, peopleResult] = await Promise.all([
      listWorkspaceInbox(),
      listWorkspaceWorkers(),
      listWorkspacePeople(),
    ]);
    inboxItems = inboxResult.items;
    workers = workerResult.workers;
    people = new Map(peopleResult.people.map((person) => [person.id, person.display_name]));
  } catch {
    usingFixtureFallback = true;
  }

  const selectedId = item ?? null;
  const selectedItem =
    inboxItems.find((inboxItem) => inboxItem.id === selectedId)
    ?? inboxItems.find((inboxItem) => inboxItem.review_id === reviewId)
    ?? inboxItems.find((inboxItem) => inboxItem.work_item_id === workItemId)
    ?? inboxItems[0]
    ?? null;
  const selectedItemId = selectedItem?.id ?? null;
  const workerNames = new Map(workers.map((worker) => [worker.id, worker.name]));

  const openReviewCount = inboxItems.filter((e) => e.kind === "review" && e.state === "open").length;
  const suggestionCount = inboxItems.filter((e) => e.kind === "shadow").length;
  const resolvedCount = inboxItems.filter((e) => e.state === "resolved").length;

  let review = selectedItem?.review_id === fixtureReviewDetail.id ? fixtureReviewDetail : null;
  let selectedWorkItem = selectedItem?.work_item_id
    ? fixtureWorkItems.find((item) => item.id === selectedItem.work_item_id) ?? null
    : null;
  if (selectedItem?.review_id) {
    try {
      review = await getWorkspaceReview(selectedItem.review_id);
    } catch {
      if (!usingFixtureFallback) {
        review = null;
      }
    }
  }
  if (selectedItem?.work_item_id) {
    try {
      selectedWorkItem = await getWorkspaceWorkItem(selectedItem.work_item_id);
    } catch {
      if (!usingFixtureFallback) {
        selectedWorkItem = null;
      }
    }
  }

  // Pre-compute badge for selected item
  const selectedBadge = selectedItem ? itemBadge(selectedItem, review, selectedWorkItem) : null;
  const selectedTriage = selectedItem?.triage_json ?? selectedWorkItem?.triage_json ?? null;

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
              Inbox
            </p>
            {usingFixtureFallback ? <Badge variant="outline">fixture fallback</Badge> : null}
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-foreground">
            Reviews and suggestions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Gated actions, proactive suggestions, and setup decisions.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {openReviewCount > 0 ? (
              <Badge className="bg-amber-500 hover:bg-amber-500 text-white">{openReviewCount} needs review</Badge>
            ) : null}
            {suggestionCount > 0 ? (
              <Badge variant="outline" className="border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-400">
                {suggestionCount} suggestion
              </Badge>
            ) : null}
            {resolvedCount > 0 ? (
              <Badge variant="secondary">{resolvedCount} resolved</Badge>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {inboxItems.map((entry) => {
                    const badge = itemBadge(
                      entry,
                      entry.review_id === review?.id ? review : null,
                      entry.work_item_id === selectedWorkItem?.id ? selectedWorkItem : null,
                    );
                    return (
                      <Link
                        key={entry.id}
                        href={`/workspace/inbox?item=${entry.id}`}
                        className={[
                          "block w-full p-4 text-left transition-colors hover:bg-muted/50",
                          selectedItemId === entry.id ? "bg-muted/50" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground">{entry.title}</p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                              {entry.summary}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {entry.worker_id ? (
                                <Badge variant="outline" className="text-[10px]">
                                  {workerNames.get(entry.worker_id) ?? titleFromId(entry.worker_id)}
                                </Badge>
                              ) : null}
                            </div>
                          </div>
                          <Badge variant={badge.variant} className={badge.className}>
                            {badge.label}
                          </Badge>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-3">
            {selectedItem && selectedBadge ? (
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg">{selectedItem.title}</CardTitle>
                    <Badge variant={selectedBadge.variant} className={selectedBadge.className}>
                      {selectedBadge.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <Detail
                      label="Worker"
                      value={selectedItem.worker_id
                        ? workerNames.get(selectedItem.worker_id) ?? titleFromId(selectedItem.worker_id)
                        : "N/A"}
                    />
                    <Detail label="Route" value={humanizeLabel(selectedItem.route_kind)} />
                    <Detail label="State" value={humanizeLabel(selectedItem.state)} />
                  </div>

                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Summary</p>
                    <p className="text-sm text-foreground">
                      {selectedItem.summary ?? "No summary available."}
                    </p>
                  </div>

                  {selectedTriage ? <TriageDetailsCard triage={selectedTriage} workerNames={workerNames} /> : null}

                  {selectedItem.execution_state_json ? (
                    <ExecutionStateCard executionState={selectedItem.execution_state_json} workerNames={workerNames} />
                  ) : null}

                  {selectedItem.kind === "shadow" ? (
                    <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900 dark:bg-blue-950/30">
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                        Proactive suggestion
                      </p>
                      <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                        This was noticed automatically from a watched inbox. No action was taken.
                      </p>
                    </div>
                  ) : null}

                  {selectedItem.kind === "shadow" && (selectedWorkItem?.draft_subject || selectedWorkItem?.draft_body) ? (
                    <div className="rounded-lg border border-border bg-muted/20 p-3">
                      <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                        Draft
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {selectedWorkItem?.draft_subject ?? "(no subject)"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        To {selectedWorkItem?.draft_to ?? "N/A"}
                      </p>
                      <pre className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                        {selectedWorkItem?.draft_body}
                      </pre>
                    </div>
                  ) : null}

                  {/* Route handoff completed — show destination details */}
                  {selectedItem.state === "resolved"
                    && selectedTriage?.decision === "route_to_worker"
                    && selectedItem.work_item_id ? (
                    <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-900 dark:bg-purple-950/30">
                      <p className="text-xs font-medium uppercase tracking-widest text-purple-800 dark:text-purple-300">
                        Route handoff completed
                      </p>
                      <p className="mt-1 text-sm text-purple-700 dark:text-purple-400">
                        {selectedItem.summary}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-3">
                        {selectedTriage.route_target_worker_id ? (
                          <Detail
                            label="Destination worker"
                            value={workerNames.get(selectedTriage.route_target_worker_id) ?? titleFromId(selectedTriage.route_target_worker_id)}
                          />
                        ) : null}
                        <Detail
                          label="Origin worker"
                          value={selectedItem.worker_id
                            ? workerNames.get(selectedItem.worker_id) ?? titleFromId(selectedItem.worker_id)
                            : "N/A"}
                        />
                      </div>
                      <div className="mt-3">
                        <Link href={`/workspace/work/${selectedItem.work_item_id}`}>
                          <Badge variant="outline" className="cursor-pointer border-purple-300 hover:bg-purple-100 dark:border-purple-700 dark:hover:bg-purple-950/50">
                            Open destination work
                          </Badge>
                        </Link>
                      </div>
                    </div>
                  ) : null}

                  {selectedItem.work_item_id
                    && !(selectedItem.state === "resolved" && selectedTriage?.decision === "route_to_worker") ? (
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/workspace/work/${selectedItem.work_item_id}`}>
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                          Open related work
                        </Badge>
                      </Link>
                    </div>
                  ) : null}

                  {selectedTriage?.decision === "route_to_worker" && !selectedItem.review_id ? (
                    <div className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Route handoff
                          </p>
                          <p className="mt-1 text-sm text-foreground">
                            Confirm this reviewed handoff to create downstream work for the suggested worker.
                          </p>
                        </div>
                        <RouteActions
                          inboxItemId={selectedItem.id}
                          state={selectedItem.state}
                        />
                      </div>
                    </div>
                  ) : null}

                  {review ? (
                    <div className="rounded-lg border border-border p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Review detail
                          </p>
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {humanizeLabel(review.action_kind)}
                          </p>
                        </div>
                        <Badge
                          variant={review.status === "approved" ? "default" : review.status === "denied" ? "secondary" : "outline"}
                          className={review.status === "approved" ? "bg-green-600 hover:bg-green-600 text-white" : review.status === "pending" ? "bg-amber-500 hover:bg-amber-500 text-white" : ""}
                        >
                          {humanizeLabel(review.status)}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Detail label="Destination" value={review.action_destination ?? "N/A"} />
                        <Detail label="Requested by route" value={humanizeLabel(review.source_route_kind)} />
                        <Detail label="Reviewers" value={personNames(people, review.reviewer_ids)} />
                        <Detail label="Assignees" value={personNames(people, review.assignee_ids)} />
                        <Detail
                          label="Execution"
                          value={humanizeLabel(selectedWorkItem?.execution_status)}
                        />
                      </div>
                      {selectedWorkItem?.draft_subject || selectedWorkItem?.draft_body ? (
                        <div className="mt-4 rounded-lg border border-border bg-muted/20 p-3">
                          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                            Draft
                          </p>
                          <p className="mt-2 text-sm font-medium text-foreground">
                            {selectedWorkItem.draft_subject ?? "(no subject)"}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            To {selectedWorkItem.draft_to ?? review.action_destination ?? "N/A"}
                          </p>
                          <pre className="mt-3 whitespace-pre-wrap text-sm text-foreground">
                            {selectedWorkItem.draft_body}
                          </pre>
                        </div>
                      ) : null}
                      {selectedWorkItem?.execution_outcome_json ? (
                        <div className="mt-4">
                          <ExecutionOutcomeCard outcome={selectedWorkItem.execution_outcome_json} />
                        </div>
                      ) : null}
                      <div className="mt-4">
                        <ReviewActions
                          reviewId={review.id}
                          reviewStatus={review.status}
                          workItemId={selectedWorkItem?.id ?? null}
                          executionStatus={selectedWorkItem?.execution_status ?? null}
                          executionOutcome={
                            selectedWorkItem?.execution_outcome_json?.kind === "reviewed_send_email"
                              ? selectedWorkItem.execution_outcome_json
                              : null
                          }
                        />
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center py-12">
                  <p className="text-sm text-muted-foreground">
                    Select an inbox item to see details.
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}
