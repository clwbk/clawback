import {
  externalWorkflowRequestSchema,
  n8nWebhookCallbackPayloadSchema,
  reviewedExternalWorkflowCallbackResultSchema,
  type N8nWebhookCallbackPayload,
  type ReviewRecord,
  type ReviewedExternalWorkflowCallbackResult,
  type ReviewedExternalWorkflowExecutionRecord,
  type WorkItemRecord,
} from "@clawback/contracts";
import {
  externalWorkflowCallbackActivityResultKind,
  normalizeExternalWorkflowCallbackWorkItemState,
} from "../activity/outcome-policy.js";

import type { ActivityService } from "../activity/index.js";
import type { ReviewService } from "./service.js";
import { ReviewNotFoundError } from "./service.js";
import type { WorkItemService } from "../work-items/index.js";
import { WorkItemNotFoundError } from "../work-items/index.js";
import { recordReviewedExternalWorkflowCallbackResult } from "./reviewed-external-workflow-execution.js";

type N8nWebhookCallbackServiceOptions = {
  reviewService: ReviewService;
  workItemService: WorkItemService;
  activityService: ActivityService;
  now?: () => Date;
};

type RecordN8nWebhookCallbackInput = {
  connectionId: string;
  payload: unknown;
};

type RecordedLinkage = {
  review: ReviewRecord;
  workItem: WorkItemRecord;
  execution: ReviewedExternalWorkflowExecutionRecord;
};

export type RecordN8nWebhookCallbackResult = {
  deduplicated: boolean;
  review_id: string;
  work_item_id: string;
  callback_result: ReviewedExternalWorkflowCallbackResult;
};

export class N8nWebhookCallbackError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export class N8nWebhookCallbackService {
  private readonly now: () => Date;

