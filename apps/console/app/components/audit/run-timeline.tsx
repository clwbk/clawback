"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { extractGovernedActionSummary } from "@/lib/run-governed-action";
import { RunEventCard } from "./run-event-card";
import type { RunRecord, RunEventRecord } from "@/lib/control-plane";

function statusBadgeClass(status: RunRecord["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "running":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "waiting_for_approval":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "queued":
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
    case "canceled":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-600";
  }
}

function formatDuration(startedAt: string | null, completedAt: string | null): string | null {
  if (!startedAt || !completedAt) return null;
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function formatAbsoluteTime(ts: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ts));
}

interface RunTimelineProps {
  run: RunRecord;
  events: RunEventRecord[];
}

export function RunTimeline({ run, events }: RunTimelineProps) {
  const router = useRouter();
  const duration = formatDuration(run.started_at, run.completed_at);
  const baseAt = run.created_at;
  const governedAction = extractGovernedActionSummary(events);

  // Count total tokens from completed event payload if available
  const completedEvent = events.find((e) => e.event_type === "run.completed");
  const totalTokens =
    completedEvent && typeof completedEvent.payload.total_tokens === "number"
      ? completedEvent.payload.total_tokens
      : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Button
        variant="ghost"
        size="sm"
        className="mb-6 gap-1.5 text-muted-foreground hover:text-foreground"
        onClick={() => router.back()}
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      <Card className="mb-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Run</p>
            <p className="mt-1 font-mono text-sm font-medium text-foreground break-all">{run.id}</p>
          </div>
          <Badge className={statusBadgeClass(run.status)} variant="outline">
            {run.status}
          </Badge>
        </div>

        <Separator className="my-4" />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Agent version</dt>
            <dd className="mt-0.5 font-mono text-xs text-foreground truncate" title={run.agent_version_id}>
              {run.agent_version_id.slice(0, 8)}&hellip;
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Initiated by</dt>
            <dd className="mt-0.5 font-mono text-xs text-foreground truncate" title={run.initiated_by}>
              {run.initiated_by.slice(0, 8)}&hellip;
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Started</dt>
            <dd className="mt-0.5 text-xs text-foreground">
              {run.started_at ? formatAbsoluteTime(run.started_at) : "—"}
            </dd>
          </div>
          {duration && (
            <div>
              <dt className="text-xs text-muted-foreground">Duration</dt>
              <dd className="mt-0.5 text-xs text-foreground">{duration}</dd>
            </div>
          )}
          {totalTokens !== null && (
            <div>
              <dt className="text-xs text-muted-foreground">Total tokens</dt>
              <dd className="mt-0.5 text-xs text-foreground">{totalTokens.toLocaleString()}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Channel</dt>
            <dd className="mt-0.5 text-xs text-foreground">{run.channel}</dd>
          </div>
        </dl>
      </Card>

      {governedAction ? (
        <Card className="mb-6 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Governed Action
              </p>
              <h2 className="mt-1 text-lg font-semibold text-foreground">
                {governedAction.actionTitle ?? governedAction.actionType.replaceAll("_", " ")}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Review-gated action requested during this run.
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                governedAction.approvalState === "approved"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : governedAction.approvalState === "pending"
                    ? "border-amber-200 bg-amber-50 text-amber-800"
                    : "border-red-200 bg-red-50 text-red-700"
              }
            >
              {governedAction.approvalState.replaceAll("_", " ")}
            </Badge>
          </div>

          <Separator className="my-4" />

          <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Action type</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {governedAction.actionType.replaceAll("_", " ")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Review request</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {governedAction.approvalId ? (
                  <Link
                    href={`/workspace/inbox?review=${governedAction.approvalId}`}
                    className="font-mono text-primary underline-offset-2 hover:underline"
                  >
                    {governedAction.approvalId}
                  </Link>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Result reference</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {governedAction.resultReference ?? "Awaiting completion"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Retrieved sources</dt>
              <dd className="mt-0.5 text-sm text-foreground">
                {typeof governedAction.retrievalResultCount === "number"
                  ? governedAction.retrievalResultCount
                  : "—"}
              </dd>
            </div>
          </dl>

          {governedAction.resultInternalId || governedAction.approvalRationale ? (
            <>
              <Separator className="my-4" />
              <div className="space-y-2 text-sm">
                {governedAction.resultInternalId ? (
                  <p className="text-muted-foreground">
                    Artifact:{" "}
                    <Link
                      href={`/workspace/work/${governedAction.resultInternalId}`}
                      className="font-mono text-primary underline-offset-2 hover:underline"
                    >
                      {governedAction.resultInternalId}
                    </Link>
                  </p>
                ) : null}
                {governedAction.approvalRationale ? (
                  <p className="text-muted-foreground">
                    Review note:{" "}
                    <span className="text-foreground">{governedAction.approvalRationale}</span>
                  </p>
                ) : null}
              </div>
            </>
          ) : null}
        </Card>
      ) : null}

      <div className="relative">
        {/* Vertical timeline line */}
        {events.length > 1 && (
          <div className="absolute left-[5px] top-2 bottom-4 w-px bg-border" />
        )}

        <div className="space-y-0">
          {events.map((event) => (
            <RunEventCard key={event.event_id} event={event} baseAt={baseAt} />
          ))}
          {events.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">No events recorded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
