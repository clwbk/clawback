"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { confirmWorkspaceRouteSuggestion } from "@/lib/control-plane";

type RouteActionsProps = {
  inboxItemId: string;
  state: "open" | "resolved" | "dismissed";
  assigneeIds: string[];
};

export function RouteActions({ inboxItemId, state, assigneeIds }: RouteActionsProps) {
  const router = useRouter();
  const { session } = useSession();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(state === "resolved");
  const canConfirm = Boolean(
    session
      && (
        session.membership.role === "admin"
        || assigneeIds.includes(session.user.id)
      ),
  );

  if (confirmed || state === "resolved") {
    return <Badge variant="secondary">Route confirmed</Badge>;
  }

  if (state !== "open") {
    return <Badge variant="outline">Route unavailable</Badge>;
  }

  if (!canConfirm) {
    return (
      <p className="text-xs text-muted-foreground">
        Route confirmation is limited to the assigned operator or a workspace
        admin.
      </p>
    );
  }

  async function handleConfirm() {
    setError(null);
    try {
      const result = await confirmWorkspaceRouteSuggestion(inboxItemId, {
        csrfToken: session?.csrf_token ?? null,
      });
      setConfirmed(true);
      startTransition(() => {
        router.refresh();
      });
      if (result.already_confirmed) {
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm route");
    }
  }

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        disabled={isPending || !session?.csrf_token}
        onClick={() => void handleConfirm()}
      >
        {isPending ? "Confirming..." : "Confirm route"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
