"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ControlPlaneRequestError,
  getSession,
  getSetupStatus,
  type AuthenticatedSession,
} from "@/lib/control-plane";

export function useSession(initialSession: AuthenticatedSession | null = null) {
  const router = useRouter();
  const [session, setSession] = useState<AuthenticatedSession | null>(initialSession);
  const [loading, setLoading] = useState(initialSession === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let canceled = false;

    void (async () => {
      try {
        const active = await getSession();
        if (!canceled) {
          setSession(active);
          setError(null);
        }
      } catch (err) {
        if (canceled) return;

        if (err instanceof ControlPlaneRequestError && err.statusCode === 401) {
          try {
            const status = await getSetupStatus();
            router.replace(status.bootstrapped ? "/login" : "/setup");
          } catch {
            setError("Failed to load session.");
          }
        } else {
          setError(err instanceof Error ? err.message : "Failed to load workspace.");
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [router]);

  return { session, loading, error };
}
