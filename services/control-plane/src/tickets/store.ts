import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { createDb, ticketRecords } from "@clawback/db";

import type {
  StoredTicketRecord,
  TicketLookupInput,
  TicketStore,
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

function mapTicket(row: typeof ticketRecords.$inferSelect): StoredTicketRecord {
  return {
    ...row,
    bodyJson: toRecord(row.bodyJson),
  };
}

export class DrizzleTicketStore implements TicketStore {
  constructor(private readonly db: ControlPlaneDb) {}

  async listTickets(workspaceId: string) {
    const rows = await this.db
      .select()
      .from(ticketRecords)
      .where(eq(ticketRecords.workspaceId, workspaceId))
      .orderBy(desc(ticketRecords.createdAt), desc(ticketRecords.updatedAt));

    return rows.map(mapTicket);
  }

  async findTicket(workspaceId: string, ticketId: string) {
    const row = await this.db.query.ticketRecords.findFirst({
      where: and(eq(ticketRecords.workspaceId, workspaceId), eq(ticketRecords.id, ticketId)),
    });

    return row ? mapTicket(row) : null;
  }

  async searchTickets(input: TicketLookupInput) {
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
}
