"use client";

import { useEffect } from "react";

type FocusSectionProps = {
  focus: string | null;
};

/**
 * Known focus → section-id mappings.
 * If no explicit mapping exists, the focus value is used as `${focus}-section`.
 */
const sectionIdMap: Record<string, string> = {
  gmail: "gmail-section",
  smtp: "smtp_relay-section",
};

export function FocusSection({ focus }: FocusSectionProps) {
  useEffect(() => {
    if (!focus) return;

    // Try explicit mapping first, fall back to ${focus}-section
    const sectionId = sectionIdMap[focus] ?? `${focus}-section`;

    // Wait for the page to render, then scroll and highlight
    const timeout = setTimeout(() => {
      const element = document.getElementById(sectionId);
      if (!element) return;

      element.scrollIntoView({ behavior: "smooth", block: "start" });

      // Add a brief highlight ring
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
