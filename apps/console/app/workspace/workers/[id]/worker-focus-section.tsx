"use client";

import { useEffect } from "react";

type WorkerFocusSectionProps = {
  focus: string | null;
};

const sectionIdMap: Record<string, string> = {
  people: "people-section",
  connections: "connections-section",
  routes: "routes-section",
  actions: "actions-section",
};

function resolveFocusElement(focus: string): HTMLElement | null {
  const sectionId = sectionIdMap[focus];
  if (sectionId) {
    return document.getElementById(sectionId);
  }

  if (focus === "proof") {
    const candidates = Array.from(
      document.querySelectorAll<HTMLElement>('[data-worker-focus="proof"]'),
    );
    return candidates.find((element) => element.offsetParent !== null) ?? candidates[0] ?? null;
  }

  return null;
}

export function WorkerFocusSection({ focus }: WorkerFocusSectionProps) {
  useEffect(() => {
    if (!focus) return;

    const timeout = setTimeout(() => {
      const element = resolveFocusElement(focus);
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
