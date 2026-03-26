import type { RunEventRecord } from "@/lib/control-plane";

export type GovernedActionSummary = {
  actionType: string;
  actionTitle: string | null;
  approvalId: string | null;
  approvalState: "pending" | "approved" | "denied" | "expired" | "canceled";
  approvalRationale: string | null;
  resultKind: "ticket" | null;
  resultReference: string | null;
  resultInternalId: string | null;
  retrievalResultCount: number | null;
};

function getToolName(event: RunEventRecord) {
  const payload = event.payload;
  if (typeof payload.tool_name === "string") {
    return payload.tool_name;
  }
  if (typeof payload.name === "string") {
    return payload.name;
  }
  return null;
}

function getToolArgsTitle(event: RunEventRecord) {
  const args = event.payload.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }

  const candidate = args as { title?: unknown };
  return typeof candidate.title === "string" ? candidate.title : null;
}

function parseCompletedResult(text: string | null) {
  if (!text) {
    return { resultReference: null, resultInternalId: null };
  }

  const referenceMatch = text.match(/\*\*Reference:\*\*\s*`([^`]+)`/u);
  const internalIdMatch = text.match(/\*\*Internal ID:\*\*\s*`([^`]+)`/u);

  return {
    resultReference: referenceMatch?.[1] ?? null,
    resultInternalId: internalIdMatch?.[1] ?? null,
  };
}

export function extractGovernedActionSummary(events: RunEventRecord[]): GovernedActionSummary | null {
  const retrievalCompleted = [...events]
    .reverse()
    .find((event) => event.event_type === "run.retrieval.completed");
  const createTicketRequested = events.find(
    (event) =>
      event.event_type === "run.tool.requested" &&
      getToolName(event) === "create_ticket",
  );

  const waitingApproval = [...events]
    .reverse()
    .find((event) => event.event_type === "run.waiting_for_approval");
  const resolvedApproval = [...events]
    .reverse()
    .find((event) => event.event_type === "run.approval.resolved");
  const runCompleted = [...events]
    .reverse()
    .find((event) => event.event_type === "run.completed");

  if (!createTicketRequested && !waitingApproval && !resolvedApproval) {
    return null;
  }

  const approvalState =
    resolvedApproval && typeof resolvedApproval.payload.decision === "string"
      ? (resolvedApproval.payload.decision as GovernedActionSummary["approvalState"])
      : "pending";
  const completedAssistantText =
    runCompleted && typeof runCompleted.payload.assistant_text === "string"
      ? runCompleted.payload.assistant_text
      : null;
  const parsedResult = parseCompletedResult(completedAssistantText);
  const actionType =
    (waitingApproval && typeof waitingApproval.payload.action_type === "string"
      ? waitingApproval.payload.action_type
      : null) ??
    getToolName(createTicketRequested ?? waitingApproval ?? resolvedApproval!) ??
    "governed_action";

  return {
    actionType,
    actionTitle: getToolArgsTitle(createTicketRequested ?? waitingApproval ?? resolvedApproval!),
    approvalId:
      (resolvedApproval && typeof resolvedApproval.payload.approval_request_id === "string"
        ? resolvedApproval.payload.approval_request_id
        : null) ??
      (waitingApproval && typeof waitingApproval.payload.approval_request_id === "string"
        ? waitingApproval.payload.approval_request_id
        : null),
    approvalState,
    approvalRationale:
      resolvedApproval && typeof resolvedApproval.payload.rationale === "string"
        ? resolvedApproval.payload.rationale
        : null,
    resultKind: actionType === "create_ticket" ? "ticket" : null,
    resultReference: parsedResult.resultReference,
    resultInternalId: parsedResult.resultInternalId,
    retrievalResultCount:
      retrievalCompleted && typeof retrievalCompleted.payload.result_count === "number"
        ? retrievalCompleted.payload.result_count
        : null,
  };
}
