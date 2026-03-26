/**
 * Drizzle-based adapters that implement the inbound email service dependency interfaces.
 *
 * These bridge the generic db query helpers (from @clawback/db) to the narrow
 * contracts defined in ./types.ts so InboundEmailService stays decoupled from Drizzle.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { createSourceEventQueries, createInputRouteQueries } from "@clawback/db";
import type * as schema from "@clawback/db";

import type {
  InputRouteLookup,
  InputRouteWithWorker,
  SourceEventStore,
  StoredSourceEvent,
  WorkerLookup,
  WorkerSummary,
} from "./types.js";
import type { WorkerTriageRecord } from "@clawback/contracts";

type Db = NodePgDatabase<typeof schema>;

// ---------------------------------------------------------------------------
// SourceEventStore adapter
// ---------------------------------------------------------------------------

export class DrizzleSourceEventStoreAdapter implements SourceEventStore {
  private readonly queries: ReturnType<typeof createSourceEventQueries>;

  constructor(db: Db) {
    this.queries = createSourceEventQueries(db as any);
  }

  async findByExternalMessageId(
    workspaceId: string,
    externalMessageId: string,
  ): Promise<StoredSourceEvent | null> {
    const row = await this.queries.findByExternalMessageId(workspaceId, externalMessageId);
    return row ? this.toStored(row) : null;
  }

  async create(input: StoredSourceEvent): Promise<StoredSourceEvent> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      workerId: input.workerId,
      inputRouteId: input.inputRouteId,
      kind: input.kind,
      externalMessageId: input.externalMessageId,
      fromAddress: input.fromAddress,
      toAddress: input.toAddress,
      subject: input.subject,
      bodyText: input.bodyText,
      bodyHtml: input.bodyHtml,
      attachmentsJson: input.attachmentsJson,
      rawPayloadJson: input.rawPayloadJson,
      triageJson: input.triageJson ?? null,
      createdAt: input.createdAt,
    });
    return this.toStored(row);
  }

  private toStored(row: Awaited<ReturnType<typeof this.queries.create>>): StoredSourceEvent {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      workerId: row.workerId,
      inputRouteId: row.inputRouteId,
      kind: row.kind,
      externalMessageId: row.externalMessageId,
      fromAddress: row.fromAddress,
      toAddress: row.toAddress,
      subject: row.subject,
      bodyText: row.bodyText,
      bodyHtml: row.bodyHtml,
      attachmentsJson: (row.attachmentsJson ?? []) as unknown[],
      rawPayloadJson: (row.rawPayloadJson ?? {}) as Record<string, unknown>,
      triageJson: (row.triageJson ?? null) as WorkerTriageRecord | null,
      createdAt: row.createdAt,
    };
  }
}

// ---------------------------------------------------------------------------
// InputRouteLookup adapter
// ---------------------------------------------------------------------------

export class DrizzleInputRouteLookupAdapter implements InputRouteLookup {
  private readonly queries: ReturnType<typeof createInputRouteQueries>;

  constructor(db: Db) {
    this.queries = createInputRouteQueries(db as any);
  }

  async findByAddress(address: string): Promise<InputRouteWithWorker | null> {
    const row = await this.queries.findByAddress(address);
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      workerId: row.workerId,
      kind: row.kind,
      address: row.address ?? "",
    };
  }
}

// ---------------------------------------------------------------------------
// WorkerLookup adapter (wraps the WorkerService store)
// ---------------------------------------------------------------------------

import type { WorkerStore } from "../../workers/types.js";

export class WorkerStoreLookupAdapter implements WorkerLookup {
  constructor(private readonly store: WorkerStore) {}

  async findById(workspaceId: string, id: string): Promise<WorkerSummary | null> {
    const worker = await this.store.findById(workspaceId, id);
    if (!worker) return null;
    return {
      id: worker.id,
      workspaceId: worker.workspaceId,
      slug: worker.slug,
      name: worker.name,
      kind: worker.kind,
      assigneeIds: worker.assigneeIds,
      reviewerIds: worker.reviewerIds,
    };
  }
}
