import { describe, expect, it } from "vitest";

import type { RuntimeBackend, RuntimeExecutionInput, RuntimePublicationInput, RuntimeStreamEvent } from "@clawback/model-adapters";

import { RunExecutionService } from "./service.js";
import type { RunExecutionStore, StoredMessage, StoredRun, StoredRunEvent, StoredRunSnapshot } from "./types.js";

class FakeRuntimeBackend implements RuntimeBackend {
  lastInput: RuntimeExecutionInput | null = null;

  async publishAgentVersion(_input: RuntimePublicationInput) {
    return {
      status: "materialized" as const,
      runtimeAgentId: "cb_agtv_1",
      detail: null,
    };
  }

  async executeRun(
    input: RuntimeExecutionInput,
    options?: {
      onAccepted?: (accepted: { runtimeRunId: string; acceptedAt: string | null }) => Promise<void> | void;
      onEvent?: (event: RuntimeStreamEvent) => Promise<void> | void;
    },
  ) {
    this.lastInput = input;
    await options?.onAccepted?.({
      runtimeRunId: "rt_1",
      acceptedAt: "2026-03-10T12:00:01Z",
    });
    await options?.onEvent?.({
      type: "lifecycle",
      phase: "start",
      payload: {},
      occurredAt: "2026-03-10T12:00:02Z",
    });
    await options?.onEvent?.({
      type: "assistant",
      phase: null,
      payload: {
        delta: "hello",
      },
      occurredAt: "2026-03-10T12:00:03Z",
    });
    await options?.onEvent?.({
      type: "tool",
      phase: "start",
      payload: {
        name: "read",
        toolCallId: "tool_1",
      },
      occurredAt: "2026-03-10T12:00:03Z",
    });
    await options?.onEvent?.({
      type: "tool",
      phase: "result",
      payload: {
        name: "read",
        toolCallId: "tool_1",
        isError: false,
      },
      occurredAt: "2026-03-10T12:00:03Z",
    });

    return {
      runtimeRunId: "rt_1",
      acceptedAt: "2026-03-10T12:00:01Z",
      completionStatus: "completed" as const,
      startedAt: "2026-03-10T12:00:02Z",
      endedAt: "2026-03-10T12:00:04Z",
      assistantText: "hello",
      errorMessage: null,
    };
  }
}

class ConcurrentDeltaRuntimeBackend extends FakeRuntimeBackend {
  override async executeRun(
    input: RuntimeExecutionInput,
    options?: {
      onAccepted?: (accepted: { runtimeRunId: string; acceptedAt: string | null }) => Promise<void> | void;
      onEvent?: (event: RuntimeStreamEvent) => Promise<void> | void;
    },
  ) {
    this.lastInput = input;
    await options?.onAccepted?.({
      runtimeRunId: "rt_1",
      acceptedAt: "2026-03-10T12:00:01Z",
    });
    await options?.onEvent?.({
      type: "lifecycle",
      phase: "start",
      payload: {},
      occurredAt: "2026-03-10T12:00:02Z",
    });
    await Promise.all([
      options?.onEvent?.({
        type: "assistant",
        phase: null,
        payload: {
          delta: "hello",
        },
        occurredAt: "2026-03-10T12:00:03Z",
      }),
      options?.onEvent?.({
        type: "assistant",
        phase: null,
        payload: {
          delta: " world",
        },
        occurredAt: "2026-03-10T12:00:03Z",
      }),
    ]);

    return {
      runtimeRunId: "rt_1",
      acceptedAt: "2026-03-10T12:00:01Z",
      completionStatus: "completed" as const,
      startedAt: "2026-03-10T12:00:02Z",
      endedAt: "2026-03-10T12:00:04Z",
      assistantText: "hello world",
      errorMessage: null,
    };
  }
}

class MemoryRunExecutionStore implements RunExecutionStore {
  run: StoredRun = {
    id: "run_1",
    workspaceId: "ws_1",
    agentId: "agt_1",
    agentVersionId: "agtv_1",
    conversationId: "cnv_1",
    inputMessageId: "msg_1",
    initiatedBy: "usr_1",
    channel: "web",
    status: "queued",
    startedAt: null,
    completedAt: null,
    currentStep: "queued",
    summary: null,
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  };

