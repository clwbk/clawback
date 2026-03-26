import { artifactListResponseSchema, getArtifactResponseSchema } from "@clawback/contracts";

import type { TicketServiceContract } from "../tickets/index.js";
import type { ArtifactServiceContract } from "./types.js";

type ArtifactServiceOptions = {
  ticketService: TicketServiceContract;
};

type TicketListItem = Awaited<ReturnType<TicketServiceContract["listTickets"]>>["tickets"][number];

function mapTicketToArtifact(ticket: TicketListItem) {
  return {
    id: ticket.id,
    workspace_id: ticket.workspace_id,
    kind: "ticket" as const,
    source_record_id: ticket.id,
    source_provider: ticket.provider,
    status: ticket.status,
    title: ticket.title,
    summary: ticket.summary,
    external_ref: ticket.external_ref,
    run_id: ticket.run_id,
    review_request_id: ticket.approval_request_id,
    created_at: ticket.created_at,
    updated_at: ticket.updated_at,
  };
}

export class ArtifactService implements ArtifactServiceContract {
  constructor(private readonly options: ArtifactServiceOptions) {}

  async listArtifacts(actor: Parameters<TicketServiceContract["listTickets"]>[0]) {
    const tickets = await this.options.ticketService.listTickets(actor);
    return artifactListResponseSchema.parse({
      artifacts: tickets.tickets.map((ticket) => mapTicketToArtifact(ticket)),
    });
  }

  async getArtifact(
    actor: Parameters<TicketServiceContract["getTicket"]>[0],
    artifactId: string,
  ) {
    const ticket = await this.options.ticketService.getTicket(actor, artifactId);
    return getArtifactResponseSchema.parse({
      artifact: {
        ...mapTicketToArtifact(ticket),
        body: ticket.body,
      },
    });
  }
}
