import { describe, expect, it } from "vitest";

import { RuntimeToolService } from "./service.js";
import type {
  RuntimeToolStore,
  StoredApprovalDecision,
  StoredApprovalRequest,
  StoredAuditEvent,
  StoredRun,
  StoredRunEvent,
  StoredTicketRecord,
} from "./types.js";

class MemoryRuntimeToolStore implements RuntimeToolStore {
  run: StoredRun = {
    id: "run_1",
    workspaceId: "ws_1",
    conversationId: "cnv_1",
    initiatedBy: "usr_1",
    status: "running",
    currentStep: "modeling",
    updatedAt: new Date("2026-03-11T12:00:00Z"),
  };

  tickets: StoredTicketRecord[] = [];
  approvals: StoredApprovalRequest[] = [];
  decisions: StoredApprovalDecision[] = [];
  events: StoredRunEvent[] = [];
  audits: StoredAuditEvent[] = [];

  async findActiveRunBySessionKey() {
    return this.run;
  }

  async getMaxRunEventSequence() {
    return this.events.length;
  }

  async appendRunEvent(input: StoredRunEvent) {
    if (this.events.some((event) => event.runId === input.runId && event.sequence === input.sequence)) {
      throw new Error(`Duplicate run event sequence ${input.sequence} for ${input.runId}`);
    }
    this.events.push(input);
  }

  async updateRun(_runId: string, patch: Partial<Pick<StoredRun, "status" | "currentStep" | "updatedAt">>) {
    this.run = {
      ...this.run,
      ...patch,
    };
    return this.run;
  }

  async searchTickets(input: { workspaceId: string; query?: string; limit?: number }) {
    return this.tickets
      .filter((ticket) => ticket.workspaceId === input.workspaceId)
      .filter((ticket) =>
        input.query
          ? `${ticket.title} ${ticket.summary} ${JSON.stringify(ticket.bodyJson)}`.toLowerCase().includes(input.query.toLowerCase())
          : true,
      )
      .slice(0, input.limit ?? 5);
  }

  async createTicket(input: StoredTicketRecord) {
    this.tickets.push(input);
    return input;
  }

  async findApprovalRequestByRunToolInvocation(runId: string, toolInvocationId: string) {
    return (
      this.approvals.find(
        (approval) => approval.runId === runId && approval.toolInvocationId === toolInvocationId,
      ) ?? null
    );
  }

  async findApprovalRequestById(approvalId: string) {
    return this.approvals.find((approval) => approval.id === approvalId) ?? null;
  }

  async findApprovalDecisionByApprovalId(approvalId: string) {
    return this.decisions.find((decision) => decision.approvalRequestId === approvalId) ?? null;
  }

  async createApprovalRequest(input: StoredApprovalRequest) {
    this.approvals.push(input);
    return input;
  }

  async findTicketByApprovalRequest(approvalRequestId: string) {
    return this.tickets.find((ticket) => ticket.approvalRequestId === approvalRequestId) ?? null;
  }

  async appendAuditEvent(input: StoredAuditEvent) {
    this.audits.push(input);
  }
}

