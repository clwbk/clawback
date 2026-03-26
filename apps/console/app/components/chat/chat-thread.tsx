"use client";

import { useEffect, useRef } from "react";
import { MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ChatBubble } from "./chat-bubble";
import { GovernedActionCard } from "./governed-action-card";
import { RunMetadata } from "./run-metadata";
import type { ConversationDetail, RunRecord, RunEventRecord } from "@/lib/control-plane";
import { extractText } from "@/hooks/use-run-stream";
import { extractGovernedActionSummary } from "@/lib/run-governed-action";

const SUGGESTION_CHIPS = [
  "What can you help me with?",
  "Summarize this conversation",
  "Give me a quick status update",
  "What are my next steps?",
];

interface ChatThreadProps {
  conversationDetail: ConversationDetail | null;
  runsById: Record<string, RunRecord>;
  runEventsById: Record<string, RunEventRecord[]>;
  assistantDrafts: Record<string, string>;
  streamTarget: { runId: string; conversationId: string } | null;
  isAdmin?: boolean;
  loading?: boolean;
  onSuggestion?: (text: string) => void;
}

function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex justify-end">
        <Skeleton className="h-10 w-48 rounded-2xl rounded-br-sm" />
      </div>
      <div className="flex flex-col gap-1">
        <Skeleton className="h-20 w-72 rounded-2xl rounded-bl-sm" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-8 w-32 rounded-2xl rounded-br-sm" />
      </div>
    </div>
  );
}

export function ChatThread({
  conversationDetail,
  runsById,
  runEventsById,
  assistantDrafts,
  streamTarget,
  isAdmin,
  loading,
  onSuggestion,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  // Track whether user is at the bottom of the scroll
  function handleScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const threshold = 60;
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
  }

  // Auto-scroll when new content arrives if user is at bottom
  useEffect(() => {
    if (atBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversationDetail?.messages.length, assistantDrafts]);

  if (loading) {
    return (
      <div className="flex h-full flex-col overflow-hidden">
        <MessageSkeleton />
      </div>
    );
  }

  const messages = conversationDetail?.messages ?? [];
  const hasMessages = messages.length > 0;
  const hasStreamingDraft =
    streamTarget && assistantDrafts[streamTarget.runId] !== undefined;

  if (!hasMessages && !hasStreamingDraft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <MessageSquare className="h-6 w-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Start a conversation</p>
          <p className="text-xs text-muted-foreground">
            Send a message below or pick a suggestion.
          </p>
        </div>
        {onSuggestion && (
          <div className="flex flex-wrap justify-center gap-2">
            {SUGGESTION_CHIPS.map((chip) => (
              <Button
                key={chip}
                variant="outline"
                size="sm"
                className="rounded-full text-xs"
                onClick={() => onSuggestion(chip)}
              >
                {chip}
              </Button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div
        className="flex flex-col gap-4 p-6"
        onScroll={handleScroll}
      >
        {messages.map((message) => {
          const text = extractText(message.content);
          const runId = message.run_id;
          const run = runId ? runsById[runId] : null;
          const events = runId ? (runEventsById[runId] ?? []) : [];
          const governedAction = run ? extractGovernedActionSummary(events) : null;

          return (
            <div key={message.id}>
              <ChatBubble
                role={message.role}
                content={text}
                citations={message.citations}
              />
              {isAdmin && message.role === "assistant" && run && (
                <RunMetadata run={run} events={events} />
              )}
              {message.role === "assistant" && run && governedAction && (
                <GovernedActionCard
                  runId={run.id}
                  summary={governedAction}
                  isAdmin={Boolean(isAdmin)}
                />
              )}
            </div>
          );
        })}

        {/* Streaming draft */}
        {hasStreamingDraft && streamTarget && (
          <div>
            <ChatBubble
              role="assistant"
              content={assistantDrafts[streamTarget.runId] ?? ""}
              isStreaming
            />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
