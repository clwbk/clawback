"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

export function SyncConnectorButton({ connectorId }: { connectorId: string }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = session?.membership.role === "admin";

  if (loading || !isAdmin) {
    return null;
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);

    try {
      const res = await fetch(`/api/connectors/${connectorId}/sync`, {
        method: "POST",
        headers: {
          "x-csrf-token": session!.csrf_token,
        },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Sync request failed (${res.status})`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? "Syncing..." : "Sync now"}
      </Button>
      {error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </div>
  );
}