describe("RuntimeToolService", () => {
  it("creates a draft ticket and records tool events", async () => {
    const store = new MemoryRuntimeToolStore();
    const service = new RuntimeToolService({
      store,
      now: () => new Date("2026-03-11T12:00:00Z"),
    });

    const result = await service.draftTicket({
      runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
      tool_invocation_id: "tool_1",
      draft: {
        title: "Investigate checkout failure",
        summary: "Follow up on the overnight incident.",
        likely_cause: "Replica lag",
        impact: "Checkout requests failed for 7 minutes.",
        recommended_actions: ["Verify failover", "Add alerting"],
        owner: "ops-oncall",
      },
    });

    expect(result.draft_ticket.status).toBe("draft");
    expect(store.events).toHaveLength(0);
  });

  it("normalizes a body-only draft ticket payload", async () => {
    const store = new MemoryRuntimeToolStore();
    const service = new RuntimeToolService({
      store,
      now: () => new Date("2026-03-11T12:00:00Z"),
    });

    const result = await service.draftTicket({
      runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
      tool_invocation_id: "tool_body_only",
      draft: {
        title: "Follow-up: checkout-api stale primary target after payments-db failover",
        body: `**Customer Impact Summary:**\nAfter failover, checkout requests errored until restart.\n\n**Likely Cause:**\ncheckout-api cached the old primary target.\n\n**Next Remediation Actions:**\n1. Add failover validation\n2. Improve connection refresh behavior\n\n**Owner:**\nops-oncall`,
      },
    });

    expect(result.draft_ticket.summary).toContain("checkout requests errored");
    expect(result.draft_ticket.body.likely_cause).toContain("cached the old primary target");
    expect(result.draft_ticket.body.recommended_actions).toEqual([
      "Add failover validation",
      "Improve connection refresh behavior",
    ]);
    expect(result.draft_ticket.body.owner).toBe("ops-oncall");
    expect(result.draft_ticket.body.body).toContain("Customer Impact Summary");
  });

  it("waits for approval and creates a ticket once approved", async () => {
    const store = new MemoryRuntimeToolStore();
    let pollCount = 0;
    const service = new RuntimeToolService({
      store,
      now: () => new Date("2026-03-11T12:00:00Z"),
      sleep: async () => {
        pollCount += 1;
        if (pollCount === 1) {
          const approval = store.approvals[0];
          if (!approval) {
            throw new Error("Expected approval to exist.");
          }
          approval.status = "approved";
          approval.resolvedAt = new Date("2026-03-11T12:00:05Z");
          approval.updatedAt = new Date("2026-03-11T12:00:05Z");
          store.decisions.push({
            id: "apd_1",
            workspaceId: approval.workspaceId,
            approvalRequestId: approval.id,
            runId: approval.runId,
            decision: "approved",
            decidedBy: "usr_admin",
            rationale: "Looks good.",
            payloadJson: {},
            occurredAt: new Date("2026-03-11T12:00:05Z"),
            createdAt: new Date("2026-03-11T12:00:05Z"),
          });
        }
      },
    });

    const result = await service.createTicket({
      runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
      tool_invocation_id: "tool_2",
      draft: {
        title: "Investigate checkout failure",
        summary: "Follow up on the overnight incident.",
        likely_cause: "Replica lag",
        impact: "Checkout requests failed for 7 minutes.",
        recommended_actions: ["Verify failover", "Add alerting"],
        owner: "ops-oncall",
      },
      wait_timeout_ms: 5_000,
      poll_interval_ms: 10,
    });

    expect(result.status).toBe("created");
    expect(store.run.status).toBe("waiting_for_approval");
    expect(store.approvals[0]?.status).toBe("approved");
    expect(store.tickets).toHaveLength(1);
    expect(store.events.map((event) => event.eventType)).toEqual([
      "run.waiting_for_approval",
    ]);
    expect(store.audits[0]?.eventType).toBe("approval.requested");
    expect(store.tickets[0]?.approvalRequestId).toBe(store.approvals[0]?.id ?? null);
  });

  it("returns denied without creating a ticket when approval is rejected", async () => {
    const store = new MemoryRuntimeToolStore();
    let pollCount = 0;
    const service = new RuntimeToolService({
      store,
      now: () => new Date("2026-03-11T12:00:00Z"),
      sleep: async () => {
        pollCount += 1;
        if (pollCount === 1) {
          const approval = store.approvals[0];
          if (!approval) {
            throw new Error("Expected approval to exist.");
          }
          approval.status = "denied";
          approval.resolvedAt = new Date("2026-03-11T12:00:05Z");
          approval.updatedAt = new Date("2026-03-11T12:00:05Z");
          store.decisions.push({
            id: "apd_denied",
            workspaceId: approval.workspaceId,
            approvalRequestId: approval.id,
            runId: approval.runId,
            decision: "denied",
            decidedBy: "usr_admin",
            rationale: "Not today.",
            payloadJson: {},
            occurredAt: new Date("2026-03-11T12:00:05Z"),
            createdAt: new Date("2026-03-11T12:00:05Z"),
          });
        }
      },
    });

    const result = await service.createTicket({
      runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
      tool_invocation_id: "tool_denied",
      draft: {
        title: "Investigate checkout failure",
        summary: "Follow up on the overnight incident.",
        likely_cause: "Replica lag",
        impact: "Checkout requests failed for 7 minutes.",
        recommended_actions: ["Verify failover", "Add alerting"],
        owner: "ops-oncall",
      },
      wait_timeout_ms: 5_000,
      poll_interval_ms: 10,
    });

    expect(result.status).toBe("denied");
    if (result.status !== "denied") {
      throw new Error("Expected denied result.");
    }
    expect(result.approval.status).toBe("denied");
    expect(result.rationale).toBe("Not today.");
    expect(store.tickets).toHaveLength(0);
    expect(store.events.map((event) => event.eventType)).toEqual([
      "run.waiting_for_approval",
    ]);
  });

  it("serializes concurrent tool event writes for the same run", async () => {
    const store = new MemoryRuntimeToolStore();
    const service = new RuntimeToolService({
      store,
      now: () => new Date("2026-03-11T12:00:00Z"),
    });

    await Promise.all([
      service.draftTicket({
        runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
        tool_invocation_id: "tool_parallel_1",
        draft: {
          title: "Parallel draft A",
          summary: "A",
          likely_cause: "A",
          impact: "A",
          recommended_actions: ["A1"],
          owner: "ops-oncall",
        },
      }),
      service.draftTicket({
        runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
        tool_invocation_id: "tool_parallel_2",
        draft: {
          title: "Parallel draft B",
          summary: "B",
          likely_cause: "B",
          impact: "B",
          recommended_actions: ["B1"],
          owner: "ops-oncall",
        },
      }),
    ]);

    expect(store.events).toHaveLength(0);
  });
});
