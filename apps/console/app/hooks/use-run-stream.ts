"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  getRunEvents,
  type RunEventRecord,
  type RunRecord,
} from "@/lib/control-plane";

type StreamTarget = {
  runId: string;
  conversationId: string;
};

type Notice = {
  tone: "error" | "success" | "info";
  message: string;
};

const RUN_STREAM_RECONNECT_BASE_DELAY_MS = 1000;
const RUN_STREAM_RECONNECT_MAX_DELAY_MS = 30_000;
const RUN_STREAM_RECONNECT_MAX_ATTEMPTS = 5;
const RUN_EVENT_POLL_INTERVAL_MS = 750;

export function getRunStreamReconnectDelayMs(attempt: number) {
  if (attempt < 1) return 0;
  return Math.min(
    RUN_STREAM_RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1),
    RUN_STREAM_RECONNECT_MAX_DELAY_MS,
  );
}

export function shouldRetryRunStreamReconnect(attempt: number) {
  return attempt <= RUN_STREAM_RECONNECT_MAX_ATTEMPTS;
}

// --- Helper functions ---

export function extractText(parts: Array<{ type: "text"; text: string }>) {
  return parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function formatTimestamp(value: string | null) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function summarizeEvent(event: RunEventRecord) {
  const toolName =
    typeof event.payload.tool_name === "string"
      ? event.payload.tool_name
      : typeof event.payload.name === "string"
        ? event.payload.name
        : null;

  switch (event.event_type) {
    case "run.created":
      return "Run queued from the conversation composer.";
    case "run.snapshot.created":
      return "Immutable run snapshot persisted.";
    case "run.claimed":
      return "Runtime worker claimed the queue job.";
    case "run.dispatch.accepted":
      return "OpenClaw accepted the run dispatch.";
    case "run.model.started":
      return "Model execution started.";
    case "run.output.delta":
      return typeof event.payload.delta === "string" ? event.payload.delta : "Assistant streamed output.";
    case "run.completed":
      return typeof event.payload.assistant_text === "string"
        ? event.payload.assistant_text
        : "Run completed successfully.";
    case "run.failed":
      return typeof event.payload.error === "string" ? event.payload.error : "Run failed.";
    case "run.tool.requested":
      return toolName
        ? `Tool requested: ${toolName}.`
        : "Tool request observed.";
    case "run.tool.completed":
      return toolName
        ? `Tool completed: ${toolName}.`
        : "Tool completion observed.";
    case "run.waiting_for_approval":
      return "Run is waiting for admin approval.";
    case "run.approval.resolved":
      return typeof event.payload.decision === "string"
        ? `Approval ${event.payload.decision}.`
        : "Approval resolved.";
    default:
      return "Run status updated.";
  }
}

export function buildSyntheticEvent(input: {
  runId: string;
  sequence: number;
  type:
    | "run.status"
    | "assistant.delta"
    | "assistant.completed"
    | "run.failed"
    | "run.approval.required"
    | "run.approval.resolved";
  data: Record<string, unknown>;
}): RunEventRecord | null {
  if (input.type === "run.status") {
    const eventType = typeof input.data.event_type === "string" ? input.data.event_type : null;
    if (!eventType) return null;

    const { event_type: _eventType, ...payload } = input.data;
    return {
      event_id: `${input.runId}:${input.sequence}`,
      event_type: eventType as RunEventRecord["event_type"],
      workspace_id: "synthetic",
      run_id: input.runId,
      sequence: input.sequence,
      occurred_at: new Date().toISOString(),
      actor: { type: "service", id: "console-stream" },
      payload,
    };
  }

  if (input.type === "assistant.delta") {
    return {
      event_id: `${input.runId}:${input.sequence}`,
      event_type: "run.output.delta",
      workspace_id: "synthetic",
      run_id: input.runId,
      sequence: input.sequence,
      occurred_at: new Date().toISOString(),
      actor: { type: "service", id: "console-stream" },
      payload: input.data,
    };
  }

  if (input.type === "assistant.completed") {
    return {
      event_id: `${input.runId}:${input.sequence}`,
      event_type: "run.completed",
      workspace_id: "synthetic",
      run_id: input.runId,
      sequence: input.sequence,
      occurred_at: new Date().toISOString(),
      actor: { type: "service", id: "console-stream" },
      payload: input.data,
    };
  }

  if (input.type === "run.failed") {
    return {
      event_id: `${input.runId}:${input.sequence}`,
      event_type: "run.failed",
      workspace_id: "synthetic",
      run_id: input.runId,
      sequence: input.sequence,
      occurred_at: new Date().toISOString(),
      actor: { type: "service", id: "console-stream" },
      payload: input.data,
    };
  }

  if (input.type === "run.approval.required") {
    return {
      event_id: `${input.runId}:${input.sequence}`,
      event_type: "run.waiting_for_approval",
      workspace_id: "synthetic",
      run_id: input.runId,
      sequence: input.sequence,
      occurred_at: new Date().toISOString(),
      actor: { type: "service", id: "console-stream" },
      payload: input.data,
    };
  }

  if (input.type === "run.approval.resolved") {
    return {
      event_id: `${input.runId}:${input.sequence}`,
      event_type: "run.approval.resolved",
      workspace_id: "synthetic",
      run_id: input.runId,
      sequence: input.sequence,
      occurred_at: new Date().toISOString(),
      actor: { type: "service", id: "console-stream" },
      payload: input.data,
    };
  }

  return null;
}

export function mergeRunEvents(existing: RunEventRecord[], incoming: RunEventRecord) {
  if (existing.some((event) => event.sequence === incoming.sequence)) {
    return existing;
  }
  return [...existing, incoming].sort((left, right) => left.sequence - right.sequence);
}

export function runStatusClasses(status: RunRecord["status"]) {
  switch (status) {
    case "completed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    case "failed":
      return "border-red-500/30 bg-red-500/10 text-red-400";
    case "running":
      return "border-blue-500/30 bg-blue-500/10 text-blue-400";
    case "queued":
      return "border-muted-foreground/20 bg-muted/50 text-muted-foreground";
    case "waiting_for_approval":
      return "border-amber-500/30 bg-amber-500/10 text-amber-400";
    default:
      return "border-muted-foreground/20 bg-muted/50 text-muted-foreground";
  }
}

export function conversationLabel(conversation: { title: string | null }, index: number) {
  if (conversation.title) return conversation.title;
  return `Thread ${index + 1}`;
}

// --- Hook ---

export interface RunStreamHandlers {
  setRunEventsById: React.Dispatch<React.SetStateAction<Record<string, RunEventRecord[]>>>;
  setRunsById: React.Dispatch<React.SetStateAction<Record<string, RunRecord>>>;
  setAssistantDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setStreamTarget: (target: StreamTarget | null) => void;
}

export function useRunStream(
  streamTarget: StreamTarget | null,
  onNotice: (notice: Notice | null) => void,
  onStreamEnd: (conversationId: string, runId: string) => void,
  handlers: RunStreamHandlers,
) {
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSequenceByRunRef = useRef<Record<string, number>>({});
  const isStreaming = streamTarget !== null;

  const clearPollTimer = () => {
    if (pollTimerRef.current !== null) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  const clearStreamTarget = useEffectEvent(() => {
    handlers.setStreamTarget(null);
  });

  const applyObservedRunEvent = useEffectEvent(
    (event: RunEventRecord, conversationId: string) => {
      handlers.setRunEventsById((current) => ({
        ...current,
        [event.run_id]: mergeRunEvents(current[event.run_id] ?? [], event),
      }));

      if (event.event_type === "run.output.delta") {
        const delta = typeof event.payload.delta === "string" ? event.payload.delta : "";
        handlers.setAssistantDrafts((current) => ({
          ...current,
          [event.run_id]: `${current[event.run_id] ?? ""}${delta}`,
        }));
        handlers.setRunsById((current) => {
          const record = current[event.run_id];
          if (!record) return current;
          return {
            ...current,
            [event.run_id]: { ...record, status: "running", current_step: "modeling" },
          };
        });
        return false;
      }

      if (event.event_type === "run.claimed") {
        handlers.setRunsById((current) => {
          const record = current[event.run_id];
          if (!record) return current;
          return {
            ...current,
            [event.run_id]: { ...record, status: "running", current_step: "claimed" },
          };
        });
        return false;
      }

      if (event.event_type === "run.dispatch.accepted") {
        handlers.setRunsById((current) => {
          const record = current[event.run_id];
          if (!record) return current;
          return {
            ...current,
            [event.run_id]: { ...record, status: "running", current_step: "dispatched" },
          };
        });
        return false;
      }

      if (event.event_type === "run.model.started") {
        handlers.setRunsById((current) => {
          const record = current[event.run_id];
          if (!record) return current;
          return {
            ...current,
            [event.run_id]: { ...record, status: "running", current_step: "modeling" },
          };
        });
        return false;
      }

      if (event.event_type === "run.waiting_for_approval") {
        handlers.setRunsById((current) => {
          const record = current[event.run_id];
          if (!record) return current;
          return {
            ...current,
            [event.run_id]: {
              ...record,
              status: "waiting_for_approval",
              current_step: "approval",
            },
          };
        });
        return false;
      }

      if (event.event_type === "run.approval.resolved") {
        handlers.setRunsById((current) => {
          const record = current[event.run_id];
          if (!record) return current;
          return {
            ...current,
            [event.run_id]: {
              ...record,
              status: "running",
              current_step: "approval-resolved",
            },
          };
        });
        return false;
      }

      if (event.event_type === "run.completed" || event.event_type === "run.failed") {
        clearPollTimer();
        handlers.setStreamTarget(null);
        handlers.setAssistantDrafts((current) => {
          const next = { ...current };
          delete next[event.run_id];
          return next;
        });

        handlers.setRunsById((current) => {
          const record = current[event.run_id];
          if (!record) return current;
          return {
            ...current,
            [event.run_id]: {
              ...record,
              status: event.event_type === "run.completed" ? "completed" : "failed",
              current_step: null,
              summary:
                event.event_type === "run.completed"
                  ? typeof event.payload.assistant_text === "string"
                    ? event.payload.assistant_text
                    : record.summary
                  : typeof event.payload.error === "string"
                    ? event.payload.error
                    : record.summary,
            },
          };
        });

        onStreamEnd(conversationId, event.run_id);
        return true;
      }

      return false;
    },
  );

  useEffect(() => {
    if (!streamTarget) {
      clearPollTimer();
      return;
    }

    let canceled = false;
    lastSequenceByRunRef.current[streamTarget.runId] = 0;
    onNotice(null);

    const pollEvents = async () => {
      try {
        const response = await getRunEvents(streamTarget.runId);
        if (canceled) return;

        const lastSequence = lastSequenceByRunRef.current[streamTarget.runId] ?? 0;
        const nextEvents = response.events
          .filter((event) => event.sequence > lastSequence)
          .sort((left, right) => left.sequence - right.sequence);

        let observedTerminalEvent = false;
        for (const event of nextEvents) {
          lastSequenceByRunRef.current[streamTarget.runId] = event.sequence;
          if (applyObservedRunEvent(event, streamTarget.conversationId)) {
            observedTerminalEvent = true;
            break;
          }
        }

        if (canceled || observedTerminalEvent) {
          return;
        }

        clearPollTimer();
        pollTimerRef.current = setTimeout(() => {
          void pollEvents();
        }, RUN_EVENT_POLL_INTERVAL_MS);
      } catch {
        if (canceled) return;

        clearPollTimer();
        clearStreamTarget();
        onNotice({
          tone: "info",
          message: "Live updates disconnected. Reloading from persisted state keeps the transcript consistent.",
        });
        onStreamEnd(streamTarget.conversationId, streamTarget.runId);
      }
    };

    void pollEvents();

    return () => {
      canceled = true;
      clearPollTimer();
      delete lastSequenceByRunRef.current[streamTarget.runId];
    };
  }, [streamTarget]);

  return { isStreaming };
}
