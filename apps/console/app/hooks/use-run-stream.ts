"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  createRunEventSource,
  parseSseEnvelope,
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
  const streamRef = useRef<EventSource | null>(null);
  const isStreaming = streamTarget !== null;

  const handleStreamMessage = useEffectEvent((rawEvent: MessageEvent<string>) => {
    const envelope = parseSseEnvelope(rawEvent.data);
    if (envelope.type === "keepalive") return;

    const syntheticEvent = buildSyntheticEvent({
      runId: envelope.run_id,
      sequence: envelope.sequence,
      type: envelope.type,
      data: envelope.data,
    });

    if (syntheticEvent) {
      handlers.setRunEventsById((current) => ({
        ...current,
        [envelope.run_id]: mergeRunEvents(current[envelope.run_id] ?? [], syntheticEvent),
      }));
    }

    if (envelope.type === "assistant.delta") {
      const delta = typeof envelope.data.delta === "string" ? envelope.data.delta : "";
      handlers.setAssistantDrafts((current) => ({
        ...current,
        [envelope.run_id]: `${current[envelope.run_id] ?? ""}${delta}`,
      }));
      handlers.setRunsById((current) => {
        const record = current[envelope.run_id];
        if (!record) return current;
        return {
          ...current,
          [envelope.run_id]: { ...record, status: "running", current_step: "modeling" },
        };
      });
      return;
    }

    if (envelope.type === "run.status") {
      const eventType = typeof envelope.data.event_type === "string" ? envelope.data.event_type : null;
      if (!eventType) return;

      handlers.setRunsById((current) => {
        const record = current[envelope.run_id];
        if (!record) return current;

        let nextStatus = record.status;
        let nextStep = record.current_step;

        if (eventType === "run.claimed") { nextStatus = "running"; nextStep = "claimed"; }
        if (eventType === "run.dispatch.accepted") { nextStatus = "running"; nextStep = "dispatched"; }
        if (eventType === "run.model.started") { nextStatus = "running"; nextStep = "modeling"; }
        if (eventType === "run.waiting_for_approval") {
          nextStatus = "waiting_for_approval";
          nextStep = "approval";
        }
        if (eventType === "run.approval.resolved") {
          nextStatus = "running";
          nextStep = "approval-resolved";
        }

        return {
          ...current,
          [envelope.run_id]: { ...record, status: nextStatus, current_step: nextStep },
        };
      });
      return;
    }

    if (envelope.type === "run.approval.required") {
      handlers.setRunsById((current) => {
        const record = current[envelope.run_id];
        if (!record) return current;
        return {
          ...current,
          [envelope.run_id]: { ...record, status: "waiting_for_approval", current_step: "approval" },
        };
      });
      return;
    }

    if (envelope.type === "run.approval.resolved") {
      handlers.setRunsById((current) => {
        const record = current[envelope.run_id];
        if (!record) return current;
        return {
          ...current,
          [envelope.run_id]: { ...record, status: "running", current_step: "approval-resolved" },
        };
      });
      return;
    }

    if (envelope.type === "assistant.completed" || envelope.type === "run.failed") {
      handlers.setStreamTarget(null);
      handlers.setAssistantDrafts((current) => {
        const next = { ...current };
        delete next[envelope.run_id];
        return next;
      });

      handlers.setRunsById((current) => {
        const record = current[envelope.run_id];
        if (!record) return current;
        return {
          ...current,
          [envelope.run_id]: {
            ...record,
            status: envelope.type === "assistant.completed" ? "completed" : "failed",
            current_step: null,
            summary:
              envelope.type === "assistant.completed"
                ? typeof envelope.data.assistant_text === "string"
                  ? envelope.data.assistant_text
                  : record.summary
                : typeof envelope.data.error === "string"
                  ? envelope.data.error
                  : record.summary,
          },
        };
      });

      onStreamEnd(envelope.conversation_id, envelope.run_id);
    }
  });

  useEffect(() => {
    if (!streamTarget) {
      streamRef.current?.close();
      streamRef.current = null;
      return;
    }

    const stream = createRunEventSource(streamTarget.runId);
    streamRef.current = stream;

    stream.onmessage = (event) => {
      handleStreamMessage(event);
    };

    stream.onerror = () => {
      stream.close();
      if (streamRef.current === stream) streamRef.current = null;
      handlers.setStreamTarget(null);
      onNotice({
        tone: "info",
        message: "The live stream disconnected. Reloading from persisted state keeps the transcript consistent.",
      });
      onStreamEnd(streamTarget.conversationId, streamTarget.runId);
    };

    return () => {
      stream.close();
      if (streamRef.current === stream) streamRef.current = null;
    };
  }, [handleStreamMessage, streamTarget]);

  return { isStreaming };
}