  snapshot: StoredRunSnapshot = {
    id: "rsnp_1",
    workspaceId: "ws_1",
    runId: "run_1",
    snapshotVersion: 1,
    agentSnapshotJson: {
      agent_id: "agt_1",
      agent_version_id: "agtv_1",
      scope: "shared",
      name: "Support Assistant",
      persona: {},
      instructions_markdown: "Answer clearly.",
    },
    toolPolicyJson: {
      mode: "allow_list",
      allowed_tools: [],
    },
    connectorScopeJson: {
      enabled: false,
      connector_ids: [],
    },
    modelProfileJson: {
      provider: "openai-compatible",
      model: "gpt-4.1-mini",
    },
    actorSummaryJson: {
      user_id: "usr_1",
      membership_role: "admin",
    },
    approvalPolicyJson: {
      mode: "workspace_admin",
    },
    conversationBindingJson: {
      conversation_id: "cnv_1",
      channel: "web",
      runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
    },
    inputMessageJson: {
      message_id: "msg_1",
      content: [
        {
          type: "text",
          text: "hello",
        },
      ],
    },
    createdAt: new Date("2026-03-10T12:00:00Z"),
  };

  events: StoredRunEvent[] = [];
  messages: StoredMessage[] = [];

  async getRunExecutionContext() {
    return {
      run: this.run,
      snapshot: this.snapshot,
    };
  }

  async updateRun(_runId: string, patch: Partial<StoredRun>) {
    this.run = {
      ...this.run,
      ...patch,
    };
    return this.run;
  }

  async getMaxRunEventSequence() {
    return this.events.length;
  }

  async appendRunEvent(event: StoredRunEvent) {
    this.events.push(event);
  }

  async getNextMessageSequence() {
    return this.messages.length + 1;
  }

  async createMessage(message: StoredMessage) {
    this.messages.push(message);
    return message;
  }

  async touchConversation() {}
}

