import type {
  ExternalWorkflowRequest,
  ExternalWorkflowResult,
  ExecutionContinuityStateRecord,
  ReviewDecisionRecord,
  ReviewedExternalWorkflowExecutionRecord,
  ReviewedSendExecutionRecord,
} from "@clawback/contracts";
import { externalWorkflowRequestSchema } from "@clawback/contracts";
import {
  activityResultKinds,
  reviewDecisionActivityResultKind,
  reviewSurfaceActivityResultKind,
} from "../activity/index.js";
import { getRuntimeWorkerPackByKind } from "../worker-packs/index.js";

import type { ReviewRecordView } from "./types.js";
import type { ReviewService } from "./service.js";
import type { ReviewDecisionService } from "./decision-service.js";
import type { WorkItemService } from "../work-items/index.js";
import type { InboxItemService } from "../inbox/index.js";
import type { ActivityService } from "../activity/index.js";
import type { WorkerService } from "../workers/index.js";
import { WorkerNotFoundError } from "../workers/index.js";
import type { ReviewedEmailSender } from "./smtp-relay-email-sender.js";
import type {
  ReviewedExternalWorkflowExecutionError,
  ReviewedExternalWorkflowExecutor,
} from "./n8n-workflow-executor.js";
import {
  markReviewedExternalWorkflowExecutionFailed,
  markReviewedExternalWorkflowExecutionRunning,
  markReviewedExternalWorkflowExecutionSucceeded,
  queueReviewedExternalWorkflowExecution,
} from "./reviewed-external-workflow-execution.js";
import {
  markReviewedSendExecutionFailed,
  markReviewedSendExecutionRunning,
  markReviewedSendExecutionSent,
  queueReviewedSendExecution,
} from "./reviewed-send-execution.js";
type ResolveReviewWithEffectsInput = {
  decision: "approved" | "denied";
  rationale?: string | null;
  actor?: {
    surface: "web" | "whatsapp" | "slack";
    userId?: string | null;
    actorExternalId?: string | null;
    displayName?: string | null;
    payload?: Record<string, unknown>;
  };
};

type ActionCapabilityLookup = {
  list(workspaceId: string): Promise<{
    action_capabilities: Array<{
      id: string;
      worker_id: string;
      kind: string;
      boundary_mode: string;
      reviewer_ids: string[];
      destination_connection_id: string | null;
    }>;
  }>;
};

type ConnectionLookup = {
  getById(workspaceId: string, id: string): Promise<{
    id: string;
    provider: string;
    access_mode: string;
    status: string;
    label: string;
  }>;
  getStoredById?(workspaceId: string, id: string): Promise<{
    id: string;
    provider: string;
    accessMode: string;
    status: string;
    label: string;
    configJson?: Record<string, unknown>;
  }>;
};

type ReviewResolutionServiceOptions = {
  reviewService: ReviewService;
  workItemService: WorkItemService;
  inboxItemService: InboxItemService;
  activityService: ActivityService;
  workerService: Pick<WorkerService, "getById">;
  actionCapabilityService?: ActionCapabilityLookup;
  connectionService?: ConnectionLookup;
  reviewedEmailSender?: ReviewedEmailSender;
  reviewedExternalWorkflowExecutor?: ReviewedExternalWorkflowExecutor;
  reviewDecisionService?: ReviewDecisionService;
};

export class ReviewExecutionStateError extends Error {
  readonly code = "review_execution_invalid_state";
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
  }
}

export class ReviewExecutionConfigurationError extends Error {
  readonly code = "review_execution_not_configured";
  readonly statusCode = 503;

  constructor(message: string) {
    super(message);
  }
}

export class ReviewResolutionService {
  constructor(private readonly options: ReviewResolutionServiceOptions) {}

  async resolve(
    workspaceId: string,
    reviewId: string,
    input: ResolveReviewWithEffectsInput,
  ): Promise<ReviewRecordView> {
    // Pre-flight: verify execution capability BEFORE mutating review status.
    // This prevents partial-commit state where the review is "approved" but
    // execution is impossible (e.g., SMTP not configured).
    if (input.decision === "approved") {
      await this.preflightExecutionCheck(workspaceId, reviewId);
    }

    const { review, alreadyResolved } = await this.options.reviewService.resolve(workspaceId, reviewId, {
      status: input.decision,
    });

    let decision = await this.getRecordedReviewDecision(workspaceId, review.id);
    if (!alreadyResolved) {
      decision = await this.ensureReviewDecision(workspaceId, review, input);
    }
    await this.ensureEffects(workspaceId, review, input.rationale ?? null, {
      allowRetry: false,
      actor: alreadyResolved ? null : (input.actor ?? null),
      decision,
    });

    return this.options.reviewService.getById(workspaceId, reviewId);
  }

