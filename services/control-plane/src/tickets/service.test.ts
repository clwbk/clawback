import { describe, expect, it } from "vitest";

import type { SessionContext } from "@clawback/auth";

import { TicketService } from "./service.js";
import type { StoredTicketRecord, TicketStore } from "./types.js";

class MemoryTicketStore implements TicketStore {
  tickets: StoredTicketRecord[] = [
    {
      id: "tkt_1",
      workspaceId: "ws_1",
      runId: null,
      approvalRequestId: null,
      provider: "mock",
      status: "created",
      externalRef: "MOCK-2026-1",
      title: "Investigate checkout failover regression",
      summary: "Follow up on the March 9 incident.",
      bodyJson: {
        notes: ["Prior incident on March 9", "Runbook updated"],
      },
      createdBy: "usr_admin",
      createdAt: new Date("2026-03-11T12:00:00Z"),
      updatedAt: new Date("2026-03-11T12:00:00Z"),
    },
  ];

  async listTickets(workspaceId: string) {
    return this.tickets.filter((ticket) => ticket.workspaceId === workspaceId);
  }

  async findTicket(workspaceId: string, ticketId: string) {
    return (
      this.tickets.find((ticket) => ticket.workspaceId === workspaceId && ticket.id === ticketId) ??
      null
    );
  }

  async searchTickets(input: { workspaceId: string; query?: string; limit?: number }) {
    const limit = input.limit ?? 5;
    return this.tickets
      .filter((ticket) => ticket.workspaceId === input.workspaceId)
      .filter((ticket) =>
        input.query
          ? [ticket.title, ticket.summary, JSON.stringify(ticket.bodyJson)]
              .join(" ")
              .toLowerCase()
              .includes(input.query.toLowerCase())
          : true,
      )
      .slice(0, limit);
  }

  async createTicket(input: StoredTicketRecord) {
    this.tickets.push(input);
    return input;
  }
}

const actor: SessionContext = {
  session: {
    id: "ses_1",
    workspaceId: "ws_1",
    userId: "usr_admin",
    tokenHash: "hash",
    expiresAt: new Date("2026-03-12T12:00:00Z"),
    revokedAt: null,
    lastSeenAt: new Date("2026-03-11T12:00:00Z"),
    createdAt: new Date("2026-03-11T12:00:00Z"),
  },
  user: {
    id: "usr_admin",
    email: "admin@example.com",
    normalizedEmail: "admin@example.com",
    displayName: "Admin",
    kind: "human",
    status: "active",
    createdAt: new Date("2026-03-11T12:00:00Z"),
    updatedAt: new Date("2026-03-11T12:00:00Z"),
  },
  workspace: {
    id: "ws_1",
    slug: "acme",
    name: "Acme",
    status: "active",
    settingsJson: {},
    createdAt: new Date("2026-03-11T12:00:00Z"),
    updatedAt: new Date("2026-03-11T12:00:00Z"),
  },
  membership: {
    workspaceId: "ws_1",
    userId: "usr_admin",
    role: "admin",
    createdAt: new Date("2026-03-11T12:00:00Z"),
  },
};

describe("TicketService", () => {
  it("lists admin-visible mock tickets", async () => {
    const service = new TicketService({
      store: new MemoryTicketStore(),
    });

    const result = await service.listTickets(actor);
    expect(result.tickets).toHaveLength(1);
    expect(result.tickets[0]!.external_ref).toBe("MOCK-2026-1");
  });

  it("creates a persisted mock ticket record", async () => {
    const service = new TicketService({
      store: new MemoryTicketStore(),
      now: () => new Date("2026-03-11T12:05:00Z"),
    });

    const result = await service.createTicket({
      workspaceId: "ws_1",
      title: "Create follow-up ticket",
      summary: "Capture the incident follow-up work.",
      body: {
        notes: ["Drafted by Incident Copilot"],
      },
      createdBy: "usr_admin",
    });

    expect(result.provider).toBe("mock");
    expect(result.status).toBe("created");
    expect(result.external_ref).toMatch(/^MOCK-2026-/);
  });
});
