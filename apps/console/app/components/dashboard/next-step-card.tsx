"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface NextStepCardProps {
  id: string;
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}

export function NextStepCard({
  id,
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: NextStepCardProps) {
  const storageKey = `next-step-dismissed:${id}`;
  const [dismissed, setDismissed] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      setDismissed(localStorage.getItem(storageKey) === "true");
    } catch {
      // localStorage unavailable (SSR / privacy mode)
    }
  }, [storageKey]);

  function handleDismiss() {
    try {
      localStorage.setItem(storageKey, "true");
    } catch {
      // ignore
    }
    setDismissed(true);
  }

  // Avoid flash of content before localStorage is read
  if (!mounted || dismissed) return null;

  return (
    <div className="bg-card border rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl shrink-0">{icon}</span>
          <div>
            <p className="font-semibold text-foreground text-sm">{title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors text-xs shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
      <div>
        <Button size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      </div>
    </div>
  );
}
