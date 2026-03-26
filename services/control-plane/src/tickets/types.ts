import type { z } from "zod";

import type {
  getTicketResponseSchema,
  ticketListResponseSchema,
  ticketLookupResultSchema,
  ticketRecordSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

export type StoredTicketRecord = {
  id: string;
  workspaceId: string;
  runId: string | null;
  approvalRequestId: string | null;
  provider: "mock";
  status: "draft" | "created" | "failed";
  externalRef: string | null;
  title: string;
  summary: string;
  bodyJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export interface TicketLookupInput {
  workspaceId: string;
  query?: string;
  limit?: number;
}

export interface CreateTicketInput {
  workspaceId: string;
  runId?: string | null;
  approvalRequestId?: string | null;
  provider?: "mock";
  status?: "draft" | "created" | "failed";
  externalRef?: string | null;
  title: string;
  summary: string;
  body: Record<string, unknown>;
  createdBy?: string | null;
}

export interface TicketStore {
  listTickets(workspaceId: string): Promise<StoredTicketRecord[]>;
  findTicket(workspaceId: string, ticketId: string): Promise<StoredTicketRecord | null>;
  searchTickets(input: TicketLookupInput): Promise<StoredTicketRecord[]>;
  createTicket(input: StoredTicketRecord): Promise<StoredTicketRecord>;
}

export type TicketRecordView = z.infer<typeof ticketRecordSchema>;
export type TicketListView = z.infer<typeof ticketListResponseSchema>;
export type GetTicketView = z.infer<typeof getTicketResponseSchema>;
export type TicketLookupResultView = z.infer<typeof ticketLookupResultSchema>;

export interface TicketServiceContract {
  listTickets(actor: SessionContext): Promise<TicketListView>;
  getTicket(actor: SessionContext, ticketId: string): Promise<GetTicketView>;
  lookupTickets(input: TicketLookupInput): Promise<TicketLookupResultView[]>;
  createTicket(input: CreateTicketInput): Promise<TicketRecordView>;
}
