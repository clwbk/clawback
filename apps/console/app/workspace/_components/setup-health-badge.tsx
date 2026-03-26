"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HelpTooltip } from "@/components/shared/help-tooltip";
import {
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInputRoutes,
  listWorkspaceWorkers,
} from "@/lib/control-plane";
import { buildPilotSetupSteps, type PilotSetupStep } from "../_lib/setup-progress";
import {
  emptyConnectorSyncState,
  loadConnectorSyncState,
} from "../_lib/knowledge-path";

type SetupHealthBadgeProps = {
  userId: string;
};

export function SetupHealthBadge({ userId }: SetupHealthBadgeProps) {
  const router = useRouter();
  const [steps, setSteps] = useState<PilotSetupStep[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [workerResult, connectionResult, routeResult, actionResult, connectorState] = await Promise.all([
          listWorkspaceWorkers(),
          listWorkspaceConnections(),
          listWorkspaceInputRoutes(),
          listWorkspaceActionCapabilities(),
          loadConnectorSyncState().catch(() => emptyConnectorSyncState),
        ]);

        if (cancelled) {
          return;
        }

        setSteps(buildPilotSetupSteps({
          workers: workerResult.workers,
          connections: connectionResult.connections,
          inputRoutes: routeResult.input_routes,
          actionCapabilities: actionResult.action_capabilities,
          connectors: connectorState.connectors,
          syncJobsByConnector: connectorState.syncJobsByConnector,
        }));
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load setup health.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const completeCount = useMemo(
    () => steps?.filter((step) => step.complete).length ?? 0,
    [steps],
  );
  const nextStep = useMemo(
    () => steps?.find((step) => !step.complete) ?? null,
    [steps],
  );
  const ready = steps !== null && completeCount === steps.length;

  function handleOpenGuide() {
    router.push("/workspace/setup");
  }

  if (loading) {
    return (
      <Badge variant="outline" className="text-xs">
        Checking setup health...
      </Badge>
    );
  }

  if (error || !steps) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="text-xs">
          Setup health unavailable
        </Badge>
        <Button variant="ghost" size="sm" onClick={() => router.push("/workspace/setup")}>
          Open setup
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant={ready ? "default" : "secondary"} className="text-xs">
        {ready ? "Setup ready" : `Setup ${completeCount}/${steps.length}`}
      </Badge>
      <span className="text-xs text-muted-foreground">
        {ready ? "All setup steps are complete." : `Next: ${nextStep?.title}`}
      </span>
      <HelpTooltip
        content={
          <div className="space-y-2">
            <p className="font-medium">Setup progress</p>
            <ul className="space-y-1">
              {steps.map((step) => (
                <li key={step.id}>
                  {step.complete ? "Done" : "Open"}: {step.title}
                </li>
              ))}
            </ul>
          </div>
        }
      />
      <Button variant="ghost" size="sm" onClick={handleOpenGuide}>
        Open setup
      </Button>
    </div>
  );
}
