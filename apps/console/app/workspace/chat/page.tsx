"use client";

import { Suspense, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { useApprovalSummary } from "@/hooks/use-approval-summary";
import { useAgents } from "@/hooks/use-agents";
import { useConversations } from "@/hooks/use-conversations";
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

type Notice = { tone: "error" | "success" | "info"; message: string };

function ChatPageInner() {
  const { session, loading: sessionLoading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedAgentId = searchParams.get("agent");
  const requestedConversationId = searchParams.get("conversation");

  const noticeRef = useRef<Notice | null>(null);
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
      void convHandlers.loadConversationState(conversationId, runId, { keepDrafts: false });
    },
    [convHandlers],
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
    convHandlers.setComposerText(text);
  }

  const role = isAdmin ? "admin" : "user";
  const { pendingCount } = useApprovalSummary(role);

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
      rail={
        <IconRail
          role={role}
          activeSection={activeSection}
          onNavigate={handleNavigate}
          pendingApprovals={pendingCount}
        />
      }
      panel={panel}
    >
      <div className="grid h-full min-h-0 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-h-0 flex-col">
          <div className="shrink-0 rounded-lg border border-amber-200 bg-amber-50 p-3 mx-4 mt-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            This is the legacy chat interface. Workers handle most tasks now.{" "}
            <Link href="/workspace/workers" className="font-medium underline underline-offset-2">Go to Workers &rarr;</Link>
          </div>
          <div className="min-h-0 flex-1">
            <ChatThread
              conversationDetail={convState.conversationDetail}
              runsById={convState.runsById}
              runEventsById={convState.runEventsById}
              assistantDrafts={convState.assistantDrafts}
              streamTarget={convState.streamTarget}
              isAdmin={isAdmin}
              loading={convState.loadingConversationDetail}
              onSuggestion={handleSuggestion}
            />
          </div>
          <ChatComposer
            value={convState.composerText}
            onChange={convHandlers.setComposerText}
            onSend={handleSend}
            disabled={!convState.selectedConversationId || !session}
            isStreaming={isStreaming}
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
