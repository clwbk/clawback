import { and, asc, desc, eq, gt, max } from "drizzle-orm";

import {
  agentVersions,
  agents,
  auditEvents,
  conversations,
  createDb,
  messages,
  runEvents,
  runSnapshots,
  runs,
} from "@clawback/db";

import type {
  AgentConversationBinding,
  ConversationBundle,
  OrchestrationStore,
  StoredAgent,
  StoredAgentVersion,
  StoredAuditEvent,
  StoredConversation,
  StoredMessage,
  StoredRun,
  StoredRunEvent,
  StoredRunSnapshot,
} from "./types.js";

type ControlPlaneDb = ReturnType<typeof createDb>;

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toRecordArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function expectRow<T>(value: T | undefined, entity: string) {
  if (!value) {
    throw new Error(`Expected ${entity} to be returned.`);
  }

  return value;
}

function mapAgent(row: typeof agents.$inferSelect): StoredAgent {
  return row;
}

function mapAgentVersion(row: typeof agentVersions.$inferSelect): StoredAgentVersion {
  return {
    ...row,
    personaJson: toRecord(row.personaJson),
    modelRoutingJson: toRecord(row.modelRoutingJson),
    toolPolicyJson: toRecord(row.toolPolicyJson),
    connectorPolicyJson: toRecord(row.connectorPolicyJson),
  };
}

function mapConversation(row: typeof conversations.$inferSelect): StoredConversation {
  return row;
}

function mapMessage(row: typeof messages.$inferSelect): StoredMessage {
  return {
    ...row,
    contentJson: toRecordArray(row.contentJson),
    citationsJson: Array.isArray(row.citationsJson) ? row.citationsJson : null,
    tokenUsageJson: row.tokenUsageJson ? (toRecord(row.tokenUsageJson) as Record<string, number>) : null,
  };
}

function mapRun(row: typeof runs.$inferSelect): StoredRun {
  return row;
}

function mapRunSnapshot(row: typeof runSnapshots.$inferSelect): StoredRunSnapshot {
  return {
    ...row,
    agentSnapshotJson: toRecord(row.agentSnapshotJson),
    toolPolicyJson: toRecord(row.toolPolicyJson),
    connectorScopeJson: toRecord(row.connectorScopeJson),
    modelProfileJson: toRecord(row.modelProfileJson),
    actorSummaryJson: toRecord(row.actorSummaryJson),
    approvalPolicyJson: toRecord(row.approvalPolicyJson),
    conversationBindingJson: toRecord(row.conversationBindingJson),
    inputMessageJson: toRecord(row.inputMessageJson),
  };
}

function mapRunEvent(row: typeof runEvents.$inferSelect): StoredRunEvent {
  return {
    ...row,
    payloadJson: toRecord(row.payloadJson),
  };
}

export class DrizzleOrchestrationStore implements OrchestrationStore {
  constructor(private readonly db: ControlPlaneDb) {}

