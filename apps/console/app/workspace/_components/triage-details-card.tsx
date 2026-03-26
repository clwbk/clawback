import type { WorkerTriageRecord } from "@clawback/contracts";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { humanizeLabel } from "../_lib/presentation";

function decisionBadge(triage: WorkerTriageRecord) {
  switch (triage.decision) {
    case "shadow_draft":
      return {
        variant: "outline" as const,
        className:
          "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-300",
      };
    case "request_review":
      return {
        variant: "secondary" as const,
        className: "",
      };
    case "escalate":
      return {
        variant: "destructive" as const,
        className: "",
      };
    case "route_to_worker":
      return {
        variant: "outline" as const,
        className:
          "border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900 dark:bg-purple-950/30 dark:text-purple-300",
      };
    case "ignore":
      return {
        variant: "outline" as const,
        className: "border-muted-foreground/30 text-muted-foreground",
      };
    default:
      return {
        variant: "outline" as const,
        className: "",
      };
  }
}

function confidenceBadge(confidence: WorkerTriageRecord["confidence"]) {
  switch (confidence) {
    case "high":
      return { variant: "default" as const, className: "" };
    case "medium":
      return { variant: "secondary" as const, className: "" };
    case "low":
      return { variant: "outline" as const, className: "" };
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

/**
 * Extract a human-readable route explanation from triage reasons and decision.
 */
function routeExplanation(triage: WorkerTriageRecord): string | null {
  const parts: string[] = [];

  // Sender resolution context
  const resolutionReason = triage.reasons.find((r) => r.startsWith("resolved_via_"));
  if (resolutionReason) {
    const method = resolutionReason.replace("resolved_via_", "");
    parts.push(`Sender identified via ${humanizeLabel(method).toLowerCase()}.`);
  }

  // Relationship context
  if (triage.relationship !== "unknown") {
    parts.push(`Classified as ${humanizeLabel(triage.relationship).toLowerCase()}.`);
  }

  const recommendedWorker = triage.reasons.find((r) => r.endsWith("_worker_recommended"));
  if (recommendedWorker) {
    const kind = recommendedWorker.replace("_worker_recommended", "");
    parts.push(`Best fit appears to be the ${humanizeLabel(kind).toLowerCase()} worker.`);
  }

  // Decision explanation
  switch (triage.decision) {
    case "shadow_draft":
      parts.push(`Intent: ${humanizeLabel(triage.intent).toLowerCase()} -- drafted a response suggestion.`);
      break;
    case "request_review":
      parts.push(`Intent: ${humanizeLabel(triage.intent).toLowerCase()} -- flagged for human review.`);
      break;
    case "route_to_worker":
      parts.push(`Intent: ${humanizeLabel(triage.intent).toLowerCase()} -- suggested routing to another worker.`);
      break;
    case "escalate":
      parts.push(`Intent: ${humanizeLabel(triage.intent).toLowerCase()} -- escalated for urgent attention.`);
      break;
    case "ignore":
      parts.push(`Intent: ${humanizeLabel(triage.intent).toLowerCase()} -- ignored automatically.`);
      break;
  }

  // do_not_auto_reply flag
  if (triage.reasons.includes("do_not_auto_reply_flag_set")) {
    parts.push("Auto-reply blocked by contact policy.");
  }

  if (triage.reasons.includes("route_missing")) {
    parts.push("No active target worker could be safely resolved, so this stayed in review.");
  }

  if (triage.reasons.includes("route_ambiguous")) {
    parts.push("Multiple matching target workers were active, so this stayed in review.");
  }

  return parts.length > 0 ? parts.join(" ") : null;
}

export function TriageDetailsCard({
  triage,
  title = "Triage",
  workerNames,
}: {
  triage: WorkerTriageRecord;
  title?: string;
  /** Map of worker IDs to display names, used for route_to_worker targets. */
  workerNames?: Map<string, string>;
}) {
  const decision = decisionBadge(triage);
  const confidence = confidenceBadge(triage.confidence);
  const explanation = routeExplanation(triage);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Badge variant={decision.variant} className={decision.className}>
              {humanizeLabel(triage.decision)}
            </Badge>
            <Badge variant={confidence.variant} className={confidence.className}>
              {humanizeLabel(triage.confidence)} confidence
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Detail label="Relationship" value={humanizeLabel(triage.relationship)} />
          <Detail label="Intent" value={humanizeLabel(triage.intent)} />
          <Detail label="Source" value={humanizeLabel(triage.source_kind)} />
        </div>

        {triage.posture ? (
          <div>
            <p className="text-xs font-medium text-muted-foreground">Posture</p>
            <p className="text-sm text-foreground">{humanizeLabel(triage.posture)}</p>
          </div>
        ) : null}

        {triage.decision === "route_to_worker" && triage.route_target_worker_id ? (
          <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 dark:border-purple-900 dark:bg-purple-950/30">
            <p className="text-xs font-medium text-purple-800 dark:text-purple-300">
              Route suggestion
            </p>
            <p className="mt-0.5 text-sm text-purple-700 dark:text-purple-400">
              Suggested target:{" "}
              <span className="font-medium">
                {workerNames?.get(triage.route_target_worker_id)
                  ?? humanizeLabel(triage.route_target_worker_id)}
              </span>
            </p>
          </div>
        ) : null}

        {explanation ? (
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Route explanation</p>
            <p className="text-sm text-foreground">{explanation}</p>
          </div>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium text-muted-foreground">Reasons</p>
          <div className="flex flex-wrap gap-2">
            {triage.reasons.map((reason) => (
              <Badge key={reason} variant="outline">
                {humanizeLabel(reason)}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
