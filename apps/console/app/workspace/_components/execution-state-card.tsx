import type { FollowUpExecutionStateRecord } from "@clawback/contracts";

import { Badge } from "@/components/ui/badge";
import { humanizeLabel } from "../_lib/presentation";

function stateBadge(state: FollowUpExecutionStateRecord["state"]) {
  switch (state) {
    case "waiting_review":
      return { variant: "default" as const, className: "bg-amber-500 hover:bg-amber-500 text-white" };
    case "running":
      return { variant: "secondary" as const, className: "" };
    case "completed":
      return { variant: "default" as const, className: "bg-green-600 hover:bg-green-600 text-white" };
    case "failed":
      return { variant: "destructive" as const, className: "" };
    default:
      return { variant: "outline" as const, className: "" };
  }
}

function humanizeState(state: FollowUpExecutionStateRecord["state"]): string {
  switch (state) {
    case "waiting_review":
      return "Waiting for review";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return humanizeLabel(state);
  }
}

function humanizePauseReason(reason: FollowUpExecutionStateRecord["pause_reason"]): string {
  switch (reason) {
    case "human_review":
      return "Waiting for human review of the drafted action.";
    case "route_confirmation":
      return "Waiting for an operator to confirm the route handoff.";
    default:
      return "";
  }
}

function humanizeResumeReason(reason: FollowUpExecutionStateRecord["resume_reason"]): string {
  switch (reason) {
    case "review_approved":
      return "Resumed after review approval.";
    case "review_denied":
      return "Completed after review denial.";
    case "route_confirmed":
      return "Resumed after operator confirmed the route handoff.";
    default:
      return "";
  }
}

function humanizeStep(step: FollowUpExecutionStateRecord["current_step"]): string {
  switch (step) {
    case "wait_for_review":
      return "Waiting for review";
    case "resume_after_review":
      return "Resumed after review";
    case "resume_after_route_confirmation":
      return "Resumed after route confirmation";
    case "execute_action":
      return "Executing action";
    case "record_outcome":
      return "Recording outcome";
    default:
      return humanizeLabel(step);
  }
}

function humanizeDecision(decision: FollowUpExecutionStateRecord["last_decision"]): string {
  switch (decision) {
    case "shadow_draft":
      return "Draft created for review";
    case "request_review":
      return "Flagged for human review";
    case "route_to_worker":
      return "Route suggested to another worker";
    case "escalate":
      return "Escalated for urgent attention";
    case "ignore":
      return "Ignored automatically";
    default:
      return decision ? humanizeLabel(decision) : "—";
  }
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

export function ExecutionStateCard({
  executionState,
  workerNames,
}: {
  executionState: FollowUpExecutionStateRecord;
  workerNames?: Map<string, string>;
}) {
  const badge = stateBadge(executionState.state);
  const pauseExplanation = executionState.pause_reason
    ? humanizePauseReason(executionState.pause_reason)
    : null;
  const resumeExplanation = executionState.resume_reason
    ? humanizeResumeReason(executionState.resume_reason)
    : null;

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Execution progress
          </p>
          <p className="mt-1 text-sm text-foreground">
            {humanizeStep(executionState.current_step)}
          </p>
        </div>
        <Badge variant={badge.variant} className={badge.className}>
          {humanizeState(executionState.state)}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Detail label="Decision" value={humanizeDecision(executionState.last_decision)} />
        <Detail label="Current step" value={humanizeStep(executionState.current_step)} />
        {executionState.target_worker_id ? (
          <Detail
            label="Target worker"
            value={workerNames?.get(executionState.target_worker_id) ?? executionState.target_worker_id}
          />
        ) : null}
      </div>

      {pauseExplanation && executionState.state === "waiting_review" ? (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Paused
          </p>
          <p className="mt-0.5 text-sm text-amber-700 dark:text-amber-400">
            {pauseExplanation}
          </p>
        </div>
      ) : null}

      {resumeExplanation ? (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50/50 p-3 dark:border-green-900 dark:bg-green-950/30">
          <p className="text-xs font-medium text-green-800 dark:text-green-300">
            Resumed
          </p>
          <p className="mt-0.5 text-sm text-green-700 dark:text-green-400">
            {resumeExplanation}
          </p>
        </div>
      ) : null}
    </div>
  );
}
