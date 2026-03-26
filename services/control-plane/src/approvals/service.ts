import {
  approvalApproverScopeSchema,
  approvalDecisionRecordSchema,
  approvalRequestRecordSchema,
  getApprovalResponseSchema,
  listApprovalsResponseSchema,
  resolveApprovalRequestSchema,
} from "@clawback/contracts";
import { AuthServiceError, type SessionContext } from "@clawback/auth";
import { createClawbackId } from "@clawback/domain";

import type {
  ApprovalServiceContract,
  ApprovalStore,
  StoredApprovalDecision,
  StoredApprovalRequest,
} from "./types.js";

type ApprovalServiceOptions = {
  store: ApprovalStore;
  now?: () => Date;
};

export class ApprovalService implements ApprovalServiceContract {
  private readonly now: () => Date;

  constructor(private readonly options: ApprovalServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  private isRunEventSequenceConflict(error: unknown) {
    let current: unknown = error;
    while (current && typeof current === "object") {
      const candidate = current as { code?: unknown; constraint?: unknown; cause?: unknown };
      if (
        candidate.code === "23505" &&
        candidate.constraint === "run_events_run_sequence_key"
      ) {
        return true;
      }
      current = candidate.cause;
    }

    return false;
  }

  async listApprovals(actor: SessionContext) {
    this.assertAdmin(actor);
    const approvals = await this.options.store.listApprovalRequests(actor.workspace.id);

    return listApprovalsResponseSchema.parse({
      approvals: approvals.map((approval) => this.toApprovalView(approval)),
    });
  }

  async getApproval(actor: SessionContext, approvalId: string) {
    this.assertAdmin(actor);
    const approval = await this.getRequiredApproval(actor.workspace.id, approvalId);
    const decisions = await this.options.store.listApprovalDecisions(actor.workspace.id, approvalId);

    return getApprovalResponseSchema.parse({
      approval: this.toApprovalView(approval),
      decisions: decisions.map((decision) => this.toDecisionView(decision)),
    });
  }

  async resolveApproval(actor: SessionContext, approvalId: string, input: unknown) {
    this.assertAdmin(actor);
    const parsed = resolveApprovalRequestSchema.parse(input);
    const approval = await this.getRequiredApproval(actor.workspace.id, approvalId);

    if (approval.status !== "pending") {
      throw new AuthServiceError({
        code: "approval_not_pending",
        message: "This approval request has already been resolved.",
        statusCode: 409,
      });
    }

    const now = this.now();

    return await this.options.store.runInTransaction(async (store) => {
      const updated = await store.updateApprovalRequest(approvalId, {
        status: parsed.decision,
        resolvedAt: now,
        updatedAt: now,
      });

      const decision = await store.createApprovalDecision({
        id: createClawbackId("apd"),
        workspaceId: actor.workspace.id,
        approvalRequestId: approvalId,
        runId: approval.runId,
        decision: parsed.decision,
        decidedBy: actor.user.id,
        rationale: parsed.rationale ?? null,
        payloadJson: {
          action_type: approval.actionType,
          tool_name: approval.toolName,
          tool_invocation_id: approval.toolInvocationId,
        },
        occurredAt: now,
        createdAt: now,
      });

      await store.updateRun(approval.runId, {
        status: "running",
        currentStep: "approval_resolved",
        updatedAt: now,
      });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const sequence = (await store.getMaxRunEventSequence(approval.runId)) + 1;
        try {
          await store.appendRunEvent({
            id: createClawbackId("evt"),
            workspaceId: actor.workspace.id,
            runId: approval.runId,
            eventType: "run.approval.resolved",
            sequence,
            actorType: "user",
            actorId: actor.user.id,
            payloadJson: {
              approval_request_id: approvalId,
              tool_name: approval.toolName,
              tool_invocation_id: approval.toolInvocationId,
              decision: parsed.decision,
              rationale: parsed.rationale ?? null,
            },
            occurredAt: now,
          });
          break;
        } catch (error) {
          if (!this.isRunEventSequenceConflict(error) || attempt === 4) {
            throw error;
          }
        }
      }

      await store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: actor.workspace.id,
        actorType: "user",
        actorId: actor.user.id,
        eventType: parsed.decision === "approved" ? "approval.approved" : "approval.denied",
        targetType: "approval_request",
        targetId: approvalId,
        summary: parsed.decision === "approved" ? "Approval granted" : "Approval denied",
        payloadJson: {
          approval_request_id: approvalId,
          run_id: approval.runId,
          action_type: approval.actionType,
          tool_name: approval.toolName,
          decision: parsed.decision,
          rationale: parsed.rationale ?? null,
        },
        occurredAt: now,
      });

      return getApprovalResponseSchema.parse({
        approval: this.toApprovalView(updated),
        decisions: [this.toDecisionView(decision)],
      });
    });
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

  private async getRequiredApproval(workspaceId: string, approvalId: string) {
    const approval = await this.options.store.findApprovalRequest(workspaceId, approvalId);
    if (!approval) {
      throw new AuthServiceError({
        code: "approval_not_found",
        message: "Approval request not found.",
        statusCode: 404,
      });
    }

    return approval;
  }

  private toApprovalView(approval: StoredApprovalRequest) {
    return approvalRequestRecordSchema.parse({
      id: approval.id,
      workspace_id: approval.workspaceId,
      run_id: approval.runId,
      tool_invocation_id: approval.toolInvocationId,
      tool_name: approval.toolName,
      action_type: approval.actionType,
      risk_class: approval.riskClass,
      status: approval.status,
      requested_by: approval.requestedBy,
      approver_scope: approvalApproverScopeSchema.parse(approval.approverScopeJson),
      request_payload: approval.requestPayloadJson,
      decision_due_at: approval.decisionDueAt?.toISOString() ?? null,
      resolved_at: approval.resolvedAt?.toISOString() ?? null,
      created_at: approval.createdAt.toISOString(),
      updated_at: approval.updatedAt.toISOString(),
    });
  }

  private toDecisionView(decision: StoredApprovalDecision) {
    return approvalDecisionRecordSchema.parse({
      id: decision.id,
      workspace_id: decision.workspaceId,
      approval_request_id: decision.approvalRequestId,
      run_id: decision.runId,
      decision: decision.decision,
      decided_by: decision.decidedBy,
      rationale: decision.rationale,
      payload: decision.payloadJson,
      occurred_at: decision.occurredAt.toISOString(),
      created_at: decision.createdAt.toISOString(),
    });
  }
}