  constructor(private readonly options: N8nWebhookCallbackServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async recordCallback(
    workspaceId: string,
    input: RecordN8nWebhookCallbackInput,
  ): Promise<RecordN8nWebhookCallbackResult> {
    const parsed = n8nWebhookCallbackPayloadSchema.safeParse(input.payload);
    if (!parsed.success) {
      throw new N8nWebhookCallbackError(
        "n8n callback payload is invalid.",
        "n8n_webhook_payload_invalid",
        400,
      );
    }

    const normalized = parsed.data;
    if (
      normalized.clawback.workspace_id
      && normalized.clawback.workspace_id !== workspaceId
    ) {
      throw new N8nWebhookCallbackError(
        "n8n callback workspace linkage does not match this route.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    const linkage = await this.resolveLinkedExecution(workspaceId, input.connectionId, normalized);
    const existingCallback = linkage.execution.callback_result ?? null;

    if (existingCallback?.delivery_id === normalized.delivery_id) {
      return {
        deduplicated: true,
        review_id: linkage.review.id,
        work_item_id: linkage.workItem.id,
        callback_result: existingCallback,
      };
    }

    if (existingCallback) {
      throw new N8nWebhookCallbackError(
        "This external workflow already has a recorded callback result.",
        "n8n_webhook_callback_already_recorded",
        409,
      );
    }

    const receivedAt = this.now();
    const callbackResult = reviewedExternalWorkflowCallbackResultSchema.parse({
      delivery_id: normalized.delivery_id,
      status: normalized.status,
      response_status_code: normalized.response_status_code ?? null,
      summary: normalizeOptionalText(
        normalized.summary
        ?? (normalized.status === "failed" ? "n8n callback reported failure." : null),
      ),
      backend_reference: normalizeOptionalText(normalized.backend_reference ?? null),
      occurred_at: normalized.occurred_at ?? null,
      received_at: receivedAt.toISOString(),
    });

    const updatedOutcome = recordReviewedExternalWorkflowCallbackResult(
      linkage.execution,
      callbackResult,
    );
    const normalizedWorkItemState = normalizeExternalWorkflowCallbackWorkItemState(callbackResult);
    await this.options.workItemService.update(workspaceId, linkage.workItem.id, {
      status: normalizedWorkItemState.status,
      executionStatus: normalizedWorkItemState.executionStatus,
      executionError: normalizedWorkItemState.executionError,
      executionOutcomeJson: updatedOutcome,
    });
    await this.ensureActivityEvent(workspaceId, linkage, callbackResult);

    return {
      deduplicated: false,
      review_id: linkage.review.id,
      work_item_id: linkage.workItem.id,
      callback_result: callbackResult,
    };
  }

  private async resolveLinkedExecution(
    workspaceId: string,
    connectionId: string,
    payload: N8nWebhookCallbackPayload,
  ): Promise<RecordedLinkage> {
    const review = await this.getReview(workspaceId, payload.clawback.review_id);
    const workItem = await this.getWorkItem(workspaceId, payload.clawback.work_item_id);

    if (review.action_kind !== "run_external_workflow") {
      throw new N8nWebhookCallbackError(
        "This callback is not linked to a reviewed external workflow action.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    if (review.work_item_id !== workItem.id || workItem.review_id !== review.id) {
      throw new N8nWebhookCallbackError(
        "The callback review and work item linkage does not match Clawback truth.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    const request = review.request_payload
      ? externalWorkflowRequestSchema.safeParse(review.request_payload)
      : null;
    if (!request?.success) {
      throw new N8nWebhookCallbackError(
        "The linked review does not have a valid external workflow request snapshot.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    if (
      request.data.connection_id !== connectionId
      || request.data.workflow_identifier !== payload.workflow_identifier
    ) {
      throw new N8nWebhookCallbackError(
        "The callback does not match the approved external workflow request.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    const execution = this.getReviewedExternalWorkflowExecution(workItem.execution_outcome_json);
    if (!execution) {
      throw new N8nWebhookCallbackError(
        "The linked work item does not have a reviewed external workflow outcome.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    if (
      execution.connection_id !== connectionId
      || execution.workflow_identifier !== payload.workflow_identifier
      || execution.review_id !== review.id
    ) {
      throw new N8nWebhookCallbackError(
        "The callback does not match the recorded external workflow handoff.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    if (execution.status !== "succeeded") {
      throw new N8nWebhookCallbackError(
        "The linked external workflow handoff is not in a callback-ready state.",
        "n8n_webhook_unlinked",
        422,
      );
    }

    return {
      review,
      workItem,
      execution,
    };
  }

  private async ensureActivityEvent(
    workspaceId: string,
    linkage: RecordedLinkage,
    callbackResult: ReviewedExternalWorkflowCallbackResult,
  ) {
    await this.options.activityService.appendWorkItemResultOnce(workspaceId, {
      workerId: linkage.review.worker_id,
      routeKind: linkage.review.source_route_kind,
      resultKind: externalWorkflowCallbackActivityResultKind(callbackResult.status),
      title:
        callbackResult.status === "failed"
          ? "External workflow callback failed"
          : "External workflow callback recorded",
      summary: describeCallbackSummary(linkage.execution.workflow_identifier, callbackResult),
      reviewId: linkage.review.id,
      workItemId: linkage.workItem.id,
      assigneeIds: linkage.review.assignee_ids,
    });
  }

  private getReviewedExternalWorkflowExecution(
    value: unknown,
  ): ReviewedExternalWorkflowExecutionRecord | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as ReviewedExternalWorkflowExecutionRecord;
    return record.kind === "reviewed_external_workflow" ? record : null;
  }

  private async getReview(workspaceId: string, reviewId: string): Promise<ReviewRecord> {
    try {
      return await this.options.reviewService.getById(workspaceId, reviewId);
    } catch (error) {
      if (error instanceof ReviewNotFoundError) {
        throw new N8nWebhookCallbackError(
          "The callback review could not be linked in Clawback.",
          "n8n_webhook_unlinked",
          422,
        );
      }
      throw error;
    }
  }

  private async getWorkItem(workspaceId: string, workItemId: string): Promise<WorkItemRecord> {
    try {
      return await this.options.workItemService.getById(workspaceId, workItemId);
    } catch (error) {
      if (error instanceof WorkItemNotFoundError) {
        throw new N8nWebhookCallbackError(
          "The callback work item could not be linked in Clawback.",
          "n8n_webhook_unlinked",
          422,
        );
      }
      throw error;
    }
  }
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function describeCallbackSummary(
  workflowIdentifier: string,
  callbackResult: ReviewedExternalWorkflowCallbackResult,
) {
  const statusLabel = callbackResult.status === "failed" ? "failed" : "succeeded";
  const details = [
    callbackResult.summary,
    callbackResult.backend_reference ? `Reference: ${callbackResult.backend_reference}.` : null,
  ].filter(Boolean);

  return `n8n reported ${workflowIdentifier} ${statusLabel}.${details.length > 0 ? ` ${details.join(" ")}` : ""}`;
}
