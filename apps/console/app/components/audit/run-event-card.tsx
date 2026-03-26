"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { summarizeEvent } from "@/hooks/use-run-stream";
import type { RunEventRecord } from "@/lib/control-plane";

type EventDotColor = "blue" | "gray" | "amber" | "red";

function eventDotColor(eventType: RunEventRecord["event_type"]): EventDotColor {
  switch (eventType) {
    case "run.created":
    case "run.snapshot.created":
    case "run.claimed":
    case "run.dispatch.accepted":
    case "run.model.started":
      return "blue";
    case "run.waiting_for_approval":
      return "amber";
    case "run.output.delta":
    case "run.tool.requested":
    case "run.tool.completed":
      return "gray";
    case "run.approval.resolved":
    case "run.completed":
      return "blue";
    case "run.failed":
      return "red";
    default:
      return "gray";
  }
}

const dotColorClasses: Record<EventDotColor, string> = {
  blue: "bg-blue-500",
  gray: "bg-zinc-400",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

function relativeTimestamp(occurredAt: string, baseAt: string): string {
  const diff = new Date(occurredAt).getTime() - new Date(baseAt).getTime();
  if (Math.abs(diff) < 1000) return "+0s";
  const sign = diff < 0 ? "-" : "+";
  const abs = Math.abs(diff);
  if (abs < 60_000) return `${sign}${Math.round(abs / 1000)}s`;
  return `${sign}${Math.round(abs / 60_000)}m`;
}

interface RunEventCardProps {
  event: RunEventRecord;
  baseAt: string;
}

export function RunEventCard({ event, baseAt }: RunEventCardProps) {
  const [open, setOpen] = useState(false);
  const color = eventDotColor(event.event_type);
  const summary = summarizeEvent(event);
  const hasPayload = Object.keys(event.payload).length > 0;

  return (
    <div className="flex gap-3">
      {/* Dot sits on the timeline line */}
      <div className="flex flex-col items-center">
        <div className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotColorClasses[color]}`} />
      </div>

      <div className="min-w-0 flex-1 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground font-mono">{event.event_type}</span>
          <span className="text-xs text-muted-foreground">
            {relativeTimestamp(event.occurred_at, baseAt)}
          </span>
        </div>

        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{summary}</p>

        {hasPayload && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 h-6 px-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {open ? (
                  <ChevronDown className="mr-1 h-3 w-3" />
                ) : (
                  <ChevronRight className="mr-1 h-3 w-3" />
                )}
                {open ? "Hide" : "Show"} payload
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <pre className="mt-2 overflow-x-auto rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </div>
  );
}
