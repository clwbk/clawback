import type {
  ReviewedExternalWorkflowCallbackResult,
  ReviewedExternalWorkflowExecutionRecord,
  WorkItemExecutionOutcome,
} from "@clawback/contracts";

import { Badge } from "@/components/ui/badge";
import { humanizeLabel } from "../_lib/presentation";
import { ReviewedSendOutcomeCard } from "./reviewed-send-outcome-card";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function workflowBadge(outcome: ReviewedExternalWorkflowExecutionRecord) {
  switch (outcome.status) {
    case "succeeded":
      return { variant: "default" as const, className: "bg-green-600 hover:bg-green-600 text-white" };
    case "failed":
      return { variant: "destructive" as const, className: "" };
    case "executing":
      return { variant: "secondary" as const, className: "" };
    default:
      return { variant: "outline" as const, className: "" };
  }
}

function callbackBadge(callback: ReviewedExternalWorkflowCallbackResult) {
  return callback.status === "failed"
    ? { variant: "destructive" as const, className: "" }
    : { variant: "default" as const, className: "bg-green-600 hover:bg-green-600 text-white" };
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  );
}

function ExternalWorkflowOutcomeCard({
  outcome,
}: {
  outcome: ReviewedExternalWorkflowExecutionRecord;
}) {
  const badge = workflowBadge(outcome);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            External workflow handoff
          </p>
          <p className="mt-1 text-sm text-foreground">
            Clawback approved the action and handed the deterministic segment to n8n.
          </p>
        </div>
        <Badge variant={badge.variant} className={badge.className}>
          {humanizeLabel(outcome.status)}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Detail
          label="Approved via"
          value={outcome.approved_via ? humanizeLabel(outcome.approved_via) : "Unavailable"}
        />
        <Detail label="Backend" value={outcome.connection_label} />
        <Detail label="Workflow" value={outcome.workflow_identifier} />
        <Detail label="Attempts" value={String(outcome.attempt_count)} />
        <Detail label="Last attempt" value={formatTimestamp(outcome.last_attempted_at)} />
        <Detail label="Review" value={outcome.review_id} />
        <Detail
          label="Response code"
          value={outcome.response_status_code !== null ? String(outcome.response_status_code) : "Pending"}
        />
        <Detail
          label="Backend reference"
          value={outcome.backend_reference ?? "Unavailable"}
        />
        {outcome.completed_at ? (
          <Detail label="Completed at" value={formatTimestamp(outcome.completed_at)} />
        ) : null}
        {outcome.failed_at ? (
          <Detail label="Failed at" value={formatTimestamp(outcome.failed_at)} />
        ) : null}
      </div>

      {outcome.response_summary ? (
        <div className="mt-4 rounded-md border border-border/60 bg-background/70 p-3">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Handoff summary
          </p>
          <p className="mt-1 text-sm text-foreground">{outcome.response_summary}</p>
        </div>
      ) : null}

      {outcome.callback_result ? (
        <div className="mt-4 rounded-md border border-border/60 bg-background/70 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Recorded callback
              </p>
              <p className="mt-1 text-sm text-foreground">
                Clawback normalized the inbound n8n result before recording it on this handoff.
              </p>
            </div>
            <Badge
              variant={callbackBadge(outcome.callback_result).variant}
              className={callbackBadge(outcome.callback_result).className}
            >
              {humanizeLabel(outcome.callback_result.status)}
            </Badge>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Detail label="Delivery" value={outcome.callback_result.delivery_id} />
            <Detail label="Received at" value={formatTimestamp(outcome.callback_result.received_at)} />
            <Detail
              label="Occurred at"
              value={formatTimestamp(outcome.callback_result.occurred_at)}
            />
            <Detail
              label="Response code"
              value={
                outcome.callback_result.response_status_code !== null
                  ? String(outcome.callback_result.response_status_code)
                  : "Unavailable"
              }
            />
            <Detail
              label="Backend reference"
              value={outcome.callback_result.backend_reference ?? "Unavailable"}
            />
          </div>

          {outcome.callback_result.summary ? (
            <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Callback summary
              </p>
              <p className="mt-1 text-sm text-foreground">{outcome.callback_result.summary}</p>
            </div>
          ) : null}
        </div>
      ) : null}

      {outcome.last_error ? (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-xs font-medium uppercase tracking-widest text-destructive">
            Last failure
          </p>
          <p className="mt-1 text-sm text-foreground">{outcome.last_error}</p>
        </div>
      ) : null}
    </div>
  );
}

export function ExecutionOutcomeCard({
  outcome,
}: {
  outcome: WorkItemExecutionOutcome;
}) {
  if (outcome.kind === "reviewed_external_workflow") {
    return <ExternalWorkflowOutcomeCard outcome={outcome} />;
  }

  return <ReviewedSendOutcomeCard outcome={outcome} />;
}
