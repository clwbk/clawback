import { describe, expect, it } from "vitest";

import type { SessionContext } from "@clawback/auth";

import { ApprovalService } from "./service.js";
import type {
  ApprovalStore,
  StoredApprovalDecision,
  StoredApprovalRequest,
  StoredAuditEvent,
  StoredRun,
  StoredRunEvent,
} from "./types.js";

class MemoryApprovalStore implements ApprovalStore {
  approvalRequests: StoredApprovalRequest[] = [
    {
      id: "apr_1",
      workspaceId: "ws_1",
      runId: "run_1",
      toolInvocationId: "tool_1",
      toolName: "create_ticket",
      actionType: "ticket.create",
      riskClass: "approval_gated",
      status: "pending",
      requestedBy: "usr_admin",
      approverScopeJson: {
        mode: "workspace_admin",
        allowed_roles: ["admin"],
      },
      requestPayloadJson: {
        title: "Investigate checkout failover",
      },
      decisionDueAt: null,
      resolvedAt: null,
      createdAt: new Date("2026-03-11T18:00:00Z"),
      updatedAt: new Date("2026-03-11T18:00:00Z"),
    },
  ];

  approvalDecisions: StoredApprovalDecision[] = [];
  auditEvents: StoredAuditEvent[] = [];
  runEvents: StoredRunEvent[] = [];
  run: StoredRun = {
    id: "run_1",
    workspaceId: "ws_1",
    status: "waiting_for_approval",
    currentStep: "waiting_for_approval",
    updatedAt: new Date("2026-03-11T18:00:00Z"),
  };

  async runInTransaction<T>(callback: (store: ApprovalStore) => Promise<T>): Promise<T> {
    return await callback(this);
  }

  async listApprovalRequests(workspaceId: string) {
    return this.approvalRequests.filter((approval) => approval.workspaceId === workspaceId);
  }

  async findApprovalRequest(workspaceId: string, approvalId: string) {
    return (
      this.approvalRequests.find(
        (approval) => approval.workspaceId === workspaceId && approval.id === approvalId,
      ) ?? null
    );
  }

  async listApprovalDecisions(workspaceId: string, approvalId: string) {
    return this.approvalDecisions.filter(
      (decision) =>
        decision.workspaceId === workspaceId && decision.approvalRequestId === approvalId,
    );
  }

  async updateApprovalRequest(
    approvalId: string,
    patch: Partial<
      Pick<StoredApprovalRequest, "status" | "resolvedAt" | "updatedAt" | "requestPayloadJson">
    >,
  ) {
    const approval = this.approvalRequests.find((entry) => entry.id === approvalId);
    if (!approval) {
      throw new Error("approval not found");
    }

    Object.assign(approval, patch);
    return approval;
  }

  async createApprovalDecision(input: StoredApprovalDecision) {
    this.approvalDecisions.push(input);
    return input;
  }

  async updateRun(_runId: string, patch: Partial<Pick<StoredRun, "status" | "currentStep" | "updatedAt">>) {
    this.run = {
      ...this.run,
      ...patch,
    };
    return this.run;
  }

  async getMaxRunEventSequence() {
    return this.runEvents.length;
  }

  async appendRunEvent(event: StoredRunEvent) {
    this.runEvents.push(event);
  }

  async appendAuditEvent(event: StoredAuditEvent) {
    this.auditEvents.push(event);
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

describe("ApprovalService", () => {
  it("lists persisted approvals", async () => {
    const service = new ApprovalService({
      store: new MemoryApprovalStore(),
    });

    const result = await service.listApprovals(actor);
    expect(result.approvals).toHaveLength(1);
    expect(result.approvals[0]!.tool_name).toBe("create_ticket");
  });

  it("resolves a pending approval and records an audit event", async () => {
    const store = new MemoryApprovalStore();
    const service = new ApprovalService({
      store,
      now: () => new Date("2026-03-11T18:05:00Z"),
    });

    const result = await service.resolveApproval(actor, "apr_1", {
      decision: "approved",
      rationale: "Looks good.",
    });

    expect(result.approval.status).toBe("approved");
    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0]!.decision).toBe("approved");
    expect(store.auditEvents).toHaveLength(1);
    expect(store.auditEvents[0]!.eventType).toBe("approval.approved");
    expect(store.run.status).toBe("running");
    expect(store.runEvents[0]!.eventType).toBe("run.approval.resolved");
  });
});
