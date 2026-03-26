import type {
  ExecutionContinuityStateRecord,
  WorkerDecision,
  WorkerTriageRecord,
  SenderResolution,
} from "@clawback/contracts";
import {
  projectCanonicalSourceTriageRecord,
  toCanonicalSourceTriageRecord,
} from "@clawback/domain";

import { buildReplyDraft } from "../email-draft.js";
import {
  getRuntimeWorkerPackByKind,
  type WorkerPackRuntimeArtifact,
  type WorkerPackRouteTargetWorker,
} from "../../worker-packs/index.js";
import {
  buildDeduplicatedIngressResult,
  buildIngressResult,
} from "../shared-results.js";
import { buildStoredSourceEvent } from "../shared-source-events.js";
import type { SenderResolutionService } from "../../sender-resolution/index.js";
import type {
  WatchedInboxPayload,
  WatchedInboxResult,
  SourceEventStore,
  StoredSourceEvent,
  WorkerLookup,
  RouteTargetLookup,
  WatchedInboxRouteLookup,
  ConnectionLookup,
} from "./types.js";

// ---------------------------------------------------------------------------
// Dependency contracts (work item + inbox item + activity creation)
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
      sourceRouteKind?: "watched_inbox" | null;
      sourceEventId?: string | null;
      triageJson?: WorkerTriageRecord | null;
      executionStateJson?: ExecutionContinuityStateRecord | null;
    },
  ): Promise<{ id: string }>;
};

type InboxItemCreator = {
  create(
    workspaceId: string,
    input: {
      kind: "shadow" | "review" | "boundary";
      title: string;
      summary?: string | null;
      assigneeIds?: string[];
      workerId?: string | null;
      workItemId?: string | null;
      routeKind?: "watched_inbox" | null;
      triageJson?: WorkerTriageRecord | null;
      executionStateJson?: ExecutionContinuityStateRecord | null;
    },
  ): Promise<{ id: string }>;
};

type ActivityAppender = {
  append(
    workspaceId: string,
    input: {
      workerId?: string | null;
      routeKind?: "watched_inbox" | null;
      resultKind: string;
      title: string;
      summary?: string | null;
      assigneeIds?: string[];
      workItemId?: string | null;
    },
  ): Promise<{ id: string }>;
};

// ---------------------------------------------------------------------------
// Service options
// ---------------------------------------------------------------------------

type WatchedInboxServiceOptions = {
  sourceEventStore: SourceEventStore;
  watchedInboxRouteLookup: WatchedInboxRouteLookup;
  connectionLookup: ConnectionLookup;
  workerLookup: WorkerLookup;
  workItemService: WorkItemCreator;
  inboxItemService: InboxItemCreator;
  activityService: ActivityAppender;
  senderResolutionService?: SenderResolutionService;
  routeTargetLookup?: RouteTargetLookup;
  now?: () => Date;
};

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class WatchedInboxRouteNotFoundError extends Error {
  readonly code = "watched_inbox_route_not_found";
  readonly statusCode = 404;
  constructor(workerId: string) {
    super(`No active watched_inbox input route found for worker: ${workerId}`);
  }
}

export class WatchedInboxWorkerNotFoundError extends Error {
  readonly code = "watched_inbox_worker_not_found";
  readonly statusCode = 404;
  constructor(workerId: string) {
    super(`Worker not found: ${workerId}`);
  }
}

export class GmailConnectionNotReadyError extends Error {
  readonly code = "gmail_connection_not_ready";
  readonly statusCode = 409;
  constructor(workspaceId: string) {
    super(`No connected Gmail read-only connection for workspace: ${workspaceId}`);
  }
}

export class WatchedInboxWorkerRuntimeNotAvailableError extends Error {
  readonly code = "watched_inbox_worker_runtime_unavailable";
  readonly statusCode = 409;
  constructor(workerId: string) {
    super(`Worker ${workerId} does not have a runtime-capable worker pack for watched inbox execution.`);
  }
}

// ---------------------------------------------------------------------------
// Service implementation
// ---------------------------------------------------------------------------

export class WatchedInboxService {
  private readonly now: () => Date;

