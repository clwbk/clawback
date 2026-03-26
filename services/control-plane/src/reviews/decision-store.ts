import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@clawback/db";
import { createReviewDecisionQueries } from "@clawback/db";

import type { ReviewDecisionStore, StoredReviewDecision } from "./decision-types.js";

type Db = NodePgDatabase<typeof schema>;

function rowToStored(
  row: Awaited<ReturnType<ReturnType<typeof createReviewDecisionQueries>["listByWorkspace"]>>[number],
): StoredReviewDecision {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    reviewId: row.reviewId,
    decision: row.decision,
    surface: row.surface,
    decidedByUserId: row.decidedByUserId,
    actorExternalId: row.actorExternalId,
    rationale: row.rationale,
    payloadJson: (row.payloadJson ?? {}) as Record<string, unknown>,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
  };
}

export class DrizzleReviewDecisionStore implements ReviewDecisionStore {
  private readonly queries: ReturnType<typeof createReviewDecisionQueries>;

  constructor(db: Db) {
    this.queries = createReviewDecisionQueries(db as any);
  }

  async findByReviewId(workspaceId: string, reviewId: string): Promise<StoredReviewDecision | null> {
    const row = await this.queries.findByReviewId(workspaceId, reviewId);
    return row ? rowToStored(row) : null;
  }

  async create(input: StoredReviewDecision): Promise<StoredReviewDecision> {
    const row = await this.queries.create({
      id: input.id,
      workspaceId: input.workspaceId,
      reviewId: input.reviewId,
      decision: input.decision,
      surface: input.surface,
      decidedByUserId: input.decidedByUserId,
      actorExternalId: input.actorExternalId,
      rationale: input.rationale,
      payloadJson: input.payloadJson,
      occurredAt: input.occurredAt,
      createdAt: input.createdAt,
    });
    return rowToStored(row);
  }
}