  async retryApprovedSend(workspaceId: string, reviewId: string): Promise<ReviewRecordView> {
    const review = await this.options.reviewService.getById(workspaceId, reviewId);
    if (review.action_kind !== "send_email") {
      throw new ReviewExecutionStateError("Only send_email reviews support retry.");
    }
    if (review.status === "pending" || review.status === "denied") {
      throw new ReviewExecutionStateError("This review is not approved for retry.");
    }

    await this.prepareReviewedSendExecution(workspaceId, review);

    const decision = await this.getRecordedReviewDecision(workspaceId, review.id);
    await this.ensureEffects(workspaceId, review, null, {
      allowRetry: true,
      actor: null,
      decision,
    });

    return this.options.reviewService.getById(workspaceId, reviewId);
  }

  /**
   * Verify that execution infrastructure is available before approving.
   * Throws ReviewExecutionConfigurationError if execution is impossible,
   * keeping the review in "pending" state so it can be retried later.
   */
  private async preflightExecutionCheck(
    workspaceId: string,
    reviewId: string,
  ): Promise<void> {
    const review = await this.options.reviewService.getById(workspaceId, reviewId);

    if (review.status === "denied") {
      return;
    }

    if (review.action_kind === "send_email") {
      await this.prepareReviewedSendExecution(workspaceId, review);
      return;
    }

    if (review.action_kind === "run_external_workflow") {
      await this.prepareReviewedExternalWorkflowExecution(workspaceId, review);
      return;
    }
  }

  private async ensureEffects(
    workspaceId: string,
    review: ReviewRecordView,
    rationale: string | null,
    options: {
      allowRetry: boolean;
      actor: ResolveReviewWithEffectsInput["actor"] | null;
      decision: ReviewDecisionRecord | null;
    },
  ): Promise<void> {
    if (review.status === "denied") {
      await this.ensureDeniedState(workspaceId, review);
      await this.ensureFollowUpReviewContinuationState(workspaceId, review, "denied");
      await this.ensureInboxResolved(workspaceId, review);
      await this.ensureReviewActivityEvent(workspaceId, review, rationale);
      await this.ensureSurfaceActivityEvent(workspaceId, review, options.actor);
      return;
    }

    await this.ensureApprovedState(workspaceId, review);
    await this.ensureFollowUpReviewContinuationState(workspaceId, review, "approved");
    await this.ensureReviewActivityEvent(workspaceId, review, rationale);
    await this.ensureSurfaceActivityEvent(workspaceId, review, options.actor);

    if (review.action_kind === "send_email") {
      await this.ensureReviewedSend(workspaceId, review, options.allowRetry, options.decision);
      return;
    }

    if (review.action_kind === "run_external_workflow") {
      await this.ensureReviewedExternalWorkflow(
        workspaceId,
        review,
        options.allowRetry,
        options.decision,
      );
      return;
    }

    await this.ensureInboxResolved(workspaceId, review);
  }

  private async ensureReviewDecision(
    workspaceId: string,
    review: ReviewRecordView,
    input: ResolveReviewWithEffectsInput,
  ): Promise<ReviewDecisionRecord | null> {
    const service = this.options.reviewDecisionService;
    if (!service) {
      return null;
    }

    return service.record(workspaceId, review, {
      decision: input.decision,
      surface: input.actor?.surface ?? "web",
      decidedByUserId: input.actor?.userId ?? null,
      actorExternalId: input.actor?.actorExternalId ?? null,
      rationale: input.rationale ?? null,
      payload: input.actor?.payload ?? {},
    });
  }

