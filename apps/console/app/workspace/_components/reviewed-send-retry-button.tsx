"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ReviewedSendExecutionRecord } from "@clawback/contracts";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { retryWorkspaceSend } from "@/lib/control-plane";

type RetryReviewedSendButtonProps = {
  workItemId: string;
  outcome: ReviewedSendExecutionRecord;
  size?: "sm" | "default";
  variant?: "default" | "outline";
  showGuidance?: boolean;
};

function retryLabel(errorClassification: ReviewedSendExecutionRecord["error_classification"]) {
  if (errorClassification === "permanent") {
    return "Retry after fix";
  }

  return "Retry send";
}

function retryGuidance(errorClassification: ReviewedSendExecutionRecord["error_classification"]) {
  if (errorClassification === "permanent") {
    return "Clawback recorded a permanent delivery or configuration failure. Fix the destination or SMTP configuration, then retry.";
  }

  if (errorClassification === "transient") {
    return "Clawback recorded a transient transport failure. Retry is safe after the issue clears.";
  }

  return "Clawback recorded a delivery failure. Retry only after checking the SMTP relay and destination.";
}

export function ReviewedSendRetryButton({
  workItemId,
  outcome,
  size = "sm",
  variant = "outline",
  showGuidance = false,
}: RetryReviewedSendButtonProps) {
  const router = useRouter();
  const { session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleRetry() {
    setError(null);
    try {
      await retryWorkspaceSend(workItemId, {
        csrfToken: session?.csrf_token ?? null,
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to retry send");
    }
  }

  return (
    <div className="space-y-2">
      <Button
        variant={variant}
        size={size}
        disabled={isPending || !session?.csrf_token}
        onClick={() => void handleRetry()}
      >
        {isPending ? "Retrying..." : retryLabel(outcome.error_classification ?? null)}
      </Button>
      {showGuidance ? (
        <p className="text-xs text-muted-foreground">
          {retryGuidance(outcome.error_classification ?? null)}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