  constructor(private readonly options: WatchedInboxServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async processWatchedInboxEvent(payload: WatchedInboxPayload): Promise<WatchedInboxResult> {
    const { workspace_id: workspaceId, worker_id: workerId } = payload;

    // 1. Verify the worker exists
    const worker = await this.options.workerLookup.findById(workspaceId, workerId);
    if (!worker) {
      throw new WatchedInboxWorkerNotFoundError(workerId);
    }
    const runtimePack = getRuntimeWorkerPackByKind(worker.kind);
    if (!runtimePack || !runtimePack.runtime.hooks.runWatchedInboxExecution) {
      throw new WatchedInboxWorkerRuntimeNotAvailableError(workerId);
    }

    // 2. Verify a watched_inbox input route exists and is active for this worker
    const route = await this.options.watchedInboxRouteLookup.findWatchedInboxRoute(
      workspaceId,
      workerId,
    );
    if (!route || route.status !== "active") {
      throw new WatchedInboxRouteNotFoundError(workerId);
    }

    // 3. Verify a connected Gmail read-only connection exists
    const connection = await this.options.connectionLookup.findGmailReadOnly(workspaceId);
    if (!connection || connection.status !== "connected") {
      throw new GmailConnectionNotReadyError(workspaceId);
    }

    // 4. Idempotency check using external message id
    const existing = await this.options.sourceEventStore.findByExternalMessageId(
      workspaceId,
      payload.external_message_id,
    );
    if (existing) {
      return buildDeduplicatedIngressResult({
        sourceEventId: existing.id,
        workerId,
        workspaceId,
        ids: {
          work_item_id: "",
          inbox_item_id: "",
          activity_event_id: "",
        },
      });
    }

    // 5. Resolve sender context through shared contact/account memory (R2)
    let senderResolution: SenderResolution | null = null;
    if (this.options.senderResolutionService) {
      senderResolution = await this.options.senderResolutionService.resolve(
        workspaceId,
        payload.from,
      );
    }

    // 6. Pack-owned watched-inbox execution behind the runtime boundary.
    const execution = await runtimePack.runtime.hooks.runWatchedInboxExecution({
      workspaceId,
      from: payload.from,
      subject: payload.subject,
      bodyText: payload.body_text,
      bodyHtml: payload.body_html ?? null,
      threadSummary: payload.thread_summary,
      senderResolution,
      routeTargetLookup: this.options.routeTargetLookup,
    });

    // 7. Create source event with triage result (canonical truth)
    const now = this.now();
    const canonicalTriage = toCanonicalSourceTriageRecord(execution.triage);
    const sourceEvent: StoredSourceEvent = buildStoredSourceEvent({
      workspaceId,
      workerId,
      inputRouteId: route.id,
      kind: "watched_inbox",
      externalMessageId: payload.external_message_id,
      fromAddress: payload.from,
      toAddress: null,
      subject: payload.subject,
      bodyText: payload.body_text,
      bodyHtml: payload.body_html ?? null,
      attachmentsJson: [],
      rawPayloadJson: payload as unknown as Record<string, unknown>,
      triageJson: canonicalTriage,
      createdAt: now,
    });
    const createdSource = await this.options.sourceEventStore.create(sourceEvent);

    // 8. Realize the product artifact chosen by the Follow-Up execution.
    return await this.mapExecutionToOutputs(
      workspaceId,
      workerId,
      worker,
      payload,
      createdSource,
      canonicalTriage,
      execution.artifact,
      execution.executionState,
    );
  }

  private async mapExecutionToOutputs(
    workspaceId: string,
    workerId: string,
    worker: { name: string; assigneeIds: string[]; reviewerIds: string[] },
    payload: WatchedInboxPayload,
    sourceEvent: StoredSourceEvent,
    triage: WorkerTriageRecord,
    artifact: WorkerPackRuntimeArtifact,
    executionState: ExecutionContinuityStateRecord | null,
  ): Promise<WatchedInboxResult> {
    const projectedTriage = projectCanonicalSourceTriageRecord(triage);

    switch (artifact.kind) {
      case "ignore_activity":
        return this.handleIgnore(workspaceId, workerId, worker, payload, sourceEvent, projectedTriage!);

      case "shadow_draft":
        return this.handleShadowDraft(
          workspaceId,
          workerId,
          worker,
          payload,
          sourceEvent,
          projectedTriage!,
          executionState,
        );

      case "request_review":
        return this.handleRequestReview(
          workspaceId,
          workerId,
          worker,
          payload,
          sourceEvent,
          projectedTriage!,
          executionState,
        );

      case "escalation":
        return this.handleEscalate(
          workspaceId,
          workerId,
          worker,
          payload,
          sourceEvent,
          projectedTriage!,
          executionState,
        );

      case "route_suggestion":
        return this.handleRouteSuggestion(
          workspaceId,
          workerId,
          worker,
          payload,
          sourceEvent,
          projectedTriage!,
          artifact.targetWorker,
          executionState,
        );

      default:
        return this.handleShadowDraft(
          workspaceId,
          workerId,
          worker,
          payload,
          sourceEvent,
          projectedTriage!,
          executionState,
        );
    }
  }

  // -------------------------------------------------------------------------
  // ignore: no inbox/work item, activity event only
  // -------------------------------------------------------------------------

  private async handleIgnore(
    workspaceId: string,
    workerId: string,
    worker: { assigneeIds: string[] },
    payload: WatchedInboxPayload,
    sourceEvent: StoredSourceEvent,
    triageJson: WorkerTriageRecord,
  ): Promise<WatchedInboxResult> {
    const activityEvent = await this.options.activityService.append(workspaceId, {
      workerId,
      routeKind: "watched_inbox",
      resultKind: "triage_ignored",
      title: `Ignored: ${payload.subject}`,
      summary: `Triage classified "${payload.subject}" from ${payload.from} as ${triageJson.intent} and decided to ignore. Reasons: ${triageJson.reasons.join(", ")}.`,
      assigneeIds: worker.assigneeIds,
      workItemId: null,
    });

    return buildIngressResult({
      sourceEventId: sourceEvent.id,
      workerId,
      workspaceId,
      ids: {
        work_item_id: "",
        inbox_item_id: "",
        activity_event_id: activityEvent.id,
      },
    });
  }

  // -------------------------------------------------------------------------
  // shadow_draft: create email draft + shadow inbox item (existing behavior)
  // -------------------------------------------------------------------------

  private async handleShadowDraft(
    workspaceId: string,
    workerId: string,
    worker: { assigneeIds: string[]; reviewerIds: string[] },
    payload: WatchedInboxPayload,
    sourceEvent: StoredSourceEvent,
    triageJson: WorkerTriageRecord,
    executionState: ExecutionContinuityStateRecord | null,
  ): Promise<WatchedInboxResult> {
    const draft = buildReplyDraft({
      from: payload.from,
      subject: payload.subject,
      bodyText: payload.body_text,
      ...(payload.thread_summary !== undefined ? { threadSummary: payload.thread_summary } : {}),
      proactive: true,
    });

    const workItem = await this.options.workItemService.create(workspaceId, {
      workerId,
      kind: "email_draft",
      title: `Shadow draft: ${payload.subject}`,
      summary: `Triage: ${triageJson.intent} (${triageJson.confidence}). ${triageJson.reasons.join(", ")}.`,
      draftTo: draft.to,
      draftSubject: draft.subject,
      draftBody: draft.body,
      executionStatus: "not_requested",
      executionError: null,
      assigneeIds: worker.assigneeIds,
      reviewerIds: worker.reviewerIds,
      sourceRouteKind: "watched_inbox",
      sourceEventId: sourceEvent.id,
      triageJson,
      executionStateJson: executionState,
    });

    const inboxItem = await this.options.inboxItemService.create(workspaceId, {
      kind: "shadow",
      title: `Shadow suggestion: ${payload.subject}`,
      summary: `Your Follow-Up worker drafted a reply for "${payload.subject}" from ${payload.from}.`,
      assigneeIds: worker.reviewerIds.length > 0 ? worker.reviewerIds : worker.assigneeIds,
      workerId,
      workItemId: workItem.id,
      routeKind: "watched_inbox",
      triageJson,
      executionStateJson: executionState,
    });

    const activityEvent = await this.options.activityService.append(workspaceId, {
      workerId,
      routeKind: "watched_inbox",
      resultKind: "shadow_draft_created",
      title: `Shadow draft created: ${payload.subject}`,
      summary: `Triage: ${triageJson.intent} → shadow_draft. ${triageJson.reasons.join(", ")}.`,
      assigneeIds: worker.assigneeIds,
      workItemId: workItem.id,
    });

    return buildIngressResult({
      sourceEventId: sourceEvent.id,
      workerId,
      workspaceId,
      ids: {
        work_item_id: workItem.id,
        inbox_item_id: inboxItem.id,
        activity_event_id: activityEvent.id,
      },
    });
  }

  // -------------------------------------------------------------------------
  // request_review: inbox item for human review, no draft by default
  // -------------------------------------------------------------------------

  private async handleRequestReview(
    workspaceId: string,
    workerId: string,
    worker: { name: string; assigneeIds: string[]; reviewerIds: string[] },
    payload: WatchedInboxPayload,
    sourceEvent: StoredSourceEvent,
    triageJson: WorkerTriageRecord,
    executionState: ExecutionContinuityStateRecord | null,
  ): Promise<WatchedInboxResult> {
    const routeReview = describeRouteReview(triageJson);
    const reviewTitle = routeReview
      ? `Route review needed: ${payload.subject}`
      : `Review needed: ${payload.subject}`;
    const reviewSummary = routeReview
      ? `${worker.name} suggests ${routeReview}, but the target could not be safely resolved for "${payload.subject}" from ${payload.from}. Reasons: ${triageJson.reasons.join(", ")}.`
      : `Triage classified "${payload.subject}" from ${payload.from} as ${triageJson.intent} (${triageJson.confidence}). Reasons: ${triageJson.reasons.join(", ")}.`;

    const inboxItem = await this.options.inboxItemService.create(workspaceId, {
      kind: "review",
      title: reviewTitle,
      summary: reviewSummary,
      assigneeIds: worker.reviewerIds.length > 0 ? worker.reviewerIds : worker.assigneeIds,
      workerId,
      workItemId: null,
      routeKind: "watched_inbox",
      triageJson,
      executionStateJson: executionState,
    });

    const activityEvent = await this.options.activityService.append(workspaceId, {
      workerId,
      routeKind: "watched_inbox",
      resultKind: "triage_review_requested",
      title: routeReview ? `Route review requested: ${payload.subject}` : `Review requested: ${payload.subject}`,
      summary: routeReview
        ? `${worker.name} suggests ${routeReview}, but the route stayed in review. ${triageJson.reasons.join(", ")}.`
        : `Triage: ${triageJson.intent} → request_review. ${triageJson.reasons.join(", ")}.`,
      assigneeIds: worker.reviewerIds.length > 0 ? worker.reviewerIds : worker.assigneeIds,
      workItemId: null,
    });

    return buildIngressResult({
      sourceEventId: sourceEvent.id,
      workerId,
      workspaceId,
      ids: {
        work_item_id: "",
        inbox_item_id: inboxItem.id,
        activity_event_id: activityEvent.id,
      },
    });
  }

  // -------------------------------------------------------------------------
  // route_to_worker: suggestion-first review item, no destination work yet
  // -------------------------------------------------------------------------

  private async handleRouteSuggestion(
    workspaceId: string,
    workerId: string,
    worker: { name: string; assigneeIds: string[]; reviewerIds: string[] },
    payload: WatchedInboxPayload,
    sourceEvent: StoredSourceEvent,
    triageJson: WorkerTriageRecord,
    routeTargetWorker: WorkerPackRouteTargetWorker,
    executionState: ExecutionContinuityStateRecord | null,
  ): Promise<WatchedInboxResult> {
    const assigneeIds = worker.reviewerIds.length > 0 ? worker.reviewerIds : worker.assigneeIds;
    const routeSummary = `${worker.name} suggests routing "${payload.subject}" from ${payload.from} to ${routeTargetWorker.name}. Reasons: ${triageJson.reasons.join(", ")}.`;

    const inboxItem = await this.options.inboxItemService.create(workspaceId, {
      kind: "review",
      title: `Route suggested: ${payload.subject}`,
      summary: routeSummary,
      assigneeIds,
      workerId,
      workItemId: null,
      routeKind: "watched_inbox",
      triageJson,
      executionStateJson: executionState,
    });

    const activityEvent = await this.options.activityService.append(workspaceId, {
      workerId,
      routeKind: "watched_inbox",
      resultKind: "triage_route_suggested",
      title: `Route suggested: ${payload.subject}`,
      summary: `${worker.name} suggested ${routeTargetWorker.name} for ${triageJson.intent}. ${triageJson.reasons.join(", ")}.`,
      assigneeIds,
      workItemId: null,
    });

    return buildIngressResult({
      sourceEventId: sourceEvent.id,
      workerId,
      workspaceId,
      ids: {
        work_item_id: "",
        inbox_item_id: inboxItem.id,
        activity_event_id: activityEvent.id,
      },
    });
  }

  // -------------------------------------------------------------------------
  // escalate: boundary inbox item for urgent human attention
  // -------------------------------------------------------------------------

  private async handleEscalate(
    workspaceId: string,
    workerId: string,
    worker: { assigneeIds: string[]; reviewerIds: string[] },
    payload: WatchedInboxPayload,
    sourceEvent: StoredSourceEvent,
    triageJson: WorkerTriageRecord,
    executionState: ExecutionContinuityStateRecord | null,
  ): Promise<WatchedInboxResult> {
    const inboxItem = await this.options.inboxItemService.create(workspaceId, {
      kind: "boundary",
      title: `Escalation: ${payload.subject}`,
      summary: `Triage escalated "${payload.subject}" from ${payload.from}. Intent: ${triageJson.intent}. Reasons: ${triageJson.reasons.join(", ")}.`,
      assigneeIds: worker.reviewerIds.length > 0 ? worker.reviewerIds : worker.assigneeIds,
      workerId,
      workItemId: null,
      routeKind: "watched_inbox",
      triageJson,
      executionStateJson: executionState,
    });

    const activityEvent = await this.options.activityService.append(workspaceId, {
      workerId,
      routeKind: "watched_inbox",
      resultKind: "triage_escalated",
      title: `Escalated: ${payload.subject}`,
      summary: `Triage: ${triageJson.intent} → escalate. ${triageJson.reasons.join(", ")}.`,
      assigneeIds: worker.reviewerIds.length > 0 ? worker.reviewerIds : worker.assigneeIds,
      workItemId: null,
    });

    return buildIngressResult({
      sourceEventId: sourceEvent.id,
      workerId,
      workspaceId,
      ids: {
        work_item_id: "",
        inbox_item_id: inboxItem.id,
        activity_event_id: activityEvent.id,
      },
    });
  }
}

function describeRouteReview(triage: WorkerTriageRecord): string | null {
  const recommendedKind = extractRecommendedRouteKind(triage.reasons);
  if (!recommendedKind) {
    return null;
  }

  if (triage.reasons.includes("route_missing")) {
    return `routing to the ${humanizeWorkerKind(recommendedKind)} worker, but no active target was available`;
  }

  if (triage.reasons.includes("route_ambiguous")) {
    return `routing to the ${humanizeWorkerKind(recommendedKind)} worker, but multiple active targets matched`;
  }

  return null;
}

function extractRecommendedRouteKind(
  reasons: string[],
): "proposal" | "incident" | "bugfix" | null {
  if (reasons.includes("proposal_worker_recommended")) return "proposal";
  if (reasons.includes("incident_worker_recommended")) return "incident";
  if (reasons.includes("bugfix_worker_recommended")) return "bugfix";
  return null;
}

function humanizeWorkerKind(kind: "proposal" | "incident" | "bugfix"): string {
  switch (kind) {
    case "proposal":
      return "Proposal";
    case "incident":
      return "Incident";
    case "bugfix":
      return "Bugfix";
  }
}
