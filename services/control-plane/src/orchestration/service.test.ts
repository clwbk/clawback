import { describe, expect, it } from "vitest";

import type { SessionContext } from "@clawback/auth";

import { ConversationRunService } from "./service.js";
import type {
  AgentConversationBinding,
  ConversationBundle,
  OrchestrationStore,
  RunQueue,
  StoredAuditEvent,
  StoredConversation,
  StoredMessage,
  StoredRun,
  StoredRunEvent,
  StoredRunSnapshot,
} from "./types.js";

class MemoryQueue implements RunQueue {
  jobs: Array<Record<string, unknown>> = [];

  async enqueueRun(job: Record<string, unknown>) {
    this.jobs.push(job);
  }
}

class MemoryStore implements OrchestrationStore {
  binding: AgentConversationBinding = {
    agent: {
      id: "agt_1",
      workspaceId: "ws_1",
      name: "Support Assistant",
      slug: "support-assistant",
      scope: "shared",
      ownerUserId: null,
      status: "active",
      createdBy: "usr_admin",
      createdAt: new Date("2026-03-10T12:00:00Z"),
      updatedAt: new Date("2026-03-10T12:00:00Z"),
    },
    publishedVersion: {
      id: "agtv_1",
      workspaceId: "ws_1",
      agentId: "agt_1",
      versionNumber: 1,
      status: "published",
      personaJson: {},
      instructionsMarkdown: "Answer clearly.",
      modelRoutingJson: {
        provider: "openai-compatible",
        model: "gpt-4.1-mini",
      },
      toolPolicyJson: {
        mode: "allow_list",
        allowed_tools: [],
      },
      connectorPolicyJson: {
        enabled: false,
        connector_ids: [],
      },
      createdBy: "usr_admin",
      createdAt: new Date("2026-03-10T12:00:00Z"),
      publishedAt: new Date("2026-03-10T12:00:00Z"),
    },
  };

  conversations: StoredConversation[] = [];
  messages: StoredMessage[] = [];
  runs: StoredRun[] = [];
  snapshots: StoredRunSnapshot[] = [];
  runEvents: StoredRunEvent[] = [];
  auditEvents: StoredAuditEvent[] = [];

  async runInTransaction<T>(callback: (store: OrchestrationStore) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async findAgentConversationBinding() {
    return this.binding;
  }

  async listConversations(
    _workspaceId: string,
    options: {
      agentId?: string;
      startedBy?: string;
    } = {},
  ) {
    return this.conversations.filter((entry) => {
      if (options.agentId && entry.agentId !== options.agentId) {
        return false;
      }

      if (options.startedBy && entry.startedBy !== options.startedBy) {
        return false;
      }

      return true;
    });
  }

  async createConversation(input: StoredConversation) {
    const created = {
      ...input,
      channel: input.channel ?? "web",
      status: input.status ?? "active",
      title: input.title ?? null,
    };
    this.conversations.push(created);
    return created;
  }

  async findConversationBundle(_workspaceId: string, conversationId: string) {
    const conversation = this.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) {
      return null;
    }

    return {
      conversation,
      agent: this.binding.agent,
      agentVersion: this.binding.publishedVersion!,
    } satisfies ConversationBundle;
  }

  async listMessages(_workspaceId: string, conversationId: string) {
    return this.messages.filter((entry) => entry.conversationId === conversationId);
  }

  async getNextMessageSequence(conversationId: string) {
    const existing = this.messages.filter((entry) => entry.conversationId === conversationId);
    return existing.length;
  }

  async createMessage(input: StoredMessage) {
    this.messages.push(input);
    return input;
  }

  async touchConversation(conversationId: string, timestamp: Date) {
    const conversation = this.conversations.find((entry) => entry.id === conversationId);
    if (!conversation) {
      throw new Error("conversation not found");
    }

    conversation.lastMessageAt = timestamp;
    conversation.updatedAt = timestamp;
  }

