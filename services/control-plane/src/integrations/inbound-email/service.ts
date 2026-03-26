import type { ExecutionContinuityStateRecord } from "@clawback/contracts";

import { buildReplyDraft } from "../email-draft.js";
import {
  buildDeduplicatedIngressResult,
  buildIngressResult,
} from "../shared-results.js";
import { buildStoredSourceEvent } from "../shared-source-events.js";
import { getRuntimeWorkerPackByKind } from "../../worker-packs/index.js";
import type {
  InboundEmailPayload,
  InboundEmailResult,
  InputRouteLookup,
  SourceEventStore,
  StoredSourceEvent,
  WorkerLookup,
} from "./types.js";

// ---------------------------------------------------------------------------
// Dependency contracts (work item + inbox item creation)
// ---------------------------------------------------------------------------

type WorkItemCreator = {
  create(
    workspaceId: string,
    input: {
      workerId: string;
      kind: "email_draft";
      title: string;
      summary?: string | null;
      draftTo?: string | null;
      draftSubject?: string | null;
      draftBody?: string | null;
      executionStatus?: "not_requested" | "queued" | "executing" | "completed" | "failed";
      executionError?: string | null;
      assigneeIds?: string[];
      reviewerIds?: string[];
      sourceRouteKind?: "forward_email" | null;
      sourceEventId?: string | null;
      executionStateJson?: ExecutionContinuityStateRecord | null;
    },
  ): Promise<{ id: string }>;
  update(
    workspaceId: string,
    id: string,
    input: {
      status?: "draft" | "pending_review" | "completed" | "sent" | "created" | "failed";
      reviewId?: string | null;
      executionStateJson?: ExecutionContinuityStateRecord | null;
    },
  ): Promise<{ id: string }>;
};

type InboxItemCreator = {
  create(
    workspaceId: string,
    input: {
      kind: "review";
      title: string;
      summary?: string | null;
      assigneeIds?: string[];
      workerId?: string | null;
      workItemId?: string | null;
      reviewId?: string | null;
      routeKind?: "forward_email" | null;
      executionStateJson?: ExecutionContinuityStateRecord | null;
    },
  ): Promise<{ id: string }>;
};

type ReviewCreator = {
  create(
    workspaceId: string,
    input: {
      actionKind: "send_email";
      workerId: string;
      workItemId?: string | null;
      reviewerIds?: string[];
      assigneeIds?: string[];
      sourceRouteKind?: "forward_email" | null;
      actionDestination?: string | null;
    },
  ): Promise<{ id: string }>;
};

type ActivityAppender = {
  append(
    workspaceId: string,
    input: {
      workerId?: string | null;
      routeKind?: "forward_email" | null;
      resultKind: string;
      title: string;
      summary?: string | null;
      assigneeIds?: string[];
      workItemId?: string | null;
      reviewId?: string | null;
    },
  ): Promise<{ id: string }>;
};

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

