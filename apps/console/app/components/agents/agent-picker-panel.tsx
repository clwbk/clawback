"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { conversationLabel } from "@/hooks/use-run-stream";
import type { AgentRecord, ConversationRecord, AuthenticatedSession } from "@/lib/control-plane";
import { cn } from "@/lib/utils";

interface AgentPickerPanelProps {
  agents: AgentRecord[];
  selectedAgentId: string | null;
  conversations: ConversationRecord[];
  selectedConversationId: string | null;
  loadingConversations?: boolean;
  creatingConversation?: boolean;
  session: AuthenticatedSession | null;
  onSelectAgent: (agentId: string) => void;
  onSelectConversation: (conversationId: string) => void;
  onNewThread: () => void;
}

export function AgentPickerPanel({
  agents,
  selectedAgentId,
  conversations,
  selectedConversationId,
  loadingConversations,
  creatingConversation,
  session,
  onSelectAgent,
  onSelectConversation,
  onNewThread,
}: AgentPickerPanelProps) {
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;
  const assistantHeading = agents.length === 1 ? "Assistant" : "Assistants";

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      {/* Assistant list */}
      <div className="px-3 pt-4 pb-2">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
          {assistantHeading}
        </p>
        <div className="flex flex-col gap-0.5">
          {agents.length === 0 && (
            <p className="py-2 text-xs text-sidebar-foreground/50">No assistants yet.</p>
          )}
          {agents.map((agent) => (
            <button
              key={agent.id}
              type="button"
              onClick={() => onSelectAgent(agent.id)}
              className={cn(
                "w-full rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors",
                agent.id === selectedAgentId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
              )}
            >
              {agent.name}
            </button>
          ))}
        </div>
      </div>

      <Separator className="mx-3" />

      {/* Conversations for selected agent */}
      <div className="flex min-h-0 flex-1 flex-col px-3 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/50">
            Threads
          </p>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-sidebar-foreground/50 hover:text-sidebar-foreground"
            onClick={onNewThread}
            disabled={!selectedAgentId || creatingConversation || !session}
            aria-label="New thread"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {loadingConversations ? (
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-6 w-full rounded-md" />
              <Skeleton className="h-6 w-full rounded-md" />
              <Skeleton className="h-6 w-3/4 rounded-md" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="py-2 text-xs text-sidebar-foreground/50">
              {selectedAgentId ? "No threads yet. Create one." : "Select an assistant first."}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {conversations.map((conv, index) => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => onSelectConversation(conv.id)}
                  className={cn(
                    "w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                    conv.id === selectedConversationId
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  )}
                >
                  <span className="block truncate">{conversationLabel(conv, index)}</span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* New Thread button at bottom */}
      <div className="px-3 pb-4 pt-2">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-1.5 border-sidebar-border bg-transparent text-xs text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          onClick={onNewThread}
          disabled={!selectedAgentId || creatingConversation || !session}
        >
          <Plus className="h-3.5 w-3.5" />
          New Thread
        </Button>
      </div>
    </div>
  );
}
