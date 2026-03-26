import {
  approvalApproverScopeSchema,
  approvalRequestRecordSchema,
  runtimeCreateTicketResponseSchema,
  runtimeDraftTicketResponseSchema,
  runtimeTicketLookupResponseSchema,
  ticketDraftSchema,
  ticketLookupResultSchema,
  ticketRecordSchema,
} from "@clawback/contracts";
import { createClawbackId } from "@clawback/domain";

import type {
  FollowUpDraftInput,
  FollowUpDraftResult,
  FollowUpRecapInput,
  FollowUpRecapResult,
  FollowUpRequestSendInput,
  FollowUpRequestSendResult,
  RuntimeCreateTicketInput,
  RuntimeCreateTicketView,
  RuntimeDraftTicketInput,
  RuntimeDraftTicketView,
  RuntimeTicketLookupInput,
  RuntimeTicketLookupView,
  RuntimeToolServiceContract,
  RuntimeToolStore,
  StoredApprovalRequest,
  StoredRun,
  TicketDraftView,
} from "./types.js";

type RuntimeToolServiceOptions = {
  store: RuntimeToolStore;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_TICKET_SUMMARY = "Follow up on the incident and assign remediation work.";
const DEFAULT_TICKET_OWNER = "unassigned";

function cleanOptionalText(value: string | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractSection(body: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = body.match(
    new RegExp(`(?:^|\\n)(?:[*#\\-\\s]*)${escaped}(?:[*:\\s]+)\\n?([\\s\\S]*?)(?=\\n(?:[*#\\-\\s]*[A-Z][^\\n]{0,80}:|[*#\\-\\s]*\\*\\*[A-Z][^\\n]{0,80}\\*\\*:|$))`, "i"),
  );
  const fallback = match ?? body.match(new RegExp(`(?:^|\\n)(?:[*#\\-\\s]*)${escaped}(?:[*:\\s]+)\\n+([^\\n]+)`, "i"));

  if (!fallback?.[1]) {
    return null;
  }

  const value = fallback[1]
    .split("\n")
    .map((line) => line.replace(/^[\-\*\d.\s]+/, "").trim())
    .filter(Boolean)
    .join(" ");

  return value.length > 0 ? value : null;
}

function extractRecommendedActions(body: string) {
  const headings = ["Next Remediation Actions", "Recommended Actions", "Action Items"];
  for (const heading of headings) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(
      new RegExp(`(?:^|\\n)(?:[*#\\-\\s]*)${escaped}(?:[*:\\s]+)\\n?([\\s\\S]*?)(?=\\n(?:[*#\\-\\s]*[A-Z][^\\n]{0,80}:|[*#\\-\\s]*\\*\\*[A-Z][^\\n]{0,80}\\*\\*:|$))`, "i"),
    );
    const section = match?.[1];
    if (!section) {
      continue;
    }

    const items = section
      .split(/\n+/)
      .map((line) => line.replace(/^[\-\*\d.\s]+/, "").trim())
      .filter(Boolean);

    if (items.length > 0) {
      return items;
    }

    return section
      .split(/(?:\.\s+|;\s+)/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeTicketDraft(input: TicketDraftView) {
  const title = input.title.trim();
  const body = cleanOptionalText(input.body);
  const summary =
    cleanOptionalText(input.summary) ??
    (body ? extractSection(body, "Summary") : null) ??
    (body ? extractSection(body, "Customer Impact Summary") : null) ??
    body?.split(/\n{2,}/).map((chunk) => chunk.trim()).find(Boolean) ??
    DEFAULT_TICKET_SUMMARY;
  const likelyCause =
    cleanOptionalText(input.likely_cause) ??
    (body ? extractSection(body, "Likely Cause") : null) ??
    "Not specified in the ticket draft.";
  const impact =
    cleanOptionalText(input.impact) ??
    (body ? extractSection(body, "Customer Impact Summary") : null) ??
    (body ? extractSection(body, "Impact") : null) ??
    summary;
  const recommendedActions =
    (Array.isArray(input.recommended_actions)
      ? input.recommended_actions.map((value) => value.trim()).filter(Boolean)
      : []) ??
    [];
  const normalizedActions =
    recommendedActions.length > 0
      ? recommendedActions
      : body
        ? extractRecommendedActions(body)
        : [];
  const owner =
    cleanOptionalText(input.owner) ??
    (body ? extractSection(body, "Owner") : null) ??
    DEFAULT_TICKET_OWNER;

  return {
    title,
    summary,
    likely_cause: likelyCause,
    impact,
    recommended_actions:
      normalizedActions.length > 0
        ? normalizedActions
        : ["Review the incident context and assign concrete remediation work."],
    owner,
    ...(body ? { body } : {}),
  };
}

export class RuntimeToolService implements RuntimeToolServiceContract {
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly eventWriteChainByRunId = new Map<string, Promise<void>>();

  constructor(private readonly options: RuntimeToolServiceOptions) {
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? (async (ms) => await new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async lookupTickets(input: RuntimeTicketLookupInput): Promise<RuntimeTicketLookupView> {
    const run = await this.getRequiredActiveRun(input.runtime_session_key);

    const results = await this.options.store.searchTickets({
      workspaceId: run.workspaceId,
      ...(input.query ? { query: input.query } : {}),
      ...(typeof input.limit === "number" ? { limit: input.limit } : {}),
    });

    const payload = runtimeTicketLookupResponseSchema.parse({
      results: results.map((ticket) =>
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
      ),
    });

    return payload;
  }

  async draftTicket(input: RuntimeDraftTicketInput): Promise<RuntimeDraftTicketView> {
    const run = await this.getRequiredActiveRun(input.runtime_session_key);
    const draft = normalizeTicketDraft(ticketDraftSchema.parse(input.draft));
    const occurredAt = this.now();

    const record = await this.options.store.createTicket({
      id: createClawbackId("tkt"),
      workspaceId: run.workspaceId,
      runId: run.id,
      approvalRequestId: null,
      provider: "mock",
      status: "draft",
      externalRef: null,
      title: draft.title,
      summary: draft.summary,
      bodyJson: {
        ...(draft.body ? { body: draft.body } : {}),
        likely_cause: draft.likely_cause,
        impact: draft.impact,
        recommended_actions: draft.recommended_actions,
        owner: draft.owner,
      },
      createdBy: run.initiatedBy,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    });

    const response = runtimeDraftTicketResponseSchema.parse({
      draft_ticket: ticketRecordSchema.parse({
        id: record.id,
        workspace_id: record.workspaceId,
        run_id: record.runId,
        approval_request_id: record.approvalRequestId,
        provider: record.provider,
        status: record.status,
        external_ref: record.externalRef,
        title: record.title,
        summary: record.summary,
        body: record.bodyJson,
        created_by: record.createdBy,
        created_at: record.createdAt.toISOString(),
        updated_at: record.updatedAt.toISOString(),
      }),
    });

    return response;
  }

  async createTicket(input: RuntimeCreateTicketInput): Promise<RuntimeCreateTicketView> {
    const run = await this.getRequiredActiveRun(input.runtime_session_key);
    const draft = normalizeTicketDraft(ticketDraftSchema.parse(input.draft));
    const initialRequestedAt = this.now();

    let approval = await this.options.store.findApprovalRequestByRunToolInvocation(
      run.id,
      input.tool_invocation_id,
    );

    if (!approval) {
      approval = await this.options.store.createApprovalRequest({
        id: createClawbackId("apr"),
        workspaceId: run.workspaceId,
        runId: run.id,
        toolInvocationId: input.tool_invocation_id,
        toolName: "create_ticket",
        actionType: "create_ticket",
        riskClass: "approval_gated",
        status: "pending",
        requestedBy: run.initiatedBy,
        approverScopeJson: approvalApproverScopeSchema.parse({
          mode: "workspace_admin",
          allowed_roles: ["admin"],
        }),
        requestPayloadJson: {
          title: draft.title,
          summary: draft.summary,
          body: {
            ...(draft.body ? { body: draft.body } : {}),
            likely_cause: draft.likely_cause,
            impact: draft.impact,
            recommended_actions: draft.recommended_actions,
            owner: draft.owner,
          },
        },
        decisionDueAt: null,
        resolvedAt: null,
        createdAt: initialRequestedAt,
        updatedAt: initialRequestedAt,
      });

      await this.options.store.updateRun(run.id, {
        status: "waiting_for_approval",
        currentStep: "waiting_for_approval",
        updatedAt: initialRequestedAt,
      });

      await this.appendRunEvent(run.id, run.workspaceId, "run.waiting_for_approval", {
        approval_request_id: approval.id,
        tool_name: "create_ticket",
        tool_invocation_id: input.tool_invocation_id,
        action_type: "create_ticket",
      }, initialRequestedAt);

      await this.options.store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: run.workspaceId,
        actorType: "service",
        actorId: "runtime-tools",
        eventType: "approval.requested",
        targetType: "approval_request",
        targetId: approval.id,
        summary: "Approval requested for create_ticket.",
        payloadJson: {
          run_id: run.id,
          tool_name: "create_ticket",
          tool_invocation_id: input.tool_invocation_id,
        },
        occurredAt: initialRequestedAt,
      });
    }

    const waitTimeoutMs = input.wait_timeout_ms ?? 5 * 60 * 1000;
    const pollIntervalMs = input.poll_interval_ms ?? 1_000;
    const waitStartedAt = this.now().getTime();

    while (approval.status === "pending" && this.now().getTime() - waitStartedAt < waitTimeoutMs) {
      await this.sleep(pollIntervalMs);
      const refreshed = await this.options.store.findApprovalRequestById(approval.id);
      if (!refreshed) {
        throw new Error(`Approval request ${approval.id} disappeared while waiting.`);
      }
      approval = refreshed;
    }

    if (approval.status === "approved") {
      const existingTicket = await this.options.store.findTicketByApprovalRequest(approval.id);
      const ticket =
        existingTicket ??
        (await this.options.store.createTicket({
          id: createClawbackId("tkt"),
          workspaceId: run.workspaceId,
          runId: run.id,
          approvalRequestId: approval.id,
          provider: "mock",
          status: "created",
          externalRef: `MOCK-${this.now().getUTCFullYear()}-${Math.floor(this.now().getTime() / 1000)}`,
          title: draft.title,
          summary: draft.summary,
          bodyJson: {
            ...(draft.body ? { body: draft.body } : {}),
            likely_cause: draft.likely_cause,
            impact: draft.impact,
            recommended_actions: draft.recommended_actions,
            owner: draft.owner,
          },
          createdBy: run.initiatedBy,
          createdAt: this.now(),
          updatedAt: this.now(),
        }));

      await this.options.store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: run.workspaceId,
        actorType: "service",
        actorId: "runtime-tools",
        eventType: "ticket.created",
        targetType: "ticket",
        targetId: ticket.id,
        summary: "Mock ticket created from Incident Copilot.",
        payloadJson: {
          run_id: run.id,
          approval_request_id: approval.id,
          external_ref: ticket.externalRef,
        },
        occurredAt: this.now(),
      });

      return runtimeCreateTicketResponseSchema.parse({
        status: "created",
        ticket: {
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
        },
        approval: this.toApprovalView(approval),
      });
    }

    if (approval.status === "denied" || approval.status === "expired" || approval.status === "canceled") {
      const decision = await this.options.store.findApprovalDecisionByApprovalId(approval.id);

      return runtimeCreateTicketResponseSchema.parse({
        status: approval.status === "denied" ? "denied" : "expired",
        approval: this.toApprovalView(approval),
        rationale: decision?.rationale ?? null,
      });
    }

    return runtimeCreateTicketResponseSchema.parse({
      status: "pending",
      approval: this.toApprovalView(approval),
      retry_after_ms: pollIntervalMs,
      checked_at: this.now().toISOString(),
    });
  }

  async draftFollowUp(input: FollowUpDraftInput): Promise<FollowUpDraftResult> {
    const run = await this.getRequiredActiveRun(input.runtime_session_key);
    const draft = input.draft;

    return {
      draft: {
        work_item_id: createClawbackId("wi"),
        status: "draft",
        to: draft.to ?? null,
        subject: draft.subject ?? null,
        body: draft.body ?? null,
      },
    };
  }

  async draftRecap(input: FollowUpRecapInput): Promise<FollowUpRecapResult> {
    const run = await this.getRequiredActiveRun(input.runtime_session_key);
    const recap = input.recap;

    return {
      draft: {
        work_item_id: createClawbackId("wi"),
        status: "draft",
        to: recap.to ?? null,
        subject: recap.subject ?? null,
        meeting_summary: recap.meeting_summary ?? null,
        action_items: recap.action_items ?? [],
        decisions: recap.decisions ?? [],
      },
    };
  }

  async requestSend(input: FollowUpRequestSendInput): Promise<FollowUpRequestSendResult> {
    const run = await this.getRequiredActiveRun(input.runtime_session_key);
    const now = this.now();

    // Check for existing approval for this run+tool invocation (idempotency)
    let approval = await this.options.store.findApprovalRequestByRunToolInvocation(
      run.id,
      input.tool_invocation_id,
    );

    if (!approval) {
      approval = await this.options.store.createApprovalRequest({
        id: createClawbackId("apr"),
        workspaceId: run.workspaceId,
        runId: run.id,
        toolInvocationId: input.tool_invocation_id,
        toolName: "request_send",
        actionType: "send_email",
        riskClass: "approval_gated",
        status: "pending",
        requestedBy: run.initiatedBy,
        approverScopeJson: approvalApproverScopeSchema.parse({
          mode: "workspace_admin",
          allowed_roles: ["admin"],
        }),
        requestPayloadJson: {
          work_item_id: input.send_request.work_item_id,
          to: input.send_request.to,
          subject: input.send_request.subject,
          body: input.send_request.body,
        },
        decisionDueAt: null,
        resolvedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      await this.options.store.updateRun(run.id, {
        status: "waiting_for_approval",
        currentStep: "waiting_for_approval",
        updatedAt: now,
      });

      await this.appendRunEvent(run.id, run.workspaceId, "run.waiting_for_approval", {
        approval_request_id: approval.id,
        tool_name: "request_send",
        tool_invocation_id: input.tool_invocation_id,
        action_type: "send_email",
      }, now);

      await this.options.store.appendAuditEvent({
        id: createClawbackId("aud"),
        workspaceId: run.workspaceId,
        actorType: "service",
        actorId: "runtime-tools",
        eventType: "approval.requested",
        targetType: "approval_request",
        targetId: approval.id,
        summary: "Approval requested for send_email via follow-up tools.",
        payloadJson: {
          run_id: run.id,
          tool_name: "request_send",
          tool_invocation_id: input.tool_invocation_id,
        },
        occurredAt: now,
      });
    }

    return {
      status: "pending",
      approval_request_id: approval.id,
      message: "Send request submitted for review. Awaiting human approval.",
    };
  }

  private async getRequiredActiveRun(sessionKey: string) {
    const run = await this.options.store.findActiveRunBySessionKey(sessionKey);
    if (!run) {
      throw new Error(`No active Clawback run found for runtime session ${sessionKey}.`);
    }

    return run;
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

  private async appendRunEvent(
    runId: string,
    workspaceId: string,
    eventType:
      | "run.tool.requested"
      | "run.tool.completed"
      | "run.waiting_for_approval",
    payloadJson: Record<string, unknown>,
    occurredAt = this.now(),
  ) {
    const previousWrite = this.eventWriteChainByRunId.get(runId) ?? Promise.resolve();
    const nextWrite = previousWrite.then(async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const sequence = (await this.options.store.getMaxRunEventSequence(runId)) + 1;

        try {
          await this.options.store.appendRunEvent({
            id: createClawbackId("evt"),
            workspaceId,
            runId,
            eventType,
            sequence,
            actorType: "service",
            actorId: "runtime-tools",
            payloadJson,
            occurredAt,
          });
          return;
        } catch (error) {
          if (!this.isRunEventSequenceConflict(error) || attempt === 4) {
            throw error;
          }
        }
      }
    });

    this.eventWriteChainByRunId.set(runId, nextWrite.catch(() => undefined));
    await nextWrite;
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
      approver_scope: approval.approverScopeJson,
      request_payload: approval.requestPayloadJson,
      decision_due_at: approval.decisionDueAt?.toISOString() ?? null,
      resolved_at: approval.resolvedAt?.toISOString() ?? null,
      created_at: approval.createdAt.toISOString(),
      updated_at: approval.updatedAt.toISOString(),
    });
  }
}
