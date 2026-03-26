import type { ReviewedSendExecutionRecord } from "@clawback/contracts";

import { Badge } from "@/components/ui/badge";
import { humanizeLabel } from "../_lib/presentation";

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

function outcomeBadge(outcome: ReviewedSendExecutionRecord) {
  switch (outcome.status) {
    case "sent":
      return { variant: "default" as const, className: "bg-green-600 hover:bg-green-600 text-white" };
    case "failed":
      return { variant: "destructive" as const, className: "" };
    case "executing":
      return { variant: "secondary" as const, className: "" };
    default:
      return { variant: "outline" as const, className: "" };
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

function failureTypeLabel(value: ReviewedSendExecutionRecord["error_classification"]) {
  if (value === "permanent") {
    return "Permanent";
  }
  if (value === "transient") {
    return "Transient";
  }
  return "Unknown";
}

function failureGuidance(value: ReviewedSendExecutionRecord["error_classification"]) {
  if (value === "permanent") {
    return "Fix the SMTP configuration or destination details before retrying.";
  }
  if (value === "transient") {
    return "Retry is safe after the transport issue clears.";
  }
  return "Check the transport details before retrying.";
}

export function ReviewedSendOutcomeCard({
  outcome,
}: {
  outcome: ReviewedSendExecutionRecord;
}) {
  const badge = outcomeBadge(outcome);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Reviewed send outcome
          </p>
          <p className="mt-1 text-sm text-foreground">
            Approval and SMTP execution stay linked here.
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
        <Detail label="Transport" value={outcome.connection_label} />
        <Detail label="Attempts" value={String(outcome.attempt_count)} />
        <Detail label="Last attempt" value={formatTimestamp(outcome.last_attempted_at)} />
        <Detail label="Review" value={outcome.review_id} />
        <Detail
          label="Provider message"
          value={outcome.provider_message_id ?? "No provider receipt recorded"}
        />
        {outcome.last_error ? (
          <Detail
            label="Failure type"
            value={failureTypeLabel(outcome.error_classification ?? null)}
          />
        ) : null}
        {outcome.sent_at ? (
          <Detail label="Sent at" value={formatTimestamp(outcome.sent_at)} />
        ) : null}
        {outcome.failed_at ? (
          <Detail label="Failed at" value={formatTimestamp(outcome.failed_at)} />
        ) : null}
      </div>

      {outcome.last_error ? (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-xs font-medium uppercase tracking-widest text-destructive">
            Last failure
          </p>
          <p className="mt-1 text-sm text-foreground">{outcome.last_error}</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {failureGuidance(outcome.error_classification ?? null)}
          </p>
        </div>
      ) : null}
    </div>
  );
}
