"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RunRecord, RunEventRecord } from "@/lib/control-plane";

interface RunMetadataProps {
  run: RunRecord;
  events: RunEventRecord[];
}

function computeLatencyMs(run: RunRecord): number | null {
  if (!run.started_at || !run.completed_at) return null;
  return new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
}

function getTokenCount(events: RunEventRecord[]): number | null {
  const completed = events.find((e) => e.event_type === "run.completed");
  if (!completed) return null;
  const usage = completed.payload as { token_usage?: { total_tokens?: number } };
  return usage?.token_usage?.total_tokens ?? null;
}

function getApprovalState(events: RunEventRecord[]): {
  label: string;
  approvalId: string | null;
  className: string;
} | null {
  const resolved = [...events]
    .reverse()
    .find((event) => event.event_type === "run.approval.resolved");

  if (resolved) {
    const decision =
      typeof resolved.payload.decision === "string" ? resolved.payload.decision : "resolved";
    const approvalId =
      typeof resolved.payload.approval_request_id === "string"
        ? resolved.payload.approval_request_id
        : null;
    return {
      label: `Review ${decision}`,
      approvalId,
      className:
        decision === "approved"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : decision === "denied" || decision === "expired"
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-zinc-200 bg-zinc-100 text-zinc-700",
    };
  }

  const waiting = [...events]
    .reverse()
    .find((event) => event.event_type === "run.waiting_for_approval");

  if (!waiting) {
    return null;
  }

  return {
    label: "Review pending",
    approvalId:
      typeof waiting.payload.approval_request_id === "string"
        ? waiting.payload.approval_request_id
        : null,
    className: "border-amber-200 bg-amber-50 text-amber-800",
  };
}

export function RunMetadata({ run, events }: RunMetadataProps) {
  const latencyMs = computeLatencyMs(run);
  const tokenCount = getTokenCount(events);
  const approvalState = getApprovalState(events);

  return (
    <div className="ml-1 mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      <span>
        Run:{" "}
        <code className="font-mono text-[10px] text-foreground/70">{run.id.slice(0, 8)}…</code>
      </span>

      {approvalState ? (
        <Badge variant="outline" className={approvalState.className}>
          {approvalState.label}
        </Badge>
      ) : null}

      {latencyMs !== null && (
        <span>{(latencyMs / 1000).toFixed(2)}s</span>
      )}

      {tokenCount !== null && (
        <span>{tokenCount.toLocaleString()} tokens</span>
      )}

      <Link
        href={`/workspace/runs/${run.id}`}
        className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
      >
        View trace
        <ExternalLink className="h-2.5 w-2.5" />
      </Link>

      {approvalState?.approvalId ? (
        <Link
          href="/workspace/inbox"
          className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline"
        >
          Open review
          <ExternalLink className="h-2.5 w-2.5" />
        </Link>
      ) : null}
    </div>
  );
}