describe("RunExecutionService", () => {
  it("executes the run, persists deltas, and finalizes the assistant message", async () => {
    const store = new MemoryRunExecutionStore();
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(store.run.status).toBe("completed");
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0]?.role).toBe("assistant");
    expect(store.events.map((event) => event.eventType)).toEqual([
      "run.claimed",
      "run.dispatch.accepted",
      "run.model.started",
      "run.output.delta",
      "run.tool.requested",
      "run.tool.completed",
      "run.completed",
    ]);
    expect(runtimeBackend.lastInput?.messageText).toBe("hello");
  });

  it("retrieves context before execution and persists citations on the assistant message", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_1"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => ({
        query: "hello",
        results: [
          {
            connector_id: "ctr_1",
            connector_name: "Docs",
            document_id: "doc_1",
            document_version_id: "docv_1",
            chunk_id: "chk_1",
            title: "Probe",
            path_or_uri: "probe.txt",
            snippet: "hello from the docs",
            score: 0.9,
            content: "hello from the docs",
          },
        ],
      }),
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(store.events.map((event) => event.eventType)).toEqual([
      "run.claimed",
      "run.retrieval.requested",
      "run.retrieval.completed",
      "run.dispatch.accepted",
      "run.model.started",
      "run.output.delta",
      "run.tool.requested",
      "run.tool.completed",
      "run.completed",
    ]);
    expect(store.events[2]?.payloadJson).toMatchObject({
      query: "hello",
      requested_connector_ids: ["ctr_1"],
      retrieval_status: "applied",
      degraded: false,
      result_count: 1,
      citation_count: 1,
    });
    expect(runtimeBackend.lastInput?.messageText).toContain("Workspace context:");
    expect(runtimeBackend.lastInput?.messageText).toContain("[1] Probe (probe.txt)");
    expect(store.messages[0]?.citationsJson).toEqual([
      {
        connector_id: "ctr_1",
        connector_name: "Docs",
        document_id: "doc_1",
        document_version_id: "docv_1",
        chunk_id: "chk_1",
        title: "Probe",
        path_or_uri: "probe.txt",
        snippet: "hello from the docs",
        score: 0.9,
      },
    ]);
  });

  it("degrades honestly when retrieval finds no matching documents", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_1"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => ({
        query: "hello",
        results: [],
      }),
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(runtimeBackend.lastInput?.messageText).toContain(
      "No matching workspace documents were found in the selected connector scope for this turn.",
    );
    expect(runtimeBackend.lastInput?.messageText).toContain("User question:\nhello");
    expect(store.events[2]?.payloadJson).toMatchObject({
      query: "hello",
      requested_connector_ids: ["ctr_1"],
      retrieval_status: "no_results",
      degraded: true,
      result_count: 0,
      citation_count: 0,
    });
    expect(store.messages[0]?.citationsJson).toBeNull();
  });

  it("degrades honestly when retrieval fails before dispatch", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_1"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => {
        throw new Error("search backend unavailable");
      },
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(runtimeBackend.lastInput?.messageText).toContain(
      "Workspace retrieval was unavailable for this turn.",
    );
    expect(runtimeBackend.lastInput?.messageText).toContain("User question:\nhello");
    expect(store.events[2]?.payloadJson).toMatchObject({
      query: "hello",
      requested_connector_ids: ["ctr_1"],
      retrieval_status: "failed",
      degraded: true,
      result_count: 0,
      citation_count: 0,
      error: "search backend unavailable",
    });
    expect(store.messages[0]?.citationsJson).toBeNull();
  });

  it("persists each citation with all required retrieval-citation fields", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_1", "ctr_2"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => ({
        query: "hello",
        results: [
          {
            connector_id: "ctr_1",
            connector_name: "Handbook",
            document_id: "doc_10",
            document_version_id: "docv_10",
            chunk_id: "chk_10",
            title: "Onboarding Guide",
            path_or_uri: "handbook/onboarding.md",
            snippet: "Welcome to the team...",
            score: 0.95,
            content: "Welcome to the team. Here is how you get started.",
          },
          {
            connector_id: "ctr_2",
            connector_name: "Wiki",
            document_id: "doc_20",
            document_version_id: "docv_20",
            chunk_id: "chk_20",
            title: null,
            path_or_uri: "wiki/faq.md",
            snippet: "Frequently asked questions...",
            score: 0.72,
            content: "Frequently asked questions about the platform.",
          },
        ],
      }),
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    const citationsJson = store.messages[0]?.citationsJson as Array<Record<string, unknown>>;
    expect(citationsJson).toHaveLength(2);

    const expectedFields = [
      "connector_id",
      "connector_name",
      "document_id",
      "document_version_id",
      "chunk_id",
      "title",
      "path_or_uri",
      "snippet",
      "score",
    ];
    for (const citation of citationsJson) {
      for (const field of expectedFields) {
        expect(citation).toHaveProperty(field);
      }
      // content must be stripped from persisted citations
      expect(citation).not.toHaveProperty("content");
    }

    expect(citationsJson[0]).toMatchObject({
      connector_id: "ctr_1",
      connector_name: "Handbook",
      document_id: "doc_10",
      document_version_id: "docv_10",
      chunk_id: "chk_10",
      title: "Onboarding Guide",
      path_or_uri: "handbook/onboarding.md",
    });
    expect(citationsJson[1]).toMatchObject({
      connector_id: "ctr_2",
      connector_name: "Wiki",
      document_id: "doc_20",
      title: null,
      path_or_uri: "wiki/faq.md",
    });
  });

  it("emits retrieval.completed event with full citation array in payload", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_1"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => ({
        query: "hello",
        results: [
          {
            connector_id: "ctr_1",
            connector_name: "Docs",
            document_id: "doc_1",
            document_version_id: "docv_1",
            chunk_id: "chk_1",
            title: "Guide",
            path_or_uri: "guide.md",
            snippet: "snippet text",
            score: 0.88,
            content: "Full content here.",
          },
        ],
      }),
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    const retrievalCompletedEvent = store.events.find(
      (event) => event.eventType === "run.retrieval.completed",
    );
    expect(retrievalCompletedEvent).toBeDefined();

    const payload = retrievalCompletedEvent!.payloadJson;
    expect(payload).toMatchObject({
      query: "hello",
      requested_connector_ids: ["ctr_1"],
      retrieval_status: "applied",
      degraded: false,
      result_count: 1,
      citation_count: 1,
    });

    const citations = payload.citations as Array<Record<string, unknown>>;
    expect(citations).toHaveLength(1);
    expect(citations[0]).toMatchObject({
      connector_id: "ctr_1",
      document_id: "doc_1",
      snippet: "snippet text",
      score: 0.88,
    });
    // Event citations should also omit content
    expect(citations[0]).not.toHaveProperty("content");
  });

  it("emits retrieval.requested event with correct connector_ids and query", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_A", "ctr_B"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => ({
        query: "hello",
        results: [],
      }),
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    const requestedEvent = store.events.find(
      (event) => event.eventType === "run.retrieval.requested",
    );
    expect(requestedEvent).toBeDefined();
    expect(requestedEvent!.payloadJson).toEqual({
      connector_ids: ["ctr_A", "ctr_B"],
      query: "hello",
    });
  });

  it("skips retrieval entirely when connector scope is disabled", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: false,
        connector_ids: [],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    let retrievalCalled = false;
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => {
        retrievalCalled = true;
        return { query: "hello", results: [] };
      },
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(retrievalCalled).toBe(false);
    expect(store.events.find((e) => e.eventType === "run.retrieval.requested")).toBeUndefined();
    expect(store.events.find((e) => e.eventType === "run.retrieval.completed")).toBeUndefined();
    // Message text should be the raw input, not augmented
    expect(runtimeBackend.lastInput?.messageText).toBe("hello");
    expect(store.messages[0]?.citationsJson).toBeNull();
  });

  it("skips retrieval when connector scope is enabled but connector_ids is empty", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: [],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    let retrievalCalled = false;
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => {
        retrievalCalled = true;
        return { query: "hello", results: [] };
      },
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(retrievalCalled).toBe(false);
    expect(runtimeBackend.lastInput?.messageText).toBe("hello");
  });

  it("skips retrieval when no searchRetrieval function is provided", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_1"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      // searchRetrieval intentionally omitted
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(runtimeBackend.lastInput?.messageText).toBe("hello");
    expect(store.events.find((e) => e.eventType === "run.retrieval.requested")).toBeUndefined();
  });

  it("emits retrieval.completed with error field when retrieval throws a non-Error value", async () => {
    const store = new MemoryRunExecutionStore();
    store.snapshot = {
      ...store.snapshot,
      connectorScopeJson: {
        enabled: true,
        connector_ids: ["ctr_1"],
      },
    };
    const runtimeBackend = new FakeRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      searchRetrieval: async () => {
        throw "string error thrown";
      },
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    const completedEvent = store.events.find(
      (e) => e.eventType === "run.retrieval.completed",
    );
    expect(completedEvent!.payloadJson).toMatchObject({
      retrieval_status: "failed",
      error: "string error thrown",
    });
  });

  it("serializes concurrent runtime deltas without reusing run event sequences", async () => {
    const store = new MemoryRunExecutionStore();
    const runtimeBackend = new ConcurrentDeltaRuntimeBackend();
    const service = new RunExecutionService({
      store,
      runtimeBackend,
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const result = await service.execute({
      job_type: "run.execute",
      run_id: "run_1",
      workspace_id: "ws_1",
      attempt: 1,
      queued_at: "2026-03-10T12:00:00Z",
    });

    expect(result.outcome).toBe("completed");
    expect(store.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(
      store.events
        .filter((event) => event.eventType === "run.output.delta")
        .map((event) => event.payloadJson.delta),
    ).toEqual(["hello", " world"]);
    expect(store.messages[0]?.contentJson).toEqual([
      {
        type: "text",
        text: "hello world",
      },
    ]);
  });
});
