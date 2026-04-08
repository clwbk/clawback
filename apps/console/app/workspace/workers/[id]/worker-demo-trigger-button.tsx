"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  ControlPlaneRequestError,
  runWorkerDemoForwardEmail,
} from "@/lib/control-plane";
import { useSession } from "@/hooks/use-session";

type WorkerDemoTriggerButtonProps = {
  workerId: string;
  label: string;
  usingFixtureFallback?: boolean;
};

export function WorkerDemoTriggerButton({
  workerId,
  label,
  usingFixtureFallback = false,
}: WorkerDemoTriggerButtonProps) {
  const router = useRouter();
  const { session, loading } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const isAdmin = session?.membership.role === "admin";

  const disabled =
    usingFixtureFallback ||
    loading ||
    !session?.csrf_token ||
    !isAdmin ||
    isPending;

  async function handleRun() {
    if (disabled || !session?.csrf_token) {
      return;
    }

    setError(null);

    try {
      const result = await runWorkerDemoForwardEmail({
        workerId,
        csrfToken: session.csrf_token,
      });

      const destination = result.inbox_item_id
        ? `/workspace/inbox?item=${result.inbox_item_id}`
        : result.work_item_id
          ? `/workspace/work/${result.work_item_id}`
          : "/workspace/activity";

      startTransition(() => {
        router.push(destination);
        router.refresh();
      });
    } catch (err) {
      if (err instanceof ControlPlaneRequestError) {
        setError(err.message);
        return;
      }
      setError(
        err instanceof Error
          ? err.message
          : "Failed to run the sample scenario.",
      );
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={() => void handleRun()} disabled={disabled}>
        {isPending ? "Running..." : label}
      </Button>
      {error ? (
        <p className="max-w-52 text-right text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
