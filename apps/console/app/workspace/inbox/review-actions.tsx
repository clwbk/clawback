"use client";

import type { ReviewedSendExecutionRecord } from "@clawback/contracts";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { resolveReview } from "@/lib/control-plane";
import { ReviewedSendRetryButton } from "../_components/reviewed-send-retry-button";

type ReviewActionsProps = {
  reviewId: string;
  reviewStatus: string;
  workItemId?: string | null;
  executionStatus?: string | null;
  executionOutcome?: ReviewedSendExecutionRecord | null;
};

export function ReviewActions({
  reviewId,
  reviewStatus,
  workItemId,
  executionStatus,
  executionOutcome,
}: ReviewActionsProps) {
  const router = useRouter();
  const { session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolvedStatus, setResolvedStatus] = useState<string | null>(null);

  // If the review was already resolved (from server data or after client action)
  const effectiveStatus = resolvedStatus ?? reviewStatus;
  if (effectiveStatus !== "pending") {
    // Determine the primary badge based on execution truth, not just review status
    const primaryBadge = (() => {
      if (executionStatus === "failed") {
        return { label: "Failed", variant: "destructive" as const };
      }
      if (executionStatus === "completed") {
        return { label: "Sent", variant: "default" as const };
      }
      if (executionStatus === "queued" || executionStatus === "executing") {
        return { label: "Sending...", variant: "secondary" as const };
      }
      if (effectiveStatus === "denied") {
        return { label: "Denied", variant: "destructive" as const };
      }
      if (effectiveStatus === "approved" || effectiveStatus === "completed") {
        return { label: "Approved", variant: "secondary" as const };
      }
      return { label: "Resolved", variant: "secondary" as const };
    })();

    return (
      <div className="flex items-center gap-2">
        <Badge variant={primaryBadge.variant}>
          {primaryBadge.label}
        </Badge>
        {executionStatus === "failed" && workItemId && executionOutcome ? (
          <ReviewedSendRetryButton
            workItemId={workItemId}
            outcome={executionOutcome}
            size="sm"
            variant="outline"
          />
        ) : null}
      </div>
    );
  }

  async function handleResolve(decision: "approved" | "denied") {
    setError(null);
    try {
      const result = await resolveReview(reviewId, {
        decision,
        csrfToken: session?.csrf_token ?? null,
      });
      setResolvedStatus(result.status);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve review");
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending || !session?.csrf_token}
          onClick={() => handleResolve("approved")}
        >
          {isPending ? "Processing..." : "Approve"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || !session?.csrf_token}
          onClick={() => handleResolve("denied")}
        >
          {isPending ? "Processing..." : "Deny"}
        </Button>
      </div>
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
