import { and, desc, eq, max } from "drizzle-orm";

import {
  approvalDecisions,
  approvalRequests,
  auditEvents,
  createDb,
  runEvents,
  runs,
} from "@clawback/db";

import type {
  ApprovalStore,
  StoredApprovalDecision,
  StoredApprovalRequest,
  StoredAuditEvent,
  StoredRun,
  StoredRunEvent,
} from "./types.js";

type ControlPlaneDb = ReturnType<typeof createDb>;

function toRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function expectRow<T>(value: T | undefined, entity: string) {
  if (!value) {
    throw new Error(`Expected ${entity} row to be returned.`);
  }

  return value;
}

function mapApprovalRequest(row: typeof approvalRequests.$inferSelect): StoredApprovalRequest {
  return {
    ...row,
    approverScopeJson: toRecord(row.approverScopeJson),
    requestPayloadJson: toRecord(row.requestPayloadJson),
  };
}

function mapApprovalDecision(row: typeof approvalDecisions.$inferSelect): StoredApprovalDecision {
  return {
    ...row,
    payloadJson: toRecord(row.payloadJson),
  };
}

function mapRun(row: typeof runs.$inferSelect): StoredRun {
  return row;
}

export class DrizzleApprovalStore implements ApprovalStore {
  constructor(private readonly db: ControlPlaneDb) {}

  async runInTransaction<T>(callback: (store: ApprovalStore) => Promise<T>): Promise<T> {
    return await this.db.transaction(async (tx) => {
      const store = new DrizzleApprovalStore(tx as unknown as ControlPlaneDb);
      return await callback(store);
    });
  }

  async listApprovalRequests(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.workspaceId, workspaceId))
      .orderBy(desc(approvalRequests.createdAt), desc(approvalRequests.updatedAt));

    return rows.map(mapApprovalRequest);
  }

  async findApprovalRequest(workspaceId: string, approvalId: string) {
    const row = await this.db.query.approvalRequests.findFirst({
      where: and(
        eq(approvalRequests.workspaceId, workspaceId),
        eq(approvalRequests.id, approvalId),
      ),
    });

    return row ? mapApprovalRequest(row) : null;
  }

  async listApprovalDecisions(workspaceId: string, approvalId: string) {
    const rows = await this.db
      .select()
      .from(approvalDecisions)
      .where(
        and(
          eq(approvalDecisions.workspaceId, workspaceId),
          eq(approvalDecisions.approvalRequestId, approvalId),
        ),
      )
      .orderBy(desc(approvalDecisions.occurredAt), desc(approvalDecisions.createdAt));

    return rows.map(mapApprovalDecision);
  }

  async updateApprovalRequest(
    approvalId: string,
    patch: Partial<
      Pick<StoredApprovalRequest, "status" | "resolvedAt" | "updatedAt" | "requestPayloadJson">
    >,
  ) {
    const [row] = await this.db
      .update(approvalRequests)
      .set(patch)
      .where(eq(approvalRequests.id, approvalId))
      .returning();

    return mapApprovalRequest(expectRow(row, "approval request"));
  }

  async createApprovalDecision(input: StoredApprovalDecision) {
    const [row] = await this.db.insert(approvalDecisions).values(input).returning();
    return mapApprovalDecision(expectRow(row, "approval decision"));
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "currentStep" | "updatedAt">>,
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

  async appendAuditEvent(event: StoredAuditEvent) {
    await this.db.insert(auditEvents).values({
      id: event.id,
      workspaceId: event.workspaceId,
      actorType: event.actorType,
      actorId: event.actorId,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.targetId,
      summary: event.summary,
      payloadJson: event.payloadJson,
      occurredAt: event.occurredAt,
    });
  }
}
