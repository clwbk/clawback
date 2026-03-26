import type {
  ReviewedSendExecutionRecord,
  ReviewDecisionRecord,
} from "@clawback/contracts";

type ReviewedSendExecutionInput = {
  existing: ReviewedSendExecutionRecord | null;
  reviewId: string;
  decision: ReviewDecisionRecord | null;
  connectionId: string;
  connectionLabel: string;
  attemptedAt: Date;
};

export function queueReviewedSendExecution(
  input: ReviewedSendExecutionInput,
): ReviewedSendExecutionRecord {
  return {
    kind: "reviewed_send_email",
    status: "queued",
    review_id: input.reviewId,
    review_decision_id: input.decision?.id ?? null,
    approved_via: input.decision?.surface ?? null,
    transport: "smtp_relay",
    connection_id: input.connectionId,
    connection_label: input.connectionLabel,
    attempt_count: (input.existing?.attempt_count ?? 0) + 1,
    last_attempted_at: input.attemptedAt.toISOString(),
    provider_message_id: null,
    sent_at: null,
    failed_at: null,
    last_error: null,
  };
}

export function markReviewedSendExecutionRunning(
  execution: ReviewedSendExecutionRecord,
): ReviewedSendExecutionRecord {
  return {
    ...execution,
    status: "executing",
  };
}

export function markReviewedSendExecutionSent(
  execution: ReviewedSendExecutionRecord,
  input: {
    providerMessageId: string | null;
    sentAt: Date;
  },
): ReviewedSendExecutionRecord {
  return {
    ...execution,
    status: "sent",
    provider_message_id: input.providerMessageId,
    sent_at: input.sentAt.toISOString(),
    failed_at: null,
    last_error: null,
  };
}

export function markReviewedSendExecutionFailed(
  execution: ReviewedSendExecutionRecord,
  input: {
    error: string;
    failedAt: Date;
    errorClassification?: "transient" | "permanent";
  },
): ReviewedSendExecutionRecord {
  return {
    ...execution,
    status: "failed",
    provider_message_id: null,
    sent_at: null,
    failed_at: input.failedAt.toISOString(),
    last_error: input.error,
    error_classification: input.errorClassification ?? null,
  };
}
