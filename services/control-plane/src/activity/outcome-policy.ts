import type {
  ReviewedActionSurface,
  ReviewedExternalWorkflowCallbackResult,
  ReviewedExternalWorkflowCallbackStatus,
} from "@clawback/contracts";

export const activityResultKinds = {
  reviewRequested: "review_requested",
  reviewApproved: "review_approved",
  reviewDenied: "review_denied",
  workItemCreated: "work_item_created",
  workItemSent: "work_item_sent",
  sendFailed: "send_failed",
  routeHandoffConfirmed: "route_handoff_confirmed",
  shadowDraftCreated: "shadow_draft_created",
  triageIgnored: "triage_ignored",
  triageReviewRequested: "triage_review_requested",
  triageRouteSuggested: "triage_route_suggested",
  triageEscalated: "triage_escalated",
  externalWorkflowReviewRequested: "external_workflow_review_requested",
  externalWorkflowHandedOff: "external_workflow_handed_off",
  externalWorkflowHandoffFailed: "external_workflow_handoff_failed",
  externalWorkflowCallbackSucceeded: "external_workflow_callback_succeeded",
  externalWorkflowCallbackFailed: "external_workflow_callback_failed",
} as const;

export type ActivityResultKind =
  | (typeof activityResultKinds)[keyof typeof activityResultKinds]
  | `review_resolved_via_${Exclude<ReviewedActionSurface, "web">}`;

export function reviewDecisionActivityResultKind(
  status: "approved" | "completed" | "denied",
): ActivityResultKind {
  return status === "denied"
    ? activityResultKinds.reviewDenied
    : activityResultKinds.reviewApproved;
}

export function reviewSurfaceActivityResultKind(
  surface: Exclude<ReviewedActionSurface, "web">,
): ActivityResultKind {
  return `review_resolved_via_${surface}`;
}

export function externalWorkflowCallbackActivityResultKind(
  status: ReviewedExternalWorkflowCallbackStatus,
): ActivityResultKind {
  return status === "failed"
    ? activityResultKinds.externalWorkflowCallbackFailed
    : activityResultKinds.externalWorkflowCallbackSucceeded;
}

export function normalizeExternalWorkflowCallbackWorkItemState(
  callbackResult: ReviewedExternalWorkflowCallbackResult,
): {
  status: "completed" | "failed";
  executionStatus: "completed" | "failed";
  executionError: string | null;
} {
  if (callbackResult.status === "failed") {
    return {
      status: "failed",
      executionStatus: "failed",
      executionError: callbackResult.summary ?? "n8n callback reported failure.",
    };
  }

  return {
    status: "completed",
    executionStatus: "completed",
    executionError: null,
  };
}
