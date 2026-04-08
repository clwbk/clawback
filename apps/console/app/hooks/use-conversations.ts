"use client";

import { useEffect, useRef, useState } from "react";
import {
  createConversation,
  createRun,
  getConversation,
  getRun,
  getRunEvents,
  listConversations,
  type AuthenticatedSession,
  type ConversationDetail,
  type ConversationRecord,
  type RunEventRecord,
  type RunRecord,
} from "@/lib/control-plane";
import { resolvePreferredSelectionId } from "@/lib/workspace-navigation";

type Notice = {
  tone: "error" | "success" | "info";
  message: string;
};

type StreamTarget = {
  runId: string;
  conversationId: string;
};

function sortRuns(records: RunRecord[]) {
  return [...records].sort((left, right) => {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
}

function uniqueRunIds(messages: ConversationDetail["messages"]) {
  const seen = new Set<string>();
  const runIds: string[] = [];

  for (const message of messages) {
    if (!message.run_id || seen.has(message.run_id)) continue;
    seen.add(message.run_id);
    runIds.push(message.run_id);
  }

  return runIds;
}

function hasAssistantMessageForRun(
  messages: ConversationDetail["messages"],
  runId: string,
) {
  return messages.some(
    (message) => message.role === "assistant" && message.run_id === runId,
  );
}

function hasTerminalRunEvent(events: RunEventRecord[]) {
  return events.some(
    (event) =>
      event.event_type === "run.completed" ||
      event.event_type === "run.failed",
  );
}

type ActiveRunSelectionParams = {
  run: RunRecord;
  detail: ConversationDetail;
  events: RunEventRecord[];
  hasAuthoritativeRunRecord: boolean;
  hasAuthoritativeRunEvents: boolean;
  allowStaleFallback: boolean;
};

export function shouldUseRunAsActiveStream({
  run,
  detail,
  events,
  hasAuthoritativeRunRecord,
  hasAuthoritativeRunEvents,
  allowStaleFallback,
}: ActiveRunSelectionParams) {
  if (run.status !== "queued" && run.status !== "running") {
    return false;
  }

  if (hasAssistantMessageForRun(detail.messages, run.id)) {
    return false;
  }

  if (hasTerminalRunEvent(events)) {
    return false;
  }

  if (!allowStaleFallback && !hasAuthoritativeRunRecord && !hasAuthoritativeRunEvents) {
    return false;
  }

  return true;
}

export interface ConversationsState {
  conversations: ConversationRecord[];
  selectedConversationId: string | null;
  conversationDetail: ConversationDetail | null;
  runsById: Record<string, RunRecord>;
  runEventsById: Record<string, RunEventRecord[]>;
  selectedRunId: string | null;
  assistantDrafts: Record<string, string>;
  streamTarget: StreamTarget | null;
  loadingConversations: boolean;
  loadingConversationDetail: boolean;
  creatingConversation: boolean;
  sendingMessage: boolean;
  composerText: string;
}

export interface ConversationHandlers {
  selectConversation: (conversationId: string | null) => void;
  createConversation: (params: {
    agentId: string;
    session: AuthenticatedSession;
  }) => Promise<void>;
  sendMessage: (params: {
    text: string;
    conversationId: string;
    agentId: string | null;
    session: AuthenticatedSession;
    conversationDetail: ConversationDetail | null;
  }) => Promise<void>;
  setComposerText: (text: string) => void;
  selectRun: (runId: string | null) => void;
  setStreamTarget: (target: StreamTarget | null) => void;
  setRunsById: React.Dispatch<React.SetStateAction<Record<string, RunRecord>>>;
  setRunEventsById: React.Dispatch<React.SetStateAction<Record<string, RunEventRecord[]>>>;
  setAssistantDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  loadConversationState: (
    conversationId: string,
    preferredRunId?: string | null,
    options?: {
      keepDrafts?: boolean;
      allowStaleActiveRunFallback?: boolean;
    },
  ) => Promise<void>;
}

export function useConversations(
  selectedAgentId: string | null,
  session: AuthenticatedSession | null,
  onNotice: (notice: Notice | null) => void,
  onLocationChange: (agentId: string | null, conversationId: string | null) => void,
  requestedConversationId?: string | null,
) {
  const conversationLoadTokenRef = useRef(0);

  const cancelPendingConversationLoad = () => {
    conversationLoadTokenRef.current += 1;
    setLoadingConversationDetail(false);
  };

  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationDetail, setConversationDetail] = useState<ConversationDetail | null>(null);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingConversationDetail, setLoadingConversationDetail] = useState(false);

  const [runsById, setRunsById] = useState<Record<string, RunRecord>>({});
  const [runEventsById, setRunEventsById] = useState<Record<string, RunEventRecord[]>>({});
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [assistantDrafts, setAssistantDrafts] = useState<Record<string, string>>({});
  const [streamTargetState, setStreamTargetState] = useState<StreamTarget | null>(null);
  const setStreamTarget = (target: StreamTarget | null) => {
    setStreamTargetState((current) => {
      if (!current && !target) return current;
      if (
        current &&
        target &&
        current.runId === target.runId &&
        current.conversationId === target.conversationId
      ) {
        return current;
      }
      return target;
    });
  };

  const [composerText, setComposerText] = useState("");
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);

  async function loadConversationState(
    conversationId: string,
    preferredRunId?: string | null,
    options?: {
      keepDrafts?: boolean;
      allowStaleActiveRunFallback?: boolean;
    },
  ) {
    const requestId = ++conversationLoadTokenRef.current;
    setLoadingConversationDetail(true);
    try {
      const detail = await getConversation(conversationId);
      if (conversationLoadTokenRef.current !== requestId) return;

      // Persisted transcript data is the primary UX path. Show it immediately,
      // then hydrate per-run metadata as a best-effort follow-up.
      setConversationDetail(detail);
      if (!options?.keepDrafts) setAssistantDrafts({});
      setLoadingConversationDetail(false);

      const runIds = uniqueRunIds(detail.messages);
      const settledRunBundles = await Promise.allSettled(
        runIds.map(async (runId) => {
          const [record, events] = await Promise.all([getRun(runId), getRunEvents(runId)]);
          return { record, events: events.events };
        }),
      );

      const successfulRunBundles = settledRunBundles.flatMap((bundle) =>
        bundle.status === "fulfilled" ? [bundle.value] : [],
      );
      const successfulRunsById = new Map(
        successfulRunBundles.map((bundle) => [bundle.record.id, bundle.record]),
      );
      const successfulEventsById = new Map(
        successfulRunBundles.map((bundle) => [bundle.record.id, bundle.events]),
      );
      const allowStaleActiveRunFallback =
        options?.allowStaleActiveRunFallback ?? true;
      const nextRunsById = Object.fromEntries(
        runIds.flatMap((runId) => {
          const record = successfulRunsById.get(runId) ?? runsById[runId];
          return record ? [[runId, record]] : [];
        }),
      );
      const nextEventsById = Object.fromEntries(
        runIds.flatMap((runId) => {
          const events = successfulEventsById.get(runId) ?? runEventsById[runId];
          return events ? [[runId, events]] : [];
        }),
      );
      const sortedRuns = sortRuns(
        runIds.flatMap((runId) => {
          const run = nextRunsById[runId];
          return run ? [run] : [];
        }),
      );
      const activeRun =
        sortedRuns.find((run) => {
          return shouldUseRunAsActiveStream({
            run,
            detail,
            events: nextEventsById[run.id] ?? [],
            hasAuthoritativeRunRecord: successfulRunsById.has(run.id),
            hasAuthoritativeRunEvents: successfulEventsById.has(run.id),
            allowStaleFallback: allowStaleActiveRunFallback,
          });
        }) ?? null;
      const nextSelectedRunId =
        preferredRunId && nextRunsById[preferredRunId]
          ? preferredRunId
          : selectedRunId && nextRunsById[selectedRunId]
            ? selectedRunId
            : sortedRuns[0]?.id ?? null;

      if (conversationLoadTokenRef.current !== requestId) return;

      setRunsById(nextRunsById);
      setRunEventsById(nextEventsById);
      setSelectedRunId(nextSelectedRunId);
      setStreamTarget(activeRun ? { runId: activeRun.id, conversationId } : null);
    } catch (error) {
      if (conversationLoadTokenRef.current === requestId) {
        setLoadingConversationDetail(false);
      }
      throw error;
    }
  }

  // Fetch conversations when selected agent changes
  useEffect(() => {
    let canceled = false;

    if (!selectedAgentId) {
      setConversations([]);
      setSelectedConversationId(null);
      setConversationDetail(null);
      setRunsById({});
      setRunEventsById({});
      return () => {
        canceled = true;
      };
    }

    setLoadingConversations(true);

    void (async () => {
      try {
        const result = await listConversations(selectedAgentId);
        if (canceled) return;

        setConversations(result.conversations);

        const preferredConversationId = resolvePreferredSelectionId(
          result.conversations.map((conversation) => conversation.id),
          {
            requestedId: requestedConversationId,
            currentId: selectedConversationId,
          },
        );

        setSelectedConversationId(preferredConversationId);
        if (requestedConversationId !== preferredConversationId) {
          onLocationChange(selectedAgentId, preferredConversationId);
        }
      } catch (error) {
        if (!canceled) {
          onNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Failed to load conversations.",
          });
        }
      } finally {
        if (!canceled) setLoadingConversations(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [onLocationChange, requestedConversationId, selectedAgentId]);

  useEffect(() => {
    if (!requestedConversationId || conversations.length === 0) return;
    if (!conversations.some((conversation) => conversation.id === requestedConversationId)) return;
    if (requestedConversationId === selectedConversationId) return;
    setSelectedConversationId(requestedConversationId);
  }, [conversations, requestedConversationId, selectedConversationId]);

  // Load conversation detail when selection changes
  useEffect(() => {
    let canceled = false;

    if (!selectedConversationId) {
      setConversationDetail(null);
      setRunsById({});
      setRunEventsById({});
      setSelectedRunId(null);
      setStreamTarget(null);
      setAssistantDrafts({});
      return () => {
        canceled = true;
      };
    }

    void (async () => {
      try {
        await loadConversationState(selectedConversationId);
      } catch (error) {
        if (!canceled) {
          onNotice({
            tone: "error",
            message: error instanceof Error ? error.message : "Failed to load the conversation.",
          });
          setLoadingConversationDetail(false);
        }
      }
    })();

    return () => {
      canceled = true;
    };
  }, [selectedConversationId]);

  const handlers: ConversationHandlers = {
    selectConversation: (conversationId) => {
      setSelectedConversationId(conversationId);
    },

    selectRun: (runId) => {
      setSelectedRunId(runId);
    },

    setStreamTarget,
    setRunsById,
    setRunEventsById,
    setAssistantDrafts,
    loadConversationState,
    setComposerText,

    createConversation: async ({ agentId, session: sess }) => {
      setCreatingConversation(true);
      onNotice(null);

      try {
        const created = await createConversation({
          agentId,
          csrfToken: sess.csrf_token,
        });

        const updated = await listConversations(agentId);
        setConversations(updated.conversations);
        setSelectedConversationId(created.id);
        onLocationChange(agentId, created.id);
        onNotice({
          tone: "success",
          message: "Conversation created. Send the first prompt to queue a run.",
        });
      } catch (error) {
        onNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to create the conversation.",
        });
      } finally {
        setCreatingConversation(false);
      }
    },

    sendMessage: async ({ text, conversationId, agentId, session: sess, conversationDetail: detail }) => {
      setSendingMessage(true);
      onNotice(null);

      try {
        const response = await createRun({
          conversationId,
          text: text.trim(),
          csrfToken: sess.csrf_token,
        });

        // A just-created thread may still be loading its empty initial state.
        // Once a run is queued, that stale response must not clear the optimistic
        // run record or detach the live stream before persisted messages arrive.
        cancelPendingConversationLoad();

        setConversationDetail((current) => {
          if (!current) return current;
          const nextSequence = current.messages.length;
          return {
            conversation: current.conversation,
            messages: [
              ...current.messages,
              {
                id: response.input_message_id,
                workspace_id: current.conversation.workspace_id,
                conversation_id: current.conversation.id,
                run_id: response.run_id,
                sequence: nextSequence,
                role: "user",
                author_user_id: sess.user.id,
                content: [{ type: "text", text: text.trim() }],
                citations: null,
                token_usage: null,
                created_at: new Date().toISOString(),
              },
            ],
          };
        });

        setRunsById((current) => ({
          ...current,
          [response.run_id]: {
            id: response.run_id,
            workspace_id: sess.workspace.id,
            agent_id: agentId ?? "",
            agent_version_id: detail?.conversation.agent_version_id ?? "",
            conversation_id: response.conversation_id,
            input_message_id: response.input_message_id,
            initiated_by: sess.user.id,
            channel: "web",
            status: "queued",
            started_at: null,
            completed_at: null,
            current_step: "queued",
            summary: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }));

        setRunEventsById((current) => ({
          ...current,
          [response.run_id]: current[response.run_id] ?? [],
        }));

        setSelectedRunId(response.run_id);
        setStreamTarget({
          runId: response.run_id,
          conversationId: response.conversation_id,
        });
        setComposerText("");

        const updated = await listConversations(agentId ?? undefined);
        setConversations(updated.conversations);
      } catch (error) {
        onNotice({
          tone: "error",
          message: error instanceof Error ? error.message : "Failed to queue the run.",
        });
      } finally {
        setSendingMessage(false);
      }
    },
  };

  const state: ConversationsState = {
    conversations,
    selectedConversationId,
    conversationDetail,
    runsById,
    runEventsById,
    selectedRunId,
    assistantDrafts,
    streamTarget: streamTargetState,
    loadingConversations,
    loadingConversationDetail,
    creatingConversation,
    sendingMessage,
    composerText,
  };

  return { state, handlers };
}
