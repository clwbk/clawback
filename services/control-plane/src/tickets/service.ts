import {
  getTicketResponseSchema,
  ticketListResponseSchema,
  ticketLookupResultSchema,
  ticketRecordSchema,
} from "@clawback/contracts";
import { AuthServiceError, type SessionContext } from "@clawback/auth";
import { createClawbackId } from "@clawback/domain";

import type {
  CreateTicketInput,
  StoredTicketRecord,
  TicketLookupInput,
  TicketServiceContract,
  TicketStore,
} from "./types.js";

type TicketServiceOptions = {
  store: TicketStore;
  now?: () => Date;
};

export class TicketService implements TicketServiceContract {
  private readonly now: () => Date;

  constructor(private readonly options: TicketServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async listTickets(actor: SessionContext) {
    this.assertAdmin(actor);
    const tickets = await this.options.store.listTickets(actor.workspace.id);
    return ticketListResponseSchema.parse({
      tickets: tickets.map((ticket) => this.toTicketView(ticket)),
    });
  }

  async getTicket(actor: SessionContext, ticketId: string) {
    this.assertAdmin(actor);
    const ticket = await this.getRequiredTicket(actor.workspace.id, ticketId);
    return getTicketResponseSchema.parse(this.toTicketView(ticket));
  }

  async lookupTickets(input: TicketLookupInput) {
    const tickets = await this.options.store.searchTickets(input);
    return tickets.map((ticket) =>
      ticketLookupResultSchema.parse({
        id: ticket.id,
        title: ticket.title,
        summary: ticket.summary,
        status: ticket.status,
        notes: Array.isArray(ticket.bodyJson.notes)
          ? ticket.bodyJson.notes.filter((value): value is string => typeof value === "string")
          : [],
        updated_at: ticket.updatedAt.toISOString(),
      }),
    );
  }

  async createTicket(input: CreateTicketInput) {
    const now = this.now();
    const record = await this.options.store.createTicket({
      id: createClawbackId("tkt"),
      workspaceId: input.workspaceId,
      runId: input.runId ?? null,
      approvalRequestId: input.approvalRequestId ?? null,
      provider: input.provider ?? "mock",
      status: input.status ?? "created",
      externalRef: input.externalRef ?? `MOCK-${now.getUTCFullYear()}-${Math.floor(now.getTime() / 1000)}`,
      title: input.title,
      summary: input.summary,
      bodyJson: input.body,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    });

    return ticketRecordSchema.parse(this.toTicketView(record));
  }

  private assertAdmin(actor: SessionContext) {
    if (actor.membership.role !== "admin") {
      throw new AuthServiceError({
        code: "forbidden",
        message: "Admin access is required.",
        statusCode: 403,
      });
    }
  }

  private async getRequiredTicket(workspaceId: string, ticketId: string) {
    const ticket = await this.options.store.findTicket(workspaceId, ticketId);
    if (!ticket) {
      throw new AuthServiceError({
        code: "ticket_not_found",
        message: "Ticket not found.",
        statusCode: 404,
      });
    }

    return ticket;
  }

  private toTicketView(ticket: StoredTicketRecord) {
    return {
      id: ticket.id,
      workspace_id: ticket.workspaceId,
      run_id: ticket.runId,
      approval_request_id: ticket.approvalRequestId,
      provider: ticket.provider,
      status: ticket.status,
      external_ref: ticket.externalRef,
      title: ticket.title,
      summary: ticket.summary,
      body: ticket.bodyJson,
      created_by: ticket.createdBy,
      created_at: ticket.createdAt.toISOString(),
      updated_at: ticket.updatedAt.toISOString(),
    };
  }
}
