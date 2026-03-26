"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ExternalLink, ShieldCheck, ShieldX } from "lucide-react";

import {
  ControlPlaneRequestError,
  resolveApproval,
  type ApprovalDecisionRecord,
  type ApprovalDetail,
  type ApprovalRecord,
} from "@/lib/control-plane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

function statusBadgeClass(status: ApprovalRecord["status"] | ApprovalDecisionRecord["decision"]) {
  switch (status) {
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "denied":
      return "border-red-200 bg-red-50 text-red-700";
    case "expired":
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
    case "canceled":
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
  }
}

function formatAbsoluteTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDecision(decision: ApprovalDecisionRecord["decision"]) {
  switch (decision) {
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    case "canceled":
      return "Canceled";
    default:
      return decision;
  }
}

function ReviewPayloadView({ approval }: { approval: ApprovalRecord }) {
  const payload = approval.request_payload;
  const title = typeof payload.title === "string" ? payload.title : null;
  const summary = typeof payload.summary === "string" ? payload.summary : null;
  const body =
    payload.body && typeof payload.body === "object" && !Array.isArray(payload.body)
      ? (payload.body as Record<string, unknown>)
      : null;
  const likelyCause = typeof body?.likely_cause === "string" ? body.likely_cause : null;
  const impact = typeof body?.impact === "string" ? body.impact : null;
  const owner = typeof body?.owner === "string" ? body.owner : null;
  const recommendedActions = Array.isArray(body?.recommended_actions)
    ? body.recommended_actions.filter((value): value is string => typeof value === "string")
    : [];

  return (
    <div className="space-y-4">
      {title ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Title
          </p>
          <p className="text-sm text-foreground">{title}</p>
        </div>
      ) : null}
      {summary ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Summary
          </p>
          <p className="text-sm text-foreground">{summary}</p>
        </div>
      ) : null}
      {likelyCause ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Likely Cause
          </p>
          <p className="text-sm text-foreground">{likelyCause}</p>
        </div>
      ) : null}
      {impact ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Impact
          </p>
          <p className="text-sm text-foreground">{impact}</p>
        </div>
      ) : null}
      {recommendedActions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Recommended Actions
          </p>
          <ul className="space-y-1 text-sm text-foreground">
            {recommendedActions.map((action, index) => (
              <li key={`${action}-${index}`} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{action}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {owner ? (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Suggested Owner
          </p>
          <p className="text-sm text-foreground">{owner}</p>
        </div>
      ) : null}
      <details className="rounded-md border border-border/70 bg-muted/20 p-3">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-widest text-muted-foreground">
          Raw payload
        </summary>
        <pre className="mt-3 overflow-x-auto text-xs text-muted-foreground">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </details>
    </div>
  );
}

type ReviewSheetProps = {
  open: boolean;
  detail: ApprovalDetail | null;
  loading: boolean;
  csrfToken: string | null;
  onOpenChange: (open: boolean) => void;
  onResolved: () => Promise<void>;
};

export function ReviewSheet({
  open,
  detail,
  loading,
  csrfToken,
  onOpenChange,
  onResolved,
}: ReviewSheetProps) {
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState<"approved" | "denied" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setRationale("");
    setActionError(null);
    setSubmitting(null);
  }, [detail?.approval.id, open]);

  async function handleResolve(decision: "approved" | "denied") {
    if (!detail?.approval.id || !csrfToken || submitting) {
      return;
    }

    setSubmitting(decision);
    setActionError(null);

    try {
      await resolveApproval({
        approvalId: detail.approval.id,
        decision,
        rationale: rationale.trim() || null,
        csrfToken,
      });
      await onResolved();
    } catch (error) {
      if (error instanceof ControlPlaneRequestError) {
        setActionError(error.message);
      } else {
        setActionError("Failed to resolve review.");
      }
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
            <div>
              <DialogTitle>Review action</DialogTitle>
              <DialogDescription>
                Review the proposed action before the run continues.
              </DialogDescription>
            </div>
            {detail ? (
              <Badge variant="outline" className={statusBadgeClass(detail.approval.status)}>
                {detail.approval.status.replaceAll("_", " ")}
              </Badge>
            ) : null}
          </div>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !detail ? (
          <p className="text-sm text-muted-foreground">
            Select a review from the queue to inspect the proposed action.
          </p>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Tool
                </p>
                <p className="text-sm text-foreground">{detail.approval.tool_name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Action
                </p>
                <p className="text-sm text-foreground">{detail.approval.action_type}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Requested
                </p>
                <p className="text-sm text-foreground">
                  {formatAbsoluteTime(detail.approval.created_at)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  Risk class
                </p>
                <p className="text-sm text-foreground">{detail.approval.risk_class}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 text-sm">
              <Link
                href={`/workspace/runs/${detail.approval.run_id}`}
                className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
              >
                View run trace
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>

            <Separator />

            <ReviewPayloadView approval={detail.approval} />

            <Separator />

            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="review-rationale">Review note</Label>
                <p className="text-xs text-muted-foreground">
                  Optional note attached to the decision.
                </p>
              </div>
              <Textarea
                id="review-rationale"
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                placeholder="Why approve or deny this action?"
                disabled={detail.approval.status !== "pending" || submitting !== null}
              />
              {actionError ? <p className="text-sm text-destructive">{actionError}</p> : null}
              {detail.approval.status === "pending" ? (
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="button"
                    onClick={() => void handleResolve("approved")}
                    disabled={submitting !== null || !csrfToken}
                  >
                    <ShieldCheck />
                    {submitting === "approved" ? "Approving..." : "Approve request"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleResolve("denied")}
                    disabled={submitting !== null || !csrfToken}
                  >
                    <ShieldX />
                    {submitting === "denied" ? "Denying..." : "Deny request"}
                  </Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This request is already resolved. The decision history stays attached here for
                  context.
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                Decision history
              </p>
              {detail.decisions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No decision recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {detail.decisions.map((decision) => (
                    <div key={decision.id} className="rounded-md border border-border/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge variant="outline" className={statusBadgeClass(decision.decision)}>
                          {formatDecision(decision.decision)}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatAbsoluteTime(decision.occurred_at)}
                        </span>
                      </div>
                      {decision.rationale ? (
                        <p className="mt-2 text-sm text-foreground">{decision.rationale}</p>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
