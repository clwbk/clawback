"use client";

import { useEffect } from "react";

type WorkerFocusSectionProps = {
  focus: string | null;
};

const sectionIdMap: Record<string, string> = {
  connections: "connections-section",
  routes: "routes-section",
  actions: "actions-section",
};

export function WorkerFocusSection({ focus }: WorkerFocusSectionProps) {
  useEffect(() => {
    if (!focus) return;

    const sectionId = sectionIdMap[focus];
    if (!sectionId) return;

    const timeout = setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (!element) return;

      element.scrollIntoView({ behavior: "smooth", block: "start" });

      element.classList.add("ring-2", "ring-primary/40", "rounded-lg");
      const removeTimeout = setTimeout(() => {
        element.classList.remove("ring-2", "ring-primary/40", "rounded-lg");
      }, 2500);

      return () => clearTimeout(removeTimeout);
    }, 150);

    return () => clearTimeout(timeout);
  }, [focus]);

  return null;
}