  private async ensureDeniedState(
    workspaceId: string,
    review: ReviewRecordView,
  ): Promise<void> {
    if (!review.work_item_id) {
      return;
    }

    const workItem = await this.options.workItemService.getById(workspaceId, review.work_item_id);
    const shouldUpdate =
      workItem.status !== "pending_review"
      || workItem.review_id !== review.id
      || workItem.execution_status !== "not_requested"
      || workItem.execution_error !== null;

    if (!shouldUpdate) {
      return;
    }

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: "pending_review",
      reviewId: review.id,
      executionStatus: "not_requested",
      executionError: null,
    });
  }

  private async ensureApprovedState(
    workspaceId: string,
    review: ReviewRecordView,
  ): Promise<void> {
    if (!review.work_item_id) {
      return;
    }

    const workItem = await this.options.workItemService.getById(workspaceId, review.work_item_id);
    if (
      workItem.review_id === review.id
      && (
        workItem.status === "approved"
        || workItem.status === "completed"
        || workItem.status === "sent"
        || workItem.status === "failed"
      )
    ) {
      return;
    }

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: workItem.status === "sent" ? "sent" : "approved",
      reviewId: review.id,
    });
  }

  private async ensureReviewedSend(
    workspaceId: string,
    review: ReviewRecordView,
    allowRetry: boolean,
    decision: ReviewDecisionRecord | null,
  ): Promise<void> {
    const prepared = await this.prepareReviewedSendExecution(workspaceId, review);
    const {
      workItem,
      runtimePack,
      executionState,
      priorExecutionOutcome,
    } = prepared;

    if (prepared.completed) {
      const completedState = executionState
        ? runtimePack.runtime.hooks.markCompleted(executionState, "review_approved")
        : null;
      await this.options.reviewService.setStatus(workspaceId, review.id, "completed");
      if (completedState) {
        await this.syncFollowUpReviewExecutionState(workspaceId, review, completedState, {
          resolveInbox: true,
        });
      }
      await this.ensureInboxResolved(workspaceId, review);
      await this.ensureWorkItemActivityEvent(workspaceId, workItem.id, {
        review,
        resultKind: activityResultKinds.workItemSent,
        title: "Reviewed email sent",
        summary: `Delivery completed to ${workItem.draft_to ?? review.action_destination ?? "the recipient"}.`,
      });
      return;
    }

    if (workItem.execution_status === "failed" && !allowRetry) {
      return;
    }

    const runningState = executionState
      ? runtimePack.runtime.hooks.markActionRunning(executionState)
      : null;
    const queuedExecutionOutcome = queueReviewedSendExecution({
      existing: priorExecutionOutcome,
      reviewId: review.id,
      decision,
      connectionId: prepared.connection.id,
      connectionLabel: prepared.connection.label,
      attemptedAt: new Date(),
    });
    const runningExecutionOutcome = markReviewedSendExecutionRunning(queuedExecutionOutcome);

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: "approved",
      reviewId: review.id,
      executionStatus: "queued",
      executionError: null,
      executionStateJson: runningState,
      executionOutcomeJson: queuedExecutionOutcome,
    });

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: "approved",
      reviewId: review.id,
      executionStatus: "executing",
      executionError: null,
      executionStateJson: runningState,
      executionOutcomeJson: runningExecutionOutcome,
    });
    if (runningState) {
      await this.syncFollowUpReviewInboxExecutionState(workspaceId, review, runningState);
    }

    try {
      const attemptCount = queuedExecutionOutcome.attempt_count ?? 1;
      const sendResult = await prepared.emailSender.sendReviewedEmail({
        workspaceId,
        reviewId: review.id,
        workItemId: workItem.id,
        to: prepared.to,
        subject: prepared.subject,
        body: prepared.body,
        idempotencyKey: `${workItem.id}:${attemptCount}`,
      });

      const completedState = runningState
        ? runtimePack.runtime.hooks.markCompleted(runningState, "review_approved")
        : null;
      const sentExecutionOutcome = markReviewedSendExecutionSent(runningExecutionOutcome, {
        providerMessageId: sendResult.providerMessageId,
        sentAt: new Date(),
      });
      await this.options.workItemService.update(workspaceId, workItem.id, {
        status: "sent",
        executionStatus: "completed",
        executionError: null,
        executionStateJson: completedState,
        executionOutcomeJson: sentExecutionOutcome,
      });
      await this.options.reviewService.setStatus(workspaceId, review.id, "completed");
      if (completedState) {
        await this.syncFollowUpReviewInboxExecutionState(workspaceId, review, completedState, {
          resolve: true,
        });
      }
      await this.ensureInboxResolved(workspaceId, review);
      await this.ensureWorkItemActivityEvent(workspaceId, workItem.id, {
        review,
        resultKind: activityResultKinds.workItemSent,
        title: "Reviewed email sent",
        summary: `Sent via ${prepared.connection.label} to ${prepared.to}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Email delivery failed.";
      const errorClassification = this.classifySmtpError(error);
      const failedState = runningState
        ? runtimePack.runtime.hooks.markFailed(runningState)
        : null;
      const failedExecutionOutcome = markReviewedSendExecutionFailed(runningExecutionOutcome, {
        error: message,
        failedAt: new Date(),
        errorClassification,
      });
      await this.options.workItemService.update(workspaceId, workItem.id, {
        status: "failed",
        executionStatus: "failed",
        executionError: message,
        executionStateJson: failedState,
        executionOutcomeJson: failedExecutionOutcome,
      });
      if (failedState) {
        await this.syncFollowUpReviewInboxExecutionState(workspaceId, review, failedState);
      }
      await this.ensureWorkItemActivityEvent(workspaceId, workItem.id, {
        review,
        resultKind: activityResultKinds.sendFailed,
        title: "Reviewed send failed",
        summary: message,
      });
    }
  }

  private async ensureReviewedExternalWorkflow(
    workspaceId: string,
    review: ReviewRecordView,
    allowRetry: boolean,
    decision: ReviewDecisionRecord | null,
  ): Promise<void> {
    const prepared = await this.prepareReviewedExternalWorkflowExecution(workspaceId, review);
    const {
      workItem,
      request,
      priorExecutionOutcome,
    } = prepared;

    if (prepared.completed) {
      await this.options.reviewService.setStatus(workspaceId, review.id, "completed");
      await this.ensureInboxResolved(workspaceId, review);
      await this.ensureWorkItemActivityEvent(workspaceId, workItem.id, {
        review,
        resultKind: activityResultKinds.externalWorkflowHandedOff,
        title: "External workflow handed off",
        summary: `Clawback handed ${request.workflow_identifier} to n8n.`,
      });
      return;
    }

    if (workItem.execution_status === "failed" && !allowRetry) {
      return;
    }

    const queuedExecutionOutcome = queueReviewedExternalWorkflowExecution({
      existing: priorExecutionOutcome,
      reviewId: review.id,
      decision,
      request,
      connectionLabel: prepared.connection.label,
      attemptedAt: new Date(),
    });
    const runningExecutionOutcome = markReviewedExternalWorkflowExecutionRunning(
      queuedExecutionOutcome,
    );

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: "approved",
      reviewId: review.id,
      executionStatus: "queued",
      executionError: null,
      executionOutcomeJson: queuedExecutionOutcome,
    });

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: "approved",
      reviewId: review.id,
      executionStatus: "executing",
      executionError: null,
      executionOutcomeJson: runningExecutionOutcome,
    });

    try {
      const result = await prepared.executor.runReviewedExternalWorkflow({
        workspaceId,
        reviewId: review.id,
        workItemId: workItem.id,
        connection: {
          id: prepared.connection.id,
          label: prepared.connection.label,
          ...(prepared.connection.configJson !== undefined
            ? { configJson: prepared.connection.configJson }
            : {}),
        },
        request,
      });

      const succeededExecutionOutcome = markReviewedExternalWorkflowExecutionSucceeded(
        runningExecutionOutcome,
        {
          ...result,
          completedAt: new Date(),
        },
      );
      await this.options.workItemService.update(workspaceId, workItem.id, {
        status: "completed",
        executionStatus: "completed",
        executionError: null,
        executionOutcomeJson: succeededExecutionOutcome,
      });
      await this.options.reviewService.setStatus(workspaceId, review.id, "completed");
      await this.ensureInboxResolved(workspaceId, review);
      await this.ensureWorkItemActivityEvent(workspaceId, workItem.id, {
        review,
        resultKind: activityResultKinds.externalWorkflowHandedOff,
        title: "External workflow handed off",
        summary: this.describeExternalWorkflowSuccess(request, prepared.connection.label, result),
      });
    } catch (error) {
      const failure = this.normalizeExternalWorkflowFailure(error);
      const failedExecutionOutcome = markReviewedExternalWorkflowExecutionFailed(
        runningExecutionOutcome,
        {
          error: failure.message,
          failedAt: new Date(),
          responseStatusCode: failure.responseStatusCode,
          responseSummary: failure.responseSummary,
          backendReference: failure.backendReference,
        },
      );
      await this.options.workItemService.update(workspaceId, workItem.id, {
        status: "failed",
        executionStatus: "failed",
        executionError: failure.message,
        executionOutcomeJson: failedExecutionOutcome,
      });
      await this.ensureWorkItemActivityEvent(workspaceId, workItem.id, {
        review,
        resultKind: activityResultKinds.externalWorkflowHandoffFailed,
        title: "External workflow handoff failed",
        summary: failure.message,
      });
    }
  }

  private async getSendCapability(workspaceId: string, workerId: string) {
    const service = this.options.actionCapabilityService;
    if (!service) {
      throw new ReviewExecutionConfigurationError("Action capability service is not configured.");
    }

    const result = await service.list(workspaceId);
    const capability = result.action_capabilities.find(
      (item) => item.worker_id === workerId && item.kind === "send_email",
    );
    if (!capability) {
      throw new ReviewExecutionConfigurationError(
        `No send_email capability is configured for worker ${workerId}.`,
      );
    }
    if (!capability.destination_connection_id) {
      throw new ReviewExecutionConfigurationError(
        `Worker ${workerId} has no configured send destination.`,
      );
    }
    return capability;
  }

  private async getSendConnection(workspaceId: string, connectionId: string) {
    const service = this.options.connectionService;
    if (!service) {
      throw new ReviewExecutionConfigurationError("Connection service is not configured.");
    }

    const connection = await service.getById(workspaceId, connectionId);
    if (connection.provider !== "smtp_relay") {
      throw new ReviewExecutionConfigurationError(
        `Connection ${connection.id} is not an smtp_relay destination.`,
      );
    }
    if (connection.access_mode !== "write_capable" || connection.status !== "connected") {
      throw new ReviewExecutionConfigurationError(
        `SMTP relay connection ${connection.id} is not ready for sends.`,
      );
    }
    return connection;
  }

  private async getExternalWorkflowConnection(workspaceId: string, connectionId: string) {
    const service = this.options.connectionService;
    if (!service) {
      throw new ReviewExecutionConfigurationError("Connection service is not configured.");
    }

    if (!service.getStoredById) {
      throw new ReviewExecutionConfigurationError(
        "Stored connection lookup is not configured for external workflow execution.",
      );
    }

    const connection = await service.getStoredById(workspaceId, connectionId);
    if (connection.provider !== "n8n") {
      throw new ReviewExecutionConfigurationError(
        `Connection ${connection.id} is not an n8n backend.`,
      );
    }
    if (connection.accessMode !== "write_capable" || connection.status !== "connected") {
      throw new ReviewExecutionConfigurationError(
        `n8n backend connection ${connection.id} is not ready for outbound handoff.`,
      );
    }
    return connection;
  }

  private async ensureInboxResolved(
    workspaceId: string,
    review: ReviewRecordView,
  ): Promise<void> {
    const inboxItem = await this.options.inboxItemService.findByReviewId(workspaceId, review.id);
    if (!inboxItem || inboxItem.state !== "open") {
      return;
    }

    await this.options.inboxItemService.resolve(workspaceId, inboxItem.id);
  }

  private async ensureFollowUpReviewContinuationState(
    workspaceId: string,
    review: ReviewRecordView,
    decision: "approved" | "denied",
  ): Promise<ExecutionContinuityStateRecord | null> {
    const runtimePack = await this.getRuntimeWorkerPackForWorker(workspaceId, review.worker_id);
    if (!runtimePack?.runtime.resumesAfterReview) {
      return null;
    }

    const executionState = await this.getFollowUpReviewExecutionState(
      workspaceId,
      review,
      undefined,
      runtimePack,
    );
    if (!executionState) {
      return null;
    }

    const resumedState = runtimePack.runtime.hooks.resumeAfterReviewDecision(executionState, decision);
    await this.syncFollowUpReviewExecutionState(workspaceId, review, resumedState, {
      resolveInbox: decision === "denied",
    });
    return resumedState;
  }

  private async getFollowUpReviewExecutionState(
    workspaceId: string,
    review: ReviewRecordView,
    workItemOverride?: Awaited<ReturnType<WorkItemService["getById"]>>,
    runtimePackOverride?: ReturnType<typeof getRuntimeWorkerPackByKind> | null,
  ): Promise<ExecutionContinuityStateRecord | null> {
    if (!review.work_item_id) {
      return null;
    }
    const runtimePack = runtimePackOverride
      ?? await this.getRuntimeWorkerPackForWorker(workspaceId, review.worker_id);
    if (!runtimePack?.runtime.resumesAfterReview) {
      return null;
    }

    const workItem = workItemOverride
      ?? await this.options.workItemService.getById(workspaceId, review.work_item_id);
    return runtimePack.runtime.hooks.parseExecutionState(workItem.execution_state_json)
      ?? runtimePack.runtime.hooks.buildPausedExecutionState({
        lastDecision: workItem.triage_json?.decision ?? "shadow_draft",
        pauseReason: "human_review",
      });
  }

  private async prepareReviewedSendExecution(
    workspaceId: string,
    review: ReviewRecordView,
  ): Promise<
    | {
        completed: true;
        workItem: Awaited<ReturnType<WorkItemService["getById"]>>;
        runtimePack: NonNullable<ReturnType<typeof getRuntimeWorkerPackByKind>>;
        executionState: ExecutionContinuityStateRecord | null;
        priorExecutionOutcome: ReviewedSendExecutionRecord | null;
      }
    | {
        completed: false;
        workItem: Awaited<ReturnType<WorkItemService["getById"]>>;
        runtimePack: NonNullable<ReturnType<typeof getRuntimeWorkerPackByKind>>;
        executionState: ExecutionContinuityStateRecord | null;
        priorExecutionOutcome: ReviewedSendExecutionRecord | null;
        connection: Awaited<ReturnType<ReviewResolutionService["getSendConnection"]>>;
        emailSender: ReviewedEmailSender;
        to: string;
        subject: string;
        body: string;
      }
  > {
    if (!review.work_item_id) {
      throw new ReviewExecutionStateError("send_email review is missing work_item_id.");
    }

    const workItem = await this.options.workItemService.getById(workspaceId, review.work_item_id);
    const runtimePack = await this.getRuntimeWorkerPackForWorker(workspaceId, review.worker_id);
    if (!runtimePack) {
      throw new ReviewExecutionStateError(
        `Worker ${review.worker_id} does not have a runtime-capable pack for reviewed continuation.`,
      );
    }
    const executionState = await this.getFollowUpReviewExecutionState(
      workspaceId,
      review,
      workItem,
      runtimePack,
    );
    const priorExecutionOutcome = this.getReviewedSendExecutionOutcome(workItem.execution_outcome_json);

    if (workItem.status === "sent" && workItem.execution_status === "completed") {
      return {
        completed: true,
        workItem,
        runtimePack,
        executionState,
        priorExecutionOutcome,
      };
    }

    const capability = await this.getSendCapability(workspaceId, review.worker_id);
    const connectionId = capability.destination_connection_id;
    if (!connectionId) {
      throw new ReviewExecutionConfigurationError(
        `Worker ${review.worker_id} has no configured send destination.`,
      );
    }
    const connection = await this.getSendConnection(workspaceId, connectionId);
    const emailSender = this.options.reviewedEmailSender;
    if (!emailSender) {
      throw new ReviewExecutionConfigurationError(
        "Reviewed send execution is not configured for this control-plane instance.",
      );
    }

    const to = workItem.draft_to ?? review.action_destination;
    const subject = workItem.draft_subject;
    const body = workItem.draft_body;
    if (!to || !subject || !body) {
      throw new ReviewExecutionStateError(
        "Reviewed send requires a draft recipient, subject, and body.",
      );
    }

    return {
      completed: false,
      workItem,
      runtimePack,
      executionState,
      priorExecutionOutcome,
      connection,
      emailSender,
      to,
      subject,
      body,
    };
  }

  private async prepareReviewedExternalWorkflowExecution(
    workspaceId: string,
    review: ReviewRecordView,
  ): Promise<
    | {
        completed: true;
        workItem: Awaited<ReturnType<WorkItemService["getById"]>>;
        request: ExternalWorkflowRequest;
        priorExecutionOutcome: ReviewedExternalWorkflowExecutionRecord | null;
      }
    | {
        completed: false;
        workItem: Awaited<ReturnType<WorkItemService["getById"]>>;
        request: ExternalWorkflowRequest;
        priorExecutionOutcome: ReviewedExternalWorkflowExecutionRecord | null;
        connection: Awaited<ReturnType<ReviewResolutionService["getExternalWorkflowConnection"]>>;
        executor: ReviewedExternalWorkflowExecutor;
      }
  > {
    if (!review.work_item_id) {
      throw new ReviewExecutionStateError(
        "run_external_workflow review is missing work_item_id.",
      );
    }

    const workItem = await this.options.workItemService.getById(workspaceId, review.work_item_id);
    const request = this.getExternalWorkflowRequest(review.request_payload);
    const priorExecutionOutcome = this.getReviewedExternalWorkflowExecutionOutcome(
      workItem.execution_outcome_json,
    );

    if (workItem.status === "completed" && workItem.execution_status === "completed") {
      return {
        completed: true,
        workItem,
        request,
        priorExecutionOutcome,
      };
    }

    const connection = await this.getExternalWorkflowConnection(workspaceId, request.connection_id);
    const executor = this.options.reviewedExternalWorkflowExecutor;
    if (!executor) {
      throw new ReviewExecutionConfigurationError(
        "Reviewed external workflow execution is not configured for this control-plane instance.",
      );
    }

    return {
      completed: false,
      workItem,
      request,
      priorExecutionOutcome,
      connection,
      executor,
    };
  }

  private async getRecordedReviewDecision(
    workspaceId: string,
    reviewId: string,
  ): Promise<ReviewDecisionRecord | null> {
    const service = this.options.reviewDecisionService;
    if (!service) {
      return null;
    }

    return service.findByReviewId(workspaceId, reviewId);
  }

  private getReviewedSendExecutionOutcome(
    value: unknown,
  ): ReviewedSendExecutionRecord | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as ReviewedSendExecutionRecord;
    return record.kind === "reviewed_send_email" ? record : null;
  }

  private getExternalWorkflowRequest(value: unknown): ExternalWorkflowRequest {
    return externalWorkflowRequestSchema.parse(value);
  }

  private getReviewedExternalWorkflowExecutionOutcome(
    value: unknown,
  ): ReviewedExternalWorkflowExecutionRecord | null {
    if (!value || typeof value !== "object") {
      return null;
    }

    const record = value as ReviewedExternalWorkflowExecutionRecord;
    return record.kind === "reviewed_external_workflow" ? record : null;
  }

  private describeExternalWorkflowSuccess(
    request: ExternalWorkflowRequest,
    connectionLabel: string,
    result: ExternalWorkflowResult,
  ) {
    const reference = result.backend_reference ? ` Reference: ${result.backend_reference}.` : "";
    const responseSummary = result.response_summary ? ` ${result.response_summary}` : "";
    return `Clawback handed ${request.workflow_identifier} to ${connectionLabel}.${responseSummary}${reference}`.trim();
  }

  private normalizeExternalWorkflowFailure(
    error: unknown,
  ): {
    message: string;
    responseStatusCode: number | null;
    responseSummary: string | null;
    backendReference: string | null;
  } {
    if (error instanceof Error) {
      const candidate = error as Error & Partial<ReviewedExternalWorkflowExecutionError>;
      return {
        message: candidate.message,
        responseStatusCode:
          typeof candidate.responseStatusCode === "number" ? candidate.responseStatusCode : null,
        responseSummary:
          typeof candidate.responseSummary === "string" ? candidate.responseSummary : null,
        backendReference:
          typeof candidate.backendReference === "string" ? candidate.backendReference : null,
      };
    }

    return {
      message: "External workflow handoff failed.",
      responseStatusCode: null,
      responseSummary: null,
      backendReference: null,
    };
  }

  private async syncFollowUpReviewExecutionState(
    workspaceId: string,
    review: ReviewRecordView,
    executionState: ExecutionContinuityStateRecord,
    options: {
      resolveInbox?: boolean;
    } = {},
  ): Promise<void> {
    if (review.work_item_id) {
      await this.options.workItemService.update(workspaceId, review.work_item_id, {
        executionStateJson: executionState,
      });
    }

    await this.syncFollowUpReviewInboxExecutionState(workspaceId, review, executionState, {
      resolve: options.resolveInbox ?? false,
    });
  }

  private async syncFollowUpReviewInboxExecutionState(
    workspaceId: string,
    review: ReviewRecordView,
    executionState: ExecutionContinuityStateRecord,
    options: {
      resolve?: boolean;
    } = {},
  ): Promise<void> {
    const inboxItem = await this.options.inboxItemService.findByReviewId(workspaceId, review.id);
    if (!inboxItem) {
      return;
    }

    await this.options.inboxItemService.update(workspaceId, inboxItem.id, {
      ...(options.resolve && inboxItem.state === "open" ? { state: "resolved" as const } : {}),
      executionStateJson: executionState,
    });
  }

  private async getRuntimeWorkerPackForWorker(
    workspaceId: string,
    workerId: string,
  ): Promise<NonNullable<ReturnType<typeof getRuntimeWorkerPackByKind>> | null> {
    try {
      const worker = await this.options.workerService.getById(workspaceId, workerId);
      return getRuntimeWorkerPackByKind(worker.kind);
    } catch (error) {
      if (error instanceof WorkerNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  private classifySmtpError(error: unknown): "transient" | "permanent" {
    if (!(error instanceof Error)) {
      return "permanent";
    }

    const message = error.message.toLowerCase();
    const smtpError = error as Error & { responseCode?: number };
    const responseCode = smtpError.responseCode;

    // SMTP 4xx codes are transient (temporary failures)
    if (typeof responseCode === "number" && responseCode >= 400 && responseCode < 500) {
      return "transient";
    }

    // SMTP 5xx codes are permanent (e.g., 550 invalid recipient, 553 auth)
    if (typeof responseCode === "number" && responseCode >= 500) {
      return "permanent";
    }

    // Connection-level errors are transient
    const transientPatterns = [
      "timeout",
      "econnrefused",
      "econnreset",
      "etimedout",
      "enotfound",
      "dns",
      "connection closed",
      "socket hang up",
      "temporary",
    ];
    if (transientPatterns.some((pattern) => message.includes(pattern))) {
      return "transient";
    }

    // Auth and config errors are permanent
    const permanentPatterns = [
      "invalid login",
      "authentication",
      "auth failed",
      "not configured",
      "missing",
    ];
    if (permanentPatterns.some((pattern) => message.includes(pattern))) {
      return "permanent";
    }

    // Default to transient so retry is possible
    return "transient";
  }

  private async ensureReviewActivityEvent(
    workspaceId: string,
    review: ReviewRecordView,
    rationale: string | null,
  ): Promise<void> {
    const isApprovedState = review.status === "approved" || review.status === "completed";
    await this.options.activityService.appendReviewResultOnce(workspaceId, {
      workerId: review.worker_id,
      routeKind: review.source_route_kind,
      resultKind: reviewDecisionActivityResultKind(
        isApprovedState ? "approved" : "denied",
      ),
      title: isApprovedState ? "Review approved" : "Review denied",
      summary: rationale,
      reviewId: review.id,
      workItemId: review.work_item_id,
    });
  }

  private async ensureWorkItemActivityEvent(
    workspaceId: string,
    workItemId: string,
    input: {
      review: ReviewRecordView;
      resultKind: string;
      title: string;
      summary: string | null;
    },
  ): Promise<void> {
    await this.options.activityService.appendWorkItemResultOnce(workspaceId, {
      workerId: input.review.worker_id,
      routeKind: input.review.source_route_kind,
      resultKind: input.resultKind,
      title: input.title,
      summary: input.summary,
      reviewId: input.review.id,
      workItemId,
      assigneeIds: input.review.assignee_ids,
    });
  }

  private async ensureSurfaceActivityEvent(
    workspaceId: string,
    review: ReviewRecordView,
    actor: ResolveReviewWithEffectsInput["actor"] | null,
  ): Promise<void> {
    if (!actor || actor.surface === "web") {
      return;
    }

    const decisionLabel =
      review.status === "denied"
        ? "Denied"
        : review.status === "approved" || review.status === "completed"
          ? "Approved"
          : "Resolved";
    const actorLabel = actor.displayName?.trim()
      || actor.actorExternalId?.trim()
      || actor.userId
      || "an operator";

    await this.options.activityService.appendReviewResultOnce(workspaceId, {
      workerId: review.worker_id,
      routeKind: review.source_route_kind,
      resultKind: reviewSurfaceActivityResultKind(actor.surface),
      title: `Review resolved from ${actor.surface}`,
      summary: `${decisionLabel} by ${actorLabel}.`,
      reviewId: review.id,
      workItemId: review.work_item_id,
      assigneeIds: review.assignee_ids,
    });
  }
}
