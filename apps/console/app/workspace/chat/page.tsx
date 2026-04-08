"use client";

import Link from "next/link";
import { Suspense, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { useApprovalSummary } from "@/hooks/use-approval-summary";
import { useAgents } from "@/hooks/use-agents";
import { useConversations } from "@/hooks/use-conversations";
import { useWorkspaceRail } from "@/hooks/use-workspace-rail";
import { useRunStream } from "@/hooks/use-run-stream";
import { AppShell } from "@/components/layout/app-shell";
import { IconRail } from "@/components/navigation/icon-rail";
import { AgentPickerPanel } from "@/components/agents/agent-picker-panel";
import { ChatThread } from "@/components/chat/chat-thread";
import { ChatComposer } from "@/components/chat/chat-composer";
import { WorkbenchHost } from "@/components/workbench/workbench-host";
import { Skeleton } from "@/components/ui/skeleton";
import { usePathname } from "next/navigation";
import {
  buildChatLocation,
  pathToWorkspaceSection,
  workspaceSectionToPath,
} from "@/lib/workspace-navigation";
import { suggestAssistantTemplate } from "@/lib/assistant-templates";

type Notice = { tone: "error" | "success" | "info"; message: string };
const STREAM_END_RELOAD_RETRY_DELAYS_MS = [0, 500, 1500] as const;

function ChatPageInner() {
  const { session, loading: sessionLoading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedAgentId = searchParams.get("agent");
  const requestedConversationId = searchParams.get("conversation");

  const noticeRef = useRef<Notice | null>(null);
  const pendingStreamEndReloadsRef = useRef(new Set<string>());
  const onNotice = useCallback((n: Notice | null) => {
    noticeRef.current = n;
  }, []);

  const onLocationChange = useCallback(
    (agentId: string | null, conversationId: string | null) => {
      router.replace(buildChatLocation(agentId, conversationId));
    },
    [router],
  );

  const { state: agentsState, handlers: agentHandlers } = useAgents(
    session,
    sessionLoading,
    onNotice,
    onLocationChange,
    requestedAgentId,
  );

  const { state: convState, handlers: convHandlers } = useConversations(
    agentsState.selectedAgentId,
    session,
    onNotice,
    onLocationChange,
    requestedConversationId,
  );

  const onStreamEnd = useCallback(
    (conversationId: string, runId: string) => {
      if (pendingStreamEndReloadsRef.current.has(runId)) {
        return;
      }

      pendingStreamEndReloadsRef.current.add(runId);
      void (async () => {
        try {
          for (const delayMs of STREAM_END_RELOAD_RETRY_DELAYS_MS) {
            if (delayMs > 0) {
              await new Promise((resolve) => {
                setTimeout(resolve, delayMs);
              });
            }

            try {
              await convHandlers.loadConversationState(conversationId, runId, {
                keepDrafts: false,
                allowStaleActiveRunFallback: false,
              });
              return;
            } catch (error) {
              if (delayMs === STREAM_END_RELOAD_RETRY_DELAYS_MS.at(-1)) {
                onNotice({
                  tone: "error",
                  message:
                    error instanceof Error
                      ? error.message
                      : "Failed to reload the conversation after the run finished.",
                });
              }
            }
          }
        } finally {
          pendingStreamEndReloadsRef.current.delete(runId);
        }
      })();
    },
    [convHandlers, onNotice],
  );

  const { isStreaming } = useRunStream(convState.streamTarget, onNotice, onStreamEnd, {
    setRunEventsById: convHandlers.setRunEventsById,
    setRunsById: convHandlers.setRunsById,
    setAssistantDrafts: convHandlers.setAssistantDrafts,
    setStreamTarget: convHandlers.setStreamTarget,
  });

  const isAdmin = session?.membership.role === "admin";
  const activeSection = pathToWorkspaceSection(pathname);

  function handleNavigate(section: string) {
    if (section === "docs") {
      window.open("/docs", "_blank", "noopener");
      return;
    }
    router.push(workspaceSectionToPath(section));
  }

  function handleSend() {
    if (!convState.composerText.trim() || !convState.selectedConversationId || !session) return;
    void convHandlers.sendMessage({
      text: convState.composerText,
      conversationId: convState.selectedConversationId,
      agentId: agentsState.selectedAgentId,
      session,
      conversationDetail: convState.conversationDetail,
    });
  }

  function handleNewThread() {
    if (!agentsState.selectedAgentId || !session) return;
    void convHandlers.createConversation({
      agentId: agentsState.selectedAgentId,
      session,
    });
  }

  function handleSuggestion(text: string) {
    if (convState.selectedConversationId) {
      convHandlers.setComposerText(text);
      return;
    }
    const selectedAgentId = agentsState.selectedAgentId;
    if (!selectedAgentId || !session) return;

    void (async () => {
      await convHandlers.createConversation({
        agentId: selectedAgentId,
        session,
      });
      convHandlers.setComposerText(text);
    })();
  }

  const role = isAdmin ? "admin" : "user";
  const { pendingCount } = useApprovalSummary(role);
  const { railExpanded, toggleRail } = useWorkspaceRail();
  const starterPrompts =
    agentsState.selectedAgent
      ? suggestAssistantTemplate({
          agentName: agentsState.selectedAgent.name,
        })?.starterPrompts
      : undefined;
  const isSingleAssistantWorkspace = agentsState.agents.length === 1;
  const composerPlaceholder = !agentsState.selectedAgent
    ? "Select an assistant first"
    : !convState.selectedConversationId
      ? `Create a new thread with ${agentsState.selectedAgent.name}`
      : `Message ${agentsState.selectedAgent.name}…`;

  const panel = (
    <AgentPickerPanel
      agents={agentsState.agents}
      selectedAgentId={agentsState.selectedAgentId}
      conversations={convState.conversations}
      selectedConversationId={convState.selectedConversationId}
      loadingConversations={convState.loadingConversations}
      creatingConversation={convState.creatingConversation}
      session={session}
      onSelectAgent={(agentId) => {
        agentHandlers.selectAgent(agentId);
        onLocationChange(agentId, null);
      }}
      onSelectConversation={(conversationId) => {
        convHandlers.selectConversation(conversationId);
        onLocationChange(agentsState.selectedAgentId, conversationId);
      }}
      onNewThread={handleNewThread}
    />
  );

  return (
    <AppShell
      railExpanded={railExpanded}
      rail={
        <IconRail
          role={role}
          activeSection={activeSection}
          onNavigate={handleNavigate}
          pendingApprovals={pendingCount}
          expanded={railExpanded}
          onToggleExpanded={toggleRail}
        />
      }
      panel={panel}
    >
      <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {agentsState.selectedAgent
                    ? `${agentsState.selectedAgent.name} chat`
                    : "Grounded chat"}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {agentsState.selectedAgent
                    ? isSingleAssistantWorkspace
                      ? "This is the retrieval-first lane in the demo workspace. Open Knowledge to inspect the seeded source, or open Workers to inspect the broader worker catalog."
                      : "Create a thread and run a grounded prompt to see the assistant work."
                    : "Pick an assistant from the left panel to start a guided conversation."}
                </p>
              </div>
              <Link
                href="/workspace/connectors"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Open Knowledge
              </Link>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <ChatThread
              conversationDetail={convState.conversationDetail}
              runsById={convState.runsById}
              runEventsById={convState.runEventsById}
              assistantDrafts={convState.assistantDrafts}
              streamTarget={convState.streamTarget}
              assistantName={agentsState.selectedAgent?.name ?? null}
              hasSelectedConversation={Boolean(convState.selectedConversationId)}
              isAdmin={isAdmin}
              loading={convState.loadingConversationDetail}
              onSuggestion={handleSuggestion}
              onCreateThread={
                agentsState.selectedAgentId && !convState.selectedConversationId
                  ? handleNewThread
                  : undefined
              }
              suggestionChips={starterPrompts}
            />
          </div>
          <ChatComposer
            value={convState.composerText}
            onChange={convHandlers.setComposerText}
            onSend={handleSend}
            disabled={!convState.selectedConversationId || !session}
            isStreaming={isStreaming}
            placeholder={composerPlaceholder}
          />
        </div>
        <WorkbenchHost
          assistant={agentsState.selectedAgent}
          conversationDetail={convState.conversationDetail}
          runsById={convState.runsById}
          runEventsById={convState.runEventsById}
          onSuggestion={handleSuggestion}
        />
      </div>
    </AppShell>
  );
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      }
    >
      <ChatPageInner />
    </Suspense>
  );
}
