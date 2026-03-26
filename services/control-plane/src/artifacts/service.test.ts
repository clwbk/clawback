import { describe, expect, it } from "vitest";

import type { SessionContext } from "@clawback/auth";
import type { TicketServiceContract } from "../tickets/index.js";
import { ArtifactService } from "./service.js";

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

const fakeTicketService: TicketServiceContract = {
  async listTickets() {
    return {
      tickets: [
        {
          id: "tkt_1",
          workspace_id: "ws_1",
          run_id: "run_1",
          approval_request_id: "apr_1",
          provider: "mock",
          status: "created",
          external_ref: "MOCK-2026-1",
          title: "Investigate checkout failover regression",
          summary: "Follow up on the March 9 incident.",
          body: { notes: ["Drafted by Incident Copilot"] },
          created_by: "usr_admin",
          created_at: "2026-03-11T12:00:00.000Z",
          updated_at: "2026-03-11T12:05:00.000Z",
        },
      ],
    };
  },
  async getTicket() {
    return {
      id: "tkt_1",
      workspace_id: "ws_1",
      run_id: "run_1",
      approval_request_id: "apr_1",
      provider: "mock",
      status: "created",
      external_ref: "MOCK-2026-1",
      title: "Investigate checkout failover regression",
      summary: "Follow up on the March 9 incident.",
      body: { notes: ["Drafted by Incident Copilot"] },
      created_by: "usr_admin",
      created_at: "2026-03-11T12:00:00.000Z",
      updated_at: "2026-03-11T12:05:00.000Z",
    };
  },
  async lookupTickets() {
    return [];
  },
  async createTicket() {
    return {
      id: "tkt_1",
      workspace_id: "ws_1",
      run_id: "run_1",
      approval_request_id: "apr_1",
      provider: "mock",
      status: "created",
      external_ref: "MOCK-2026-1",
      title: "Investigate checkout failover regression",
      summary: "Follow up on the March 9 incident.",
      body: { notes: ["Drafted by Incident Copilot"] },
      created_by: "usr_admin",
      created_at: "2026-03-11T12:00:00.000Z",
      updated_at: "2026-03-11T12:05:00.000Z",
    };
  },
};

describe("ArtifactService", () => {
  it("maps ticket records into generic artifacts", async () => {
    const service = new ArtifactService({
      ticketService: fakeTicketService,
    });

    const result = await service.listArtifacts(actor);
    expect(result.artifacts).toEqual([
      {
        id: "tkt_1",
        workspace_id: "ws_1",
        kind: "ticket",
        source_record_id: "tkt_1",
        source_provider: "mock",
        status: "created",
        title: "Investigate checkout failover regression",
        summary: "Follow up on the March 9 incident.",
        external_ref: "MOCK-2026-1",
        run_id: "run_1",
        review_request_id: "apr_1",
        created_at: "2026-03-11T12:00:00.000Z",
        updated_at: "2026-03-11T12:05:00.000Z",
      },
    ]);
  });

  it("returns artifact detail with body payload", async () => {
    const service = new ArtifactService({
      ticketService: fakeTicketService,
    });

    const result = await service.getArtifact(actor, "tkt_1");
    expect(result.artifact).toMatchObject({
      id: "tkt_1",
      kind: "ticket",
      body: {
        notes: ["Drafted by Incident Copilot"],
      },
    });
  });
});