  async runInTransaction<T>(callback: (store: OrchestrationStore) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      const store = new DrizzleOrchestrationStore(tx as unknown as ControlPlaneDb);
      return await callback(store);
    });
  }

  async findAgentConversationBinding(workspaceId: string, agentId: string): Promise<AgentConversationBinding | null> {
    const agentRow = await this.db.query.agents.findFirst({
      where: and(eq(agents.workspaceId, workspaceId), eq(agents.id, agentId)),
    });

    if (!agentRow) {
      return null;
    }

    const publishedVersion = await this.db.query.agentVersions.findFirst({
      where: and(
        eq(agentVersions.workspaceId, workspaceId),
        eq(agentVersions.agentId, agentId),
        eq(agentVersions.status, "published"),
      ),
      orderBy: [desc(agentVersions.versionNumber)],
    });

    return {
      agent: mapAgent(agentRow),
      publishedVersion: publishedVersion ? mapAgentVersion(publishedVersion) : null,
    };
  }

  async listConversations(
    workspaceId: string,
    options: {
      agentId?: string;
      startedBy?: string;
    } = {},
  ) {
    const conditions = [eq(conversations.workspaceId, workspaceId)];

    if (options.agentId) {
      conditions.push(eq(conversations.agentId, options.agentId));
    }

    if (options.startedBy) {
      conditions.push(eq(conversations.startedBy, options.startedBy));
    }

    const rows = await this.db
      .select()
      .from(conversations)
      .where(and(...conditions))
      .orderBy(desc(conversations.updatedAt), desc(conversations.lastMessageAt), desc(conversations.createdAt));

    return rows.map(mapConversation);
  }

  async createConversation(input: Omit<StoredConversation, "channel" | "status" | "title"> & {
    channel?: "web";
    status?: "active" | "archived";
    title?: string | null;
  }) {
    const [row] = await this.db
      .insert(conversations)
      .values({
        ...input,
        channel: input.channel ?? "web",
        status: input.status ?? "active",
        title: input.title ?? null,
      })
      .returning();

    return mapConversation(expectRow(row, "conversation"));
  }

  async findConversationBundle(workspaceId: string, conversationId: string): Promise<ConversationBundle | null> {
    const conversation = await this.db.query.conversations.findFirst({
      where: and(eq(conversations.workspaceId, workspaceId), eq(conversations.id, conversationId)),
    });
    if (!conversation) {
      return null;
    }

    const agent = await this.db.query.agents.findFirst({
      where: and(eq(agents.workspaceId, workspaceId), eq(agents.id, conversation.agentId)),
    });
    const agentVersion = await this.db.query.agentVersions.findFirst({
      where: and(eq(agentVersions.workspaceId, workspaceId), eq(agentVersions.id, conversation.agentVersionId)),
    });

    if (!agent || !agentVersion) {
      return null;
    }

    return {
      conversation: mapConversation(conversation),
      agent: mapAgent(agent),
      agentVersion: mapAgentVersion(agentVersion),
    };
  }

  async listMessages(workspaceId: string, conversationId: string) {
    const rows = await this.db
      .select()
      .from(messages)
      .where(and(eq(messages.workspaceId, workspaceId), eq(messages.conversationId, conversationId)))
      .orderBy(asc(messages.sequence), asc(messages.createdAt));

    return rows.map(mapMessage);
  }

  async getNextMessageSequence(conversationId: string) {
    const [row] = await this.db
      .select({ maxSequence: max(messages.sequence) })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    return (row?.maxSequence ?? -1) + 1;
  }

  async createMessage(input: StoredMessage) {
    const [row] = await this.db.insert(messages).values(input).returning();
    return mapMessage(expectRow(row, "message"));
  }

  async touchConversation(conversationId: string, timestamp: Date) {
    await this.db
      .update(conversations)
      .set({
        lastMessageAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(conversations.id, conversationId));
  }

  async createRun(input: StoredRun) {
    const [row] = await this.db.insert(runs).values(input).returning();
    return mapRun(expectRow(row, "run"));
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "completedAt" | "currentStep" | "summary" | "updatedAt">>,
  ) {
    const [row] = await this.db.update(runs).set(patch).where(eq(runs.id, runId)).returning();
    return mapRun(expectRow(row, "run"));
  }

  async createRunSnapshot(input: StoredRunSnapshot) {
    const [row] = await this.db.insert(runSnapshots).values(input).returning();
    return mapRunSnapshot(expectRow(row, "run snapshot"));
  }

  async appendRunEvent(input: StoredRunEvent) {
    const [row] = await this.db
      .insert(runEvents)
      .values({
        id: input.id,
        workspaceId: input.workspaceId,
        runId: input.runId,
        eventType: input.eventType,
        sequence: input.sequence,
        actorType: input.actorType,
        actorId: input.actorId,
        payloadJson: input.payloadJson,
        occurredAt: input.occurredAt,
      })
      .returning();

    return mapRunEvent(expectRow(row, "run event"));
  }

  async appendAuditEvent(input: StoredAuditEvent) {
    await this.db.insert(auditEvents).values({
      id: input.id,
      workspaceId: input.workspaceId,
      actorType: input.actorType,
      actorId: input.actorId,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      payloadJson: input.payloadJson,
      occurredAt: input.occurredAt,
    });
  }

  async getRunEventsAfter(runId: string, afterSequence: number) {
    const rows = await this.db
      .select()
      .from(runEvents)
      .where(and(eq(runEvents.runId, runId), gt(runEvents.sequence, afterSequence)))
      .orderBy(asc(runEvents.sequence), asc(runEvents.createdAt));

    return rows.map(mapRunEvent);
  }

  async findRunById(workspaceId: string, runId: string) {
    const row = await this.db.query.runs.findFirst({
      where: and(eq(runs.workspaceId, workspaceId), eq(runs.id, runId)),
    });

    return row ? mapRun(row) : null;
  }
}