  async createRun(input: StoredRun) {
    this.runs.push(input);
    return input;
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "completedAt" | "currentStep" | "summary" | "updatedAt">>,
  ) {
    const run = this.runs.find((entry) => entry.id === runId);
    if (!run) {
      throw new Error("run not found");
    }

    Object.assign(run, patch);
    return run;
  }

  async createRunSnapshot(input: StoredRunSnapshot) {
    this.snapshots.push(input);
    return input;
  }

  async appendRunEvent(input: StoredRunEvent) {
    this.runEvents.push(input);
    return input;
  }

  async appendAuditEvent(input: StoredAuditEvent) {
    this.auditEvents.push(input);
  }

  async getRunEventsAfter(runId: string, afterSequence: number) {
    return this.runEvents.filter((entry) => entry.runId === runId && entry.sequence > afterSequence);
  }

  async findRunById(_workspaceId: string, runId: string) {
    return this.runs.find((entry) => entry.id === runId) ?? null;
  }
}

const actor: SessionContext = {
  session: {
    id: "ses_1",
    workspaceId: "ws_1",
    userId: "usr_admin",
    tokenHash: "hash",
    expiresAt: new Date("2026-03-11T12:00:00Z"),
    revokedAt: null,
    lastSeenAt: new Date("2026-03-10T12:00:00Z"),
    createdAt: new Date("2026-03-10T12:00:00Z"),
  },
  user: {
    id: "usr_admin",
    email: "admin@example.com",
    normalizedEmail: "admin@example.com",
    displayName: "Admin",
    kind: "human",
    status: "active",
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  },
  workspace: {
    id: "ws_1",
    slug: "acme",
    name: "Acme",
    status: "active",
    settingsJson: {},
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  },
  membership: {
    workspaceId: "ws_1",
    userId: "usr_admin",
    role: "admin",
    createdAt: new Date("2026-03-10T12:00:00Z"),
  },
};

describe("ConversationRunService", () => {
  it("creates a conversation pinned to the published agent version", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const service = new ConversationRunService({
      store,
      queue,
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const conversation = await service.createConversation(actor, {
      agent_id: "agt_1",
    });

    expect(conversation.agent_version_id).toBe("agtv_1");
    expect(store.conversations).toHaveLength(1);
  });

  it("persists the input message, snapshot, and queue job when creating a run", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const service = new ConversationRunService({
      store,
      queue,
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    await service.createConversation(actor, {
      agent_id: "agt_1",
    });

    const response = await service.createRun(actor, {
      conversation_id: store.conversations[0]!.id,
      input: {
        type: "text",
        text: "hello world",
      },
    });

    expect(response.run_id).toMatch(/^run_/);
    expect(response.stream_url).toContain(response.run_id);
    expect(store.messages).toHaveLength(1);
    expect(store.snapshots).toHaveLength(1);
    expect(store.conversations[0]?.lastMessageAt.toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(store.runEvents.map((event) => event.eventType)).toEqual([
      "run.created",
      "run.snapshot.created",
    ]);
    expect(queue.jobs).toHaveLength(1);
  });

  it("lists conversations and run records through persisted state", async () => {
    const store = new MemoryStore();
    const queue = new MemoryQueue();
    const service = new ConversationRunService({
      store,
      queue,
      now: () => new Date("2026-03-10T12:00:00Z"),
    });

    const conversation = await service.createConversation(actor, {
      agent_id: "agt_1",
    });

    const run = await service.createRun(actor, {
      conversation_id: conversation.id,
      input: {
        type: "text",
        text: "hello world",
      },
    });

    const listed = await service.listConversations(actor, {
      agent_id: "agt_1",
    });

    expect(listed.conversations).toHaveLength(1);
    expect(listed.conversations[0]?.id).toBe(conversation.id);

    const runRecord = await service.getRun(actor, run.run_id);
    expect(runRecord.conversation_id).toBe(conversation.id);

    const events = await service.listRunEvents(actor, run.run_id);
    expect(events).toHaveLength(2);
    expect(events[0]?.event_type).toBe("run.created");
  });
});
