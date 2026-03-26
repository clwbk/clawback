export type RuntimePublicationStatus = "pending" | "materialized" | "restart_required" | "failed";

export type RuntimePublicationResult = {
  status: RuntimePublicationStatus;
  runtimeAgentId: string;
  detail: string | null;
};

export type RuntimePublicationInput = {
  workspaceId: string;
  agentId: string;
  agentVersionId: string;
  agentName: string;
  instructionsMarkdown: string;
  persona: Record<string, unknown>;
  modelRouting: {
    provider: string;
    model: string;
  };
  toolPolicy: {
    allowedTools: string[];
  };
  runtimeAgentId: string;
};

export type RuntimeExecutionInput = {
  runId: string;
  conversationId: string;
  runtimeAgentId: string;
  runtimeSessionKey: string;
  messageText: string;
  idempotencyKey: string;
  timeoutMs: number;
  publication: RuntimePublicationInput;
};

export type RuntimeStreamEvent = {
  type: "lifecycle" | "assistant" | "tool" | "unknown";
  phase: string | null;
  payload: Record<string, unknown>;
  occurredAt: string;
};

export type RuntimeExecutionResult = {
  runtimeRunId: string;
  acceptedAt: string | null;
  completionStatus: "completed" | "failed" | "timeout";
  startedAt: string | null;
  endedAt: string | null;
  assistantText: string;
  errorMessage: string | null;
};

export interface RuntimeBackend {
  publishAgentVersion(input: RuntimePublicationInput): Promise<RuntimePublicationResult>;
  executeRun(
    input: RuntimeExecutionInput,
    options?: {
      onAccepted?: (accepted: { runtimeRunId: string; acceptedAt: string | null }) => Promise<void> | void;
      onEvent?: (event: RuntimeStreamEvent) => Promise<void> | void;
    },
  ): Promise<RuntimeExecutionResult>;
}
