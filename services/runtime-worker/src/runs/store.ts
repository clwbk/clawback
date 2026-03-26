import { and, eq, max } from "drizzle-orm";

import { conversations, createDb, messages, runEvents, runSnapshots, runs } from "@clawback/db";

import type {
  RunExecutionStore,
  StoredMessage,
  StoredRun,
  StoredRunEvent,
  StoredRunSnapshot,
} from "./types.js";

type RuntimeWorkerDb = ReturnType<typeof createDb>;

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function expectRow<T>(value: T | undefined, entity: string) {
  if (!value) {
    throw new Error(`Expected ${entity} row to be returned.`);
  }

  return value;
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

function mapMessage(row: typeof messages.$inferSelect): StoredMessage {
  return {
    ...row,
    contentJson: toArray(row.contentJson),
    citationsJson: Array.isArray(row.citationsJson) ? row.citationsJson : null,
    tokenUsageJson: row.tokenUsageJson ? (toRecord(row.tokenUsageJson) as Record<string, number>) : null,
  };
}

export class DrizzleRunExecutionStore implements RunExecutionStore {
  constructor(private readonly db: RuntimeWorkerDb) {}

  async getRunExecutionContext(workspaceId: string, runId: string) {
    const run = await this.db.query.runs.findFirst({
      where: and(eq(runs.workspaceId, workspaceId), eq(runs.id, runId)),
    });

    if (!run) {
      return null;
    }

    const snapshot = await this.db.query.runSnapshots.findFirst({
      where: and(eq(runSnapshots.workspaceId, workspaceId), eq(runSnapshots.runId, runId)),
    });

    if (!snapshot) {
      return null;
    }

    return {
      run: mapRun(run),
      snapshot: mapRunSnapshot(snapshot),
    };
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "startedAt" | "completedAt" | "currentStep" | "summary" | "updatedAt">>,
  ) {
    const [row] = await this.db.update(runs).set(patch).where(eq(runs.id, runId)).returning();
    return mapRun(expectRow(row, "run"));
  }

  async getMaxRunEventSequence(runId: string) {
    const [row] = await this.db
      .select({ maxSequence: max(runEvents.sequence) })
      .from(runEvents)
      .where(eq(runEvents.runId, runId));

    return row?.maxSequence ?? 0;
  }

  async appendRunEvent(event: StoredRunEvent) {
    await this.db.insert(runEvents).values({
      id: event.id,
      workspaceId: event.workspaceId,
      runId: event.runId,
      eventType: event.eventType,
      sequence: event.sequence,
      actorType: event.actorType,
      actorId: event.actorId,
      payloadJson: event.payloadJson,
      occurredAt: event.occurredAt,
    });
  }

  async getNextMessageSequence(conversationId: string) {
    const [row] = await this.db
      .select({ maxSequence: max(messages.sequence) })
      .from(messages)
      .where(eq(messages.conversationId, conversationId));

    return (row?.maxSequence ?? -1) + 1;
  }

  async createMessage(message: StoredMessage) {
    const [row] = await this.db.insert(messages).values(message).returning();
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
}
