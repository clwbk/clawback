"use client";

import { useState, useEffect, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

const STORAGE_KEY = "connections-reference-collapsed";

export function CollapsibleReferenceSection({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) {
      setCollapsed(stored === "true");
    }
    setMounted(true);
  }, []);

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(STORAGE_KEY, String(next));
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center gap-2 rounded-md px-1 py-2 text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 transition-transform ${mounted && !collapsed ? "rotate-90" : ""}`}
        />
        Reference: Routes, systems &amp; trust posture
      </button>
      {mounted && !collapsed ? (
        <div className="mt-2 space-y-6">{children}</div>
      ) : null}
    </div>
  );
}
