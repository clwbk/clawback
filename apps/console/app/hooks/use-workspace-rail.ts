"use client";

import { useEffect, useState } from "react";

const WORKSPACE_RAIL_STORAGE_KEY = "clawback.workspace.rail.expanded";

export function useWorkspaceRail(defaultExpanded = true) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(WORKSPACE_RAIL_STORAGE_KEY);
      if (stored === "0") {
        setExpanded(false);
      } else if (stored === "1") {
        setExpanded(true);
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    try {
      window.localStorage.setItem(WORKSPACE_RAIL_STORAGE_KEY, expanded ? "1" : "0");
    } catch {
      // Ignore storage failures; the rail still works for the current session.
    }
  }, [expanded, hydrated]);

  return {
    railExpanded: expanded,
    setRailExpanded: setExpanded,
    toggleRail: () => setExpanded((current) => !current),
  };
}
