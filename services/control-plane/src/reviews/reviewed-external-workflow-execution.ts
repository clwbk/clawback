import type {
  ExternalWorkflowRequest,
  ExternalWorkflowResult,
  ReviewDecisionRecord,
  ReviewedExternalWorkflowCallbackResult,
  ReviewedExternalWorkflowExecutionRecord,
} from "@clawback/contracts";

type QueueReviewedExternalWorkflowExecutionInput = {
  existing: ReviewedExternalWorkflowExecutionRecord | null;
  reviewId: string;
  decision: ReviewDecisionRecord | null;
  request: ExternalWorkflowRequest;
  connectionLabel: string;
  attemptedAt: Date;
};

export function queueReviewedExternalWorkflowExecution(
  input: QueueReviewedExternalWorkflowExecutionInput,
): ReviewedExternalWorkflowExecutionRecord {
  return {
    kind: "reviewed_external_workflow",
    status: "queued",
    review_id: input.reviewId,
    review_decision_id: input.decision?.id ?? null,
    approved_via: input.decision?.surface ?? null,
    backend_kind: input.request.backend_kind,
    connection_id: input.request.connection_id,
    connection_label: input.connectionLabel,
    workflow_identifier: input.request.workflow_identifier,
    request_payload: input.request.payload,
    attempt_count: (input.existing?.attempt_count ?? 0) + 1,
    last_attempted_at: input.attemptedAt.toISOString(),
    response_status_code: null,
    response_summary: null,
    backend_reference: null,
    completed_at: null,
    failed_at: null,
    last_error: null,
    callback_result: null,
  };
}

export function markReviewedExternalWorkflowExecutionRunning(
  execution: ReviewedExternalWorkflowExecutionRecord,
): ReviewedExternalWorkflowExecutionRecord {
  return {
    ...execution,
    status: "executing",
  };
}

export function markReviewedExternalWorkflowExecutionSucceeded(
  execution: ReviewedExternalWorkflowExecutionRecord,
  input: ExternalWorkflowResult & {
    completedAt: Date;
  },
): ReviewedExternalWorkflowExecutionRecord {
  return {
    ...execution,
    status: "succeeded",
    response_status_code: input.response_status_code,
    response_summary: input.response_summary,
    backend_reference: input.backend_reference,
    completed_at: input.completedAt.toISOString(),
    failed_at: null,
    last_error: null,
  };
}

export function markReviewedExternalWorkflowExecutionFailed(
  execution: ReviewedExternalWorkflowExecutionRecord,
  input: {
    error: string;
    failedAt: Date;
    responseStatusCode?: number | null;
    responseSummary?: string | null;
    backendReference?: string | null;
  },
): ReviewedExternalWorkflowExecutionRecord {
  return {
    ...execution,
    status: "failed",
    response_status_code: input.responseStatusCode ?? null,
    response_summary: input.responseSummary ?? null,
    backend_reference: input.backendReference ?? null,
    completed_at: null,
    failed_at: input.failedAt.toISOString(),
    last_error: input.error,
  };
}

export function recordReviewedExternalWorkflowCallbackResult(
  execution: ReviewedExternalWorkflowExecutionRecord,
  callbackResult: ReviewedExternalWorkflowCallbackResult,
): ReviewedExternalWorkflowExecutionRecord {
  return {
    ...execution,
    callback_result: callbackResult,
  };
}
