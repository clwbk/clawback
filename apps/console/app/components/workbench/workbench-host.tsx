"use client";

import Link from "next/link";
import { ExternalLink, FileStack, Sparkles, Workflow } from "lucide-react";

import {
  assistantTemplateCatalog,
  suggestAssistantTemplate,
} from "@/lib/assistant-templates";
import { extractWorkbenchSummary } from "@/lib/workbench";
import type {
  AgentRecord,
  ConversationDetail,
  RunEventRecord,
  RunRecord,
} from "@/lib/control-plane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildRunFailurePresentation } from "@/lib/run-failure";

interface WorkbenchHostProps {
  assistant: AgentRecord | null;
  conversationDetail: ConversationDetail | null;
  runsById: Record<string, RunRecord>;
  runEventsById: Record<string, RunEventRecord[]>;
  onSuggestion?: (text: string) => void;
}

function statusTone(status: "pending" | "approved" | "denied" | "expired" | "canceled") {
  switch (status) {
    case "approved":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "pending":
      return "border-amber-200 bg-amber-50 text-amber-800";
    default:
      return "border-red-200 bg-red-50 text-red-700";
  }
}

function statusLabel(status: "pending" | "approved" | "denied" | "expired" | "canceled") {
  switch (status) {
    case "pending":
      return "Approval pending";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired";
    case "canceled":
      return "Canceled";
  }
}

export function WorkbenchHost({
  assistant,
  conversationDetail,
  runsById,
  runEventsById,
  onSuggestion,
}: WorkbenchHostProps) {
  const suggestedTemplate = suggestAssistantTemplate({
    agentName: assistant?.name ?? "",
  });
  const summary = extractWorkbenchSummary({
    conversationDetail,
    runsById,
    runEventsById,
  });
  const quickPrompts =
    suggestedTemplate?.starterPrompts ?? assistantTemplateCatalog[0]!.starterPrompts;
  const latestRun = summary.latestRunId ? runsById[summary.latestRunId] ?? null : null;
  const latestRunEvents = latestRun ? (runEventsById[latestRun.id] ?? []) : [];
  const latestRunFailure =
    latestRun && latestRun.status === "failed"
      ? buildRunFailurePresentation({
          run: latestRun,
          events: latestRunEvents,
          isAdmin: false,
        })
      : null;

  return (
    <aside className="hidden h-full min-h-0 flex-col border-l border-border/80 bg-muted/10 xl:flex">
      <div className="space-y-5 overflow-y-auto px-5 py-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Workflow className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium uppercase tracking-widest">Workbench</span>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {assistant?.name ?? "Structured work"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Chat stays conversational. Structured drafts, reviews, and artifacts surface here.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Suggested posture</CardTitle>
            </div>
            <CardDescription>
              {suggestedTemplate?.summary ??
                "Start in chat, then move the work into a reviewable artifact when it becomes structured."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Good prompts
            </p>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.slice(0, 3).map((prompt) => (
                <Button
                  key={prompt}
                  size="sm"
                  variant="outline"
                  className="h-auto whitespace-normal text-left"
                  onClick={() => onSuggestion?.(prompt)}
                >
                  {prompt}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current structured work</CardTitle>
            <CardDescription>
              This is where reviewable outputs and governed actions show up.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.governedAction ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-foreground">
                    {summary.governedAction.actionTitle ??
                      summary.governedAction.actionType.replaceAll("_", " ")}
                  </p>
                  <Badge
                    variant="outline"
                    className={statusTone(summary.governedAction.approvalState)}
                  >
                    {statusLabel(summary.governedAction.approvalState)}
                  </Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p>
                    Action type:{" "}
                    <span className="text-foreground">
                      {summary.governedAction.actionType.replaceAll("_", " ")}
                    </span>
                  </p>
                  <p>
                    Sources used:{" "}
                    <span className="text-foreground">
                      {summary.governedAction.retrievalResultCount ?? "—"}
                    </span>
                  </p>
                  {summary.governedAction.resultReference ? (
                    <p>
                      Result reference:{" "}
                      <span className="text-foreground">
                        {summary.governedAction.resultReference}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {summary.governedAction.approvalId ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/workspace/inbox?review=${summary.governedAction.approvalId}`}>
                        Review approval
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                  {summary.governedAction.resultInternalId ? (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/workspace/work/${summary.governedAction.resultInternalId}`}>
                        Open artifact
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                  {summary.latestRunId ? (
                    <Button asChild size="sm" variant="ghost">
                      <Link href={`/workspace/runs/${summary.latestRunId}`}>
                        View trace
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </>
            ) : latestRunFailure && latestRun ? (
              <div
                data-testid="workbench-run-failure"
                className="rounded-lg border border-destructive/20 bg-destructive/5 p-4"
              >
                <p className="text-xs font-medium uppercase tracking-widest text-destructive">
                  {latestRunFailure.title}
                </p>
                <p className="mt-1 text-sm text-foreground">{latestRunFailure.message}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/workspace/runs/${latestRun.id}`}>
                      View trace
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                No structured artifact or governed action yet. Ask the assistant to draft something
                concrete, then review or promote it from here.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileStack className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Grounding</CardTitle>
            </div>
            <CardDescription>The latest cited context is surfaced here for quick review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {summary.latestCitations.length > 0 ? (
              summary.latestCitations.slice(0, 4).map((citation) => (
                <div key={citation.chunk_id} className="rounded-lg border border-border/70 p-3">
                  <p className="text-sm font-medium text-foreground">
                    {citation.title ?? citation.path_or_uri}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{citation.path_or_uri}</p>
                  <p className="mt-2 text-xs text-muted-foreground line-clamp-3">
                    {citation.snippet}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                The next assistant response with citations will populate this panel.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </aside>
  );
}
