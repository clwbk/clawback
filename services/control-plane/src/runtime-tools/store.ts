import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";

import {
  approvalDecisions,
  approvalRequests,
  auditEvents,
  createDb,
  runEvents,
  runSnapshots,
  runs,
  ticketRecords,
} from "@clawback/db";

import type {
  RuntimeToolStore,
  StoredApprovalDecision,
  StoredApprovalRequest,
  StoredAuditEvent,
  StoredRun,
  StoredRunEvent,
  StoredTicketRecord,
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

function mapRun(row: typeof runs.$inferSelect): StoredRun {
  return row;
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

function mapTicket(row: typeof ticketRecords.$inferSelect): StoredTicketRecord {
  return {
    ...row,
    bodyJson: toRecord(row.bodyJson),
  };
}

export class DrizzleRuntimeToolStore implements RuntimeToolStore {
  constructor(private readonly db: ControlPlaneDb) {}

  async findActiveRunBySessionKey(sessionKey: string) {
    const rows = await this.db
      .select({
        run: runs,
      })
      .from(runs)
      .innerJoin(runSnapshots, eq(runSnapshots.runId, runs.id))
      .where(
        and(
          sql`lower(${runSnapshots.conversationBindingJson} ->> 'runtime_session_key') = ${sessionKey.toLowerCase()}`,
          or(eq(runs.status, "running"), eq(runs.status, "waiting_for_approval")),
        ),
      )
      .orderBy(desc(runs.updatedAt), desc(runs.createdAt))
      .limit(1);

    return rows[0]?.run ? mapRun(rows[0].run) : null;
  }

  async getMaxRunEventSequence(runId: string) {
    const rows = await this.db
      .select({ sequence: runEvents.sequence })
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(desc(runEvents.sequence))
      .limit(1);

    return rows[0]?.sequence ?? 0;
  }

  async appendRunEvent(input: StoredRunEvent) {
    await this.db.insert(runEvents).values({
      id: input.id,
      workspaceId: input.workspaceId,
      runId: input.runId,
      eventType: input.eventType,
      sequence: input.sequence,
      actorType: input.actorType,
      actorId: input.actorId,
      payloadJson: input.payloadJson,
      occurredAt: input.occurredAt,
    });
  }

  async updateRun(
    runId: string,
    patch: Partial<Pick<StoredRun, "status" | "currentStep" | "updatedAt">>,
  ) {
    const [row] = await this.db.update(runs).set(patch).where(eq(runs.id, runId)).returning();
    return mapRun(expectRow(row, "run"));
  }

  async searchTickets(input: { workspaceId: string; query?: string; limit?: number }) {
    const limit = Math.max(1, Math.min(input.limit ?? 5, 20));
    const normalizedQuery = input.query?.trim();

    const rows = await this.db
      .select()
      .from(ticketRecords)
      .where(
        and(
          eq(ticketRecords.workspaceId, input.workspaceId),
          normalizedQuery
            ? or(
                ilike(ticketRecords.title, `%${normalizedQuery}%`),
                ilike(ticketRecords.summary, `%${normalizedQuery}%`),
                sql`${ticketRecords.bodyJson}::text ILIKE ${`%${normalizedQuery}%`}`,
              )
            : undefined,
        ),
      )
      .orderBy(desc(ticketRecords.updatedAt), desc(ticketRecords.createdAt))
      .limit(limit);

    return rows.map(mapTicket);
  }

  async createTicket(input: StoredTicketRecord) {
    const [row] = await this.db.insert(ticketRecords).values(input).returning();
    return mapTicket(expectRow(row, "ticket"));
  }

  async findApprovalRequestByRunToolInvocation(runId: string, toolInvocationId: string) {
    const row = await this.db.query.approvalRequests.findFirst({
      where: and(
        eq(approvalRequests.runId, runId),
        eq(approvalRequests.toolInvocationId, toolInvocationId),
      ),
    });

    return row ? mapApprovalRequest(row) : null;
  }

  async findApprovalRequestById(approvalId: string) {
    const row = await this.db.query.approvalRequests.findFirst({
      where: eq(approvalRequests.id, approvalId),
    });

    return row ? mapApprovalRequest(row) : null;
  }

  async findApprovalDecisionByApprovalId(approvalId: string) {
    const rows = await this.db
      .select()
      .from(approvalDecisions)
      .where(eq(approvalDecisions.approvalRequestId, approvalId))
      .orderBy(desc(approvalDecisions.occurredAt), desc(approvalDecisions.createdAt))
      .limit(1);

    return rows[0] ? mapApprovalDecision(rows[0]) : null;
  }

  async createApprovalRequest(input: StoredApprovalRequest) {
    const [row] = await this.db.insert(approvalRequests).values(input).returning();
    return mapApprovalRequest(expectRow(row, "approval request"));
  }

  async findTicketByApprovalRequest(approvalRequestId: string) {
    const rows = await this.db
      .select()
      .from(ticketRecords)
      .where(eq(ticketRecords.approvalRequestId, approvalRequestId))
      .orderBy(asc(ticketRecords.createdAt))
      .limit(1);

    return rows[0] ? mapTicket(rows[0]) : null;
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
}
