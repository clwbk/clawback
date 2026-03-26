"use client";

import Link from "next/link";
import { ExternalLink, FileStack, ShieldCheck, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { GovernedActionSummary } from "@/lib/run-governed-action";

interface GovernedActionCardProps {
  runId: string;
  summary: GovernedActionSummary;
  isAdmin?: boolean;
}

function startCase(value: string) {
  return value
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function statePresentation(state: GovernedActionSummary["approvalState"]) {
  switch (state) {
    case "approved":
      return {
        label: "Approved",
        className: "border-emerald-200 bg-emerald-50 text-emerald-700",
        icon: ShieldCheck,
      };
    case "denied":
    case "expired":
    case "canceled":
      return {
        label: startCase(state),
        className: "border-red-200 bg-red-50 text-red-700",
        icon: ShieldX,
      };
    default:
      return {
        label: "Pending review",
        className: "border-amber-200 bg-amber-50 text-amber-800",
        icon: ShieldCheck,
      };
  }
}

export function GovernedActionCard({ runId, summary, isAdmin = false }: GovernedActionCardProps) {
  const state = statePresentation(summary.approvalState);
  const StateIcon = state.icon;
  const actionLabel = startCase(summary.actionType);

  return (
    <div className="ml-1 mt-3 max-w-xl rounded-lg border border-border/70 bg-card/70 p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Governed action
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">{actionLabel}</p>
            <Badge variant="outline" className={state.className}>
              <StateIcon className="mr-1 h-3 w-3" />
              {state.label}
            </Badge>
          </div>
          {summary.actionTitle ? (
            <p className="text-sm text-muted-foreground">{summary.actionTitle}</p>
          ) : null}
        </div>
        <div className="rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
          {summary.retrievalResultCount !== null
            ? `${summary.retrievalResultCount} source${summary.retrievalResultCount === 1 ? "" : "s"}`
            : "No source count"}
        </div>
      </div>

      {(summary.resultReference || summary.resultInternalId || summary.approvalRationale) && (
        <div className="mt-3 space-y-1 rounded-md border border-border/60 bg-background/70 p-3 text-xs text-muted-foreground">
          {summary.resultReference ? (
            <div className="flex items-start gap-2">
              <FileStack className="mt-0.5 h-3.5 w-3.5 text-foreground/70" />
              <p>
                Result reference: <span className="font-medium text-foreground">{summary.resultReference}</span>
              </p>
            </div>
          ) : null}
          {summary.resultInternalId ? (
            <p>
              Internal id: <code className="font-mono text-foreground/80">{summary.resultInternalId}</code>
            </p>
          ) : null}
          {summary.approvalRationale ? (
            <p>
              Decision note: <span className="text-foreground">{summary.approvalRationale}</span>
            </p>
          ) : null}
        </div>
      )}

      <div className={cn("mt-3 flex flex-wrap gap-2", !isAdmin && "hidden")}>
        <Button asChild size="sm" variant="outline">
          <Link href={`/workspace/runs/${runId}`}>
            View trace
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </Button>
        {summary.approvalId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/workspace/inbox?review=${summary.approvalId}`}>
              Open review
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
        {summary.resultInternalId ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/workspace/work/${summary.resultInternalId}`}>
              Open artifact
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
