import { describe, expect, it } from "vitest";

import type { SessionContext } from "@clawback/auth";
import type { ApprovalServiceContract } from "../approvals/index.js";
import type { TicketServiceContract } from "../tickets/index.js";
import { ActionService } from "./service.js";

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

const approvalRecord = {
  id: "apr_1",
  workspace_id: "ws_1",
  run_id: "run_1",
  tool_invocation_id: "tool_1",
  tool_name: "create_ticket",
  action_type: "ticket.create",
  risk_class: "approval_gated" as const,
  status: "approved" as const,
  requested_by: "usr_admin",
  approver_scope: {
    mode: "workspace_admin" as const,
    allowed_roles: ["admin" as const],
  },
  request_payload: {
    title: "Investigate checkout failover regression",
    summary: "Follow up on the March 9 incident.",
  },
  decision_due_at: null,
  resolved_at: "2026-03-11T12:06:00.000Z",
  created_at: "2026-03-11T12:00:00.000Z",
  updated_at: "2026-03-11T12:06:00.000Z",
};

const ticketRecord = {
  id: "tkt_1",
  workspace_id: "ws_1",
  run_id: "run_1",
  approval_request_id: "apr_1",
  provider: "mock" as const,
  status: "created" as const,
  external_ref: "MOCK-2026-1",
  title: "Investigate checkout failover regression",
  summary: "Follow up on the March 9 incident.",
  body: { notes: ["Drafted by Incident Copilot"] },
  created_by: "usr_admin",
  created_at: "2026-03-11T12:00:00.000Z",
  updated_at: "2026-03-11T12:05:00.000Z",
};

const fakeApprovalService: ApprovalServiceContract = {
  async listApprovals() {
    return {
      approvals: [approvalRecord],
    };
  },
  async getApproval() {
    return {
      approval: approvalRecord,
      decisions: [
        {
          id: "apd_1",
          workspace_id: "ws_1",
          approval_request_id: "apr_1",
          run_id: "run_1",
          decision: "approved",
          decided_by: "usr_admin",
          rationale: "Looks good.",
          payload: {
            tool_name: "create_ticket",
          },
          occurred_at: "2026-03-11T12:06:00.000Z",
          created_at: "2026-03-11T12:06:00.000Z",
        },
      ],
    };
  },
  async resolveApproval() {
    throw new Error("not implemented");
  },
};

const fakeTicketService: TicketServiceContract = {
  async listTickets() {
    return {
      tickets: [ticketRecord],
    };
  },
  async getTicket() {
    return ticketRecord;
  },
  async lookupTickets() {
    return [];
  },
  async createTicket() {
    return ticketRecord;
  },
};

describe("ActionService", () => {
  it("maps approval-backed actions into generic action records", async () => {
    const service = new ActionService({
      approvalService: fakeApprovalService,
      ticketService: fakeTicketService,
    });

    const result = await service.listActions(actor);
    expect(result.actions).toEqual([
      {
        id: "apr_1",
        workspace_id: "ws_1",
        run_id: "run_1",
        kind: "ticket.create",
        tool_name: "create_ticket",
        risk_class: "approval_gated",
        status: "approved",
        title: "Investigate checkout failover regression",
        summary: "Follow up on the March 9 incident.",
        review_request_id: "apr_1",
        result_artifact_id: "tkt_1",
        result_artifact_kind: "ticket",
        result_reference: "MOCK-2026-1",
        created_at: "2026-03-11T12:00:00.000Z",
        updated_at: "2026-03-11T12:06:00.000Z",
      },
    ]);
  });

  it("returns detailed action context with decisions", async () => {
    const service = new ActionService({
      approvalService: fakeApprovalService,
      ticketService: fakeTicketService,
    });

    const result = await service.getAction(actor, "apr_1");
    expect(result.action).toMatchObject({
      id: "apr_1",
      kind: "ticket.create",
      result_artifact_id: "tkt_1",
      resolved_at: "2026-03-11T12:06:00.000Z",
    });
    expect(result.decisions).toHaveLength(1);
  });
});