type InboundEmailServiceOptions = {
  sourceEventStore: SourceEventStore;
  inputRouteLookup: InputRouteLookup;
  workerLookup: WorkerLookup;
  workItemService: WorkItemCreator;
  inboxItemService: InboxItemCreator;
  reviewService: ReviewCreator;
  activityService: ActivityAppender;
  now?: () => Date;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class InboundEmailRoutingError extends Error {
  readonly code = "inbound_email_routing_error";
  readonly statusCode = 404;
  constructor(address: string) {
    super(`No active input route found for address: ${address}`);
  }
}

export class InboundEmailWorkerNotFoundError extends Error {
  readonly code = "inbound_email_worker_not_found";
  readonly statusCode = 404;
  constructor(workerId: string) {
    super(`Worker not found for inbound email route: ${workerId}`);
  }
}

export class InboundEmailWorkerRuntimeNotAvailableError extends Error {
  readonly code = "inbound_email_worker_runtime_unavailable";
  readonly statusCode = 409;
  constructor(workerId: string) {
    super(`Worker ${workerId} does not have a runtime-capable worker pack for inbound email.`);
  }
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export class InboundEmailService {
  private readonly now: () => Date;

  constructor(private readonly options: InboundEmailServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async processInboundEmail(payload: InboundEmailPayload): Promise<InboundEmailResult> {
    // 1. Route the email by "to" address
    const route = await this.options.inputRouteLookup.findByAddress(payload.to);
    if (!route) {
      throw new InboundEmailRoutingError(payload.to);
    }

    // 2. Look up the worker
    const worker = await this.options.workerLookup.findById(route.workspaceId, route.workerId);
    if (!worker) {
      throw new InboundEmailWorkerNotFoundError(route.workerId);
    }
    const runtimePack = getRuntimeWorkerPackByKind(worker.kind);
    if (!runtimePack) {
      throw new InboundEmailWorkerRuntimeNotAvailableError(worker.id);
    }

    const workspaceId = route.workspaceId;

    // 3. Idempotency check using external message-id
    const existing = await this.options.sourceEventStore.findByExternalMessageId(
      workspaceId,
      payload.message_id,
    );
    if (existing) {
      return buildDeduplicatedIngressResult({
        sourceEventId: existing.id,
        workerId: worker.id,
        workspaceId,
        ids: {
          work_item_id: "",
          inbox_item_id: "",
          review_id: "",
        },
      });
    }

    // 4. Create source event
    const now = this.now();
    const draft = buildReplyDraft({
      from: payload.from,
      subject: payload.subject,
      bodyText: payload.body_text,
    });
    const sourceEvent: StoredSourceEvent = buildStoredSourceEvent({
      workspaceId,
      workerId: worker.id,
      inputRouteId: route.id,
      kind: "forwarded_email",
      externalMessageId: payload.message_id,
      fromAddress: payload.from,
      toAddress: payload.to,
      subject: payload.subject,
      bodyText: payload.body_text,
      bodyHtml: payload.body_html ?? null,
      attachmentsJson: payload.attachments ?? [],
      rawPayloadJson: payload as unknown as Record<string, unknown>,
      createdAt: now,
    });
    const createdSource = await this.options.sourceEventStore.create(sourceEvent);

    // 5. Create work item (email_draft, status: draft)
    const workItem = await this.options.workItemService.create(workspaceId, {
      workerId: worker.id,
      kind: "email_draft",
      title: `Follow-up: ${payload.subject}`,
      summary: `Draft reply to ${payload.from} regarding "${payload.subject}".`,
      draftTo: draft.to,
      draftSubject: draft.subject,
      draftBody: draft.body,
      executionStatus: "not_requested",
      executionError: null,
      assigneeIds: worker.assigneeIds,
      reviewerIds: worker.reviewerIds,
      sourceRouteKind: "forward_email",
      sourceEventId: createdSource.id,
    });

    const reviewAssignees =
      worker.reviewerIds.length > 0 ? worker.reviewerIds : worker.assigneeIds;
    const review = await this.options.reviewService.create(workspaceId, {
      actionKind: "send_email",
      workerId: worker.id,
      workItemId: workItem.id,
      reviewerIds: reviewAssignees,
      assigneeIds: reviewAssignees,
      sourceRouteKind: "forward_email",
      actionDestination: payload.from,
    });

    const executionState = runtimePack.runtime.hooks.buildPausedExecutionState({
      lastDecision: "shadow_draft",
      pauseReason: "human_review",
    });

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: "pending_review",
      reviewId: review.id,
      executionStateJson: executionState,
    });

    // 6. Create inbox item (kind: review, state: open)
    const inboxItem = await this.options.inboxItemService.create(workspaceId, {
      kind: "review",
      title: `Review email draft: ${payload.subject}`,
      summary: `The Follow-Up worker drafted a reply for "${payload.subject}" from ${payload.from}.`,
      assigneeIds: reviewAssignees,
      workerId: worker.id,
      workItemId: workItem.id,
      reviewId: review.id,
      routeKind: "forward_email",
      executionStateJson: executionState,
    });

    // 7. Create activity event
    await this.options.activityService.append(workspaceId, {
      workerId: worker.id,
      routeKind: "forward_email",
      resultKind: "review_requested",
      title: `Review requested: ${payload.subject}`,
      summary: `Forwarded email from ${payload.from} is ready for review.`,
      assigneeIds: reviewAssignees,
      workItemId: workItem.id,
      reviewId: review.id,
    });

    return buildIngressResult({
      sourceEventId: createdSource.id,
      workerId: worker.id,
      workspaceId,
      ids: {
        work_item_id: workItem.id,
        inbox_item_id: inboxItem.id,
        review_id: review.id,
      },
    });
  }
}
