import { getActionResponseSchema, listActionsResponseSchema } from "@clawback/contracts";

import type { ApprovalServiceContract } from "../approvals/index.js";
import type { TicketServiceContract } from "../tickets/index.js";
import type { ActionServiceContract } from "./types.js";

type ActionServiceOptions = {
  approvalService: ApprovalServiceContract;
  ticketService: TicketServiceContract;
};

type ApprovalRecord = Awaited<
  ReturnType<ApprovalServiceContract["listApprovals"]>
>["approvals"][number];
type ApprovalDetail = Awaited<ReturnType<ApprovalServiceContract["getApproval"]>>;
type TicketRecord = Awaited<ReturnType<TicketServiceContract["listTickets"]>>["tickets"][number];

function getPayloadText(
  payload: Record<string, unknown>,
  key: "title" | "summary",
): string | null {
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function findResultTicket(approvalId: string, tickets: TicketRecord[]) {
  return tickets.find((ticket) => ticket.approval_request_id === approvalId) ?? null;
}

function mapApprovalToAction(approval: ApprovalRecord, tickets: TicketRecord[]) {
  const resultTicket = findResultTicket(approval.id, tickets);

  return {
    id: approval.id,
    workspace_id: approval.workspace_id,
    run_id: approval.run_id,
    kind: approval.action_type,
    tool_name: approval.tool_name,
    risk_class: approval.risk_class,
    status: approval.status,
    title: getPayloadText(approval.request_payload, "title"),
    summary: getPayloadText(approval.request_payload, "summary"),
    review_request_id: approval.id,
    result_artifact_id: resultTicket?.id ?? null,
    result_artifact_kind: resultTicket ? ("ticket" as const) : null,
    result_reference: resultTicket?.external_ref ?? null,
    created_at: approval.created_at,
    updated_at: approval.updated_at,
  };
}

export class ActionService implements ActionServiceContract {
  constructor(private readonly options: ActionServiceOptions) {}

  async listActions(actor: Parameters<ApprovalServiceContract["listApprovals"]>[0]) {
    const [approvals, tickets] = await Promise.all([
      this.options.approvalService.listApprovals(actor),
      this.options.ticketService.listTickets(actor),
    ]);

    return listActionsResponseSchema.parse({
      actions: approvals.approvals.map((approval) => mapApprovalToAction(approval, tickets.tickets)),
    });
  }

  async getAction(actor: Parameters<ApprovalServiceContract["getApproval"]>[0], actionId: string) {
    const [detail, tickets] = await Promise.all([
      this.options.approvalService.getApproval(actor, actionId),
      this.options.ticketService.listTickets(actor),
    ]);

    return getActionResponseSchema.parse({
      action: {
        ...mapApprovalToAction(detail.approval, tickets.tickets),
        approver_scope: detail.approval.approver_scope,
        request_payload: detail.approval.request_payload,
        resolved_at: detail.approval.resolved_at,
      },
      decisions: detail.decisions,
    });
  }
}
