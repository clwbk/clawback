"use client";

import { useEffect, useMemo, useState } from "react";
import {
  listWorkspaceActionCapabilities,
  listWorkspaceConnections,
  listWorkspaceInbox,
  listWorkspaceInputRoutes,
  listWorkspaceWorkers,
  listWorkspaceWork,
} from "@/lib/control-plane";
import { buildPilotSetupSteps, type PilotSetupStep } from "@/workspace/_lib/setup-progress";
import {
  emptyConnectorSyncState,
  loadConnectorSyncState,
} from "@/workspace/_lib/knowledge-path";

export function useSetupProgress(role: "admin" | "user" | null | undefined) {
  const [steps, setSteps] = useState<PilotSetupStep[] | null>(null);

  useEffect(() => {
    if (role !== "admin") {
      setSteps(null);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const [
          workerResult,
          connectionResult,
          routeResult,
          actionResult,
          inboxResult,
          workResult,
          connectorState,
        ] = await Promise.all([
          listWorkspaceWorkers(),
          listWorkspaceConnections(),
          listWorkspaceInputRoutes(),
          listWorkspaceActionCapabilities(),
          listWorkspaceInbox(),
          listWorkspaceWork(),
          loadConnectorSyncState().catch(() => emptyConnectorSyncState),
        ]);

        if (!cancelled) {
          setSteps(
            buildPilotSetupSteps({
              workers: workerResult.workers,
              connections: connectionResult.connections,
              inputRoutes: routeResult.input_routes,
              actionCapabilities: actionResult.action_capabilities,
              inboxItems: inboxResult.items,
              workItems: workResult.work_items,
              connectors: connectorState.connectors,
              syncJobsByConnector: connectorState.syncJobsByConnector,
            }),
          );
        }
      } catch {
        if (!cancelled) {
          setSteps(null);
        }
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, 30_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [role]);

  const incompleteCount = useMemo(
    () => (steps ? steps.filter((s) => !s.complete).length : 0),
    [steps],
  );

  const completeCount = useMemo(
    () => (steps ? steps.filter((s) => s.complete).length : 0),
    [steps],
  );

  const totalCount = steps?.length ?? 0;

  return { steps, incompleteCount, completeCount, totalCount };
}
