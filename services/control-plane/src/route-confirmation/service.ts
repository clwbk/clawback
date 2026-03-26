import type {
  ConfirmRouteSuggestionResponse,
  ExecutionContinuityStateRecord,
  InboxItemRecord,
  WorkItemKind,
  WorkerTriageRecord,
} from "@clawback/contracts";
import { activityResultKinds } from "../activity/index.js";
import { getRuntimeWorkerPackByKind } from "../worker-packs/index.js";

import type { ActivityService } from "../activity/index.js";
import type { InboxItemService } from "../inbox/index.js";
import type { WorkItemService } from "../work-items/index.js";
import { WorkItemNotFoundError } from "../work-items/index.js";
import type { WorkerService } from "../workers/index.js";
import { WorkerNotFoundError } from "../workers/index.js";

type RouteConfirmationServiceOptions = {
  inboxItemService: InboxItemService;
  workItemService: WorkItemService;
  activityService: ActivityService;
  workerService: WorkerService;
};

type ConfirmRouteInput = {
  actor?: {
    userId?: string | null;
    displayName?: string | null;
  };
};

export class RouteConfirmationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message);
  }
}

export class RouteConfirmationService {
  constructor(private readonly options: RouteConfirmationServiceOptions) {}

  async confirm(
    workspaceId: string,
    inboxItemId: string,
    input: ConfirmRouteInput = {},
  ): Promise<ConfirmRouteSuggestionResponse> {
    const originInboxItem = await this.options.inboxItemService.getById(workspaceId, inboxItemId);
    const existingDestination = await this.lookupExistingDestination(workspaceId, originInboxItem);

    if (existingDestination) {
      const originWorkerName = await this.getWorkerName(workspaceId, originInboxItem.worker_id);
      const destinationInboxItem = await this.ensureDestinationInboxItem(
        workspaceId,
        existingDestination.destinationWorkItem.id,
        originInboxItem,
        existingDestination.targetWorker,
        extractRouteSubject(originInboxItem),
        originWorkerName,
      );
      const activityEventId = await this.ensureActivityEvent(
        workspaceId,
        originInboxItem,
        existingDestination.destinationWorkItem.id,
        existingDestination.targetWorker.name,
        input.actor ?? null,
      );

      if (
        originInboxItem.state !== "resolved"
        || originInboxItem.work_item_id !== existingDestination.destinationWorkItem.id
        || !await this.hasCompletedRouteResumeState(
          workspaceId,
          originInboxItem.worker_id,
          originInboxItem.execution_state_json,
          existingDestination.destinationWorkItem.id,
        )
      ) {
        await this.resolveOriginInboxItem(
          workspaceId,
          originInboxItem,
          existingDestination.destinationWorkItem.id,
          existingDestination.targetWorker.name,
          existingDestination.targetWorker.id,
        );
      }

      return {
        already_confirmed: true,
        origin_inbox_item: await this.options.inboxItemService.getById(workspaceId, inboxItemId),
        destination_work_item: existingDestination.destinationWorkItem,
        destination_inbox_item: destinationInboxItem,
        activity_event_id: activityEventId,
      };
    }

    this.assertConfirmable(originInboxItem);

    const triage = originInboxItem.triage_json as WorkerTriageRecord;
    const targetWorkerId = triage.route_target_worker_id!;
    const targetWorker = await this.getActiveTargetWorker(workspaceId, targetWorkerId);
    const originWorkerName = await this.getWorkerName(workspaceId, originInboxItem.worker_id);
    const subject = extractRouteSubject(originInboxItem);

    const destinationWorkItem = await this.createDestinationWorkItem(
      workspaceId,
      originInboxItem,
      targetWorker,
      subject,
      triage,
      originWorkerName,
    );
    const destinationInboxItem = await this.ensureDestinationInboxItem(
      workspaceId,
      destinationWorkItem.id,
      originInboxItem,
      targetWorker,
      subject,
      originWorkerName,
    );
    await this.resolveOriginInboxItem(
      workspaceId,
      originInboxItem,
      destinationWorkItem.id,
      targetWorker.name,
      targetWorker.id,
    );
    const activityEventId = await this.ensureActivityEvent(
      workspaceId,
      originInboxItem,
      destinationWorkItem.id,
      targetWorker.name,
      input.actor ?? null,
    );

    return {
      already_confirmed: false,
      origin_inbox_item: await this.options.inboxItemService.getById(workspaceId, inboxItemId),
      destination_work_item: destinationWorkItem,
      destination_inbox_item: destinationInboxItem,
      activity_event_id: activityEventId,
    };
  }

  private async lookupExistingDestination(
    workspaceId: string,
    originInboxItem: InboxItemRecord,
  ): Promise<{
    destinationWorkItem: Awaited<ReturnType<WorkItemService["getById"]>>;
    targetWorker: Awaited<ReturnType<WorkerService["getById"]>>;
  } | null> {
    const existingFromOrigin = originInboxItem.work_item_id
      ? await this.safeGetWorkItem(workspaceId, originInboxItem.work_item_id)
      : null;
    const destinationWorkItem = existingFromOrigin
      ?? await this.options.workItemService.findBySourceInboxItemId(workspaceId, originInboxItem.id);

    if (!destinationWorkItem) {
      return null;
    }

    const targetWorker = await this.getTargetWorkerRecord(workspaceId, destinationWorkItem.worker_id);
    return {
      destinationWorkItem,
      targetWorker,
    };
  }

  private assertConfirmable(originInboxItem: InboxItemRecord) {
    if (originInboxItem.kind !== "review") {
      throw new RouteConfirmationError(
        "Only review-style route suggestions can be confirmed.",
        "route_confirmation_invalid_origin",
        409,
      );
    }

    if (!originInboxItem.triage_json || originInboxItem.triage_json.decision !== "route_to_worker") {
      throw new RouteConfirmationError(
        "This inbox item is not a confirmable route suggestion.",
        "route_confirmation_not_available",
        409,
      );
    }

    if (!originInboxItem.triage_json.route_target_worker_id) {
      throw new RouteConfirmationError(
        "This route suggestion does not have a safe concrete target.",
        "route_confirmation_unsafe_target",
        409,
      );
    }

    if (originInboxItem.state !== "open") {
      throw new RouteConfirmationError(
        `Inbox item ${originInboxItem.id} is already ${originInboxItem.state}.`,
        "route_confirmation_invalid_state",
        409,
      );
    }
  }

  private async getActiveTargetWorker(workspaceId: string, workerId: string) {
    const worker = await this.getTargetWorkerRecord(workspaceId, workerId);
    if (worker.status !== "active") {
      throw new RouteConfirmationError(
        "The suggested target worker is not active.",
        "route_confirmation_target_unavailable",
        409,
      );
    }
    return worker;
  }

  private async getTargetWorkerRecord(workspaceId: string, workerId: string) {
    let worker;
    try {
      worker = await this.options.workerService.getById(workspaceId, workerId);
    } catch (error) {
      if (error instanceof WorkerNotFoundError) {
        throw new RouteConfirmationError(
          "The suggested target worker is no longer available.",
          "route_confirmation_target_unavailable",
          409,
        );
      }
      throw error;
    }
    return worker;
  }

  private async getWorkerName(workspaceId: string, workerId: string | null): Promise<string> {
    if (!workerId) {
      return "Unknown worker";
    }

    try {
      const worker = await this.options.workerService.getById(workspaceId, workerId);
      return worker.name;
    } catch (error) {
      if (error instanceof WorkerNotFoundError) {
        return workerId;
      }
      throw error;
    }
  }

  private async createDestinationWorkItem(
    workspaceId: string,
    originInboxItem: InboxItemRecord,
    targetWorker: Awaited<ReturnType<WorkerService["getById"]>>,
    subject: string,
    triage: WorkerTriageRecord,
    originWorkerName: string,
  ) {
    const createInput = {
      workerId: targetWorker.id,
      kind: destinationWorkKindFor(targetWorker.kind),
      title: `Routed to ${targetWorker.name}: ${subject}`,
      summary: `${originWorkerName} suggested routing this ${triage.intent.replace(/_/g, " ")} message to ${targetWorker.name}. Reasons: ${triage.reasons.join(", ")}.`,
      assigneeIds: targetWorker.assignee_ids,
      reviewerIds: targetWorker.reviewer_ids,
      sourceRouteKind: originInboxItem.route_kind,
      sourceInboxItemId: originInboxItem.id,
      triageJson: triage,
    } as const;

    try {
      return await this.options.workItemService.create(workspaceId, createInput);
    } catch (error) {
      if (isSourceInboxUniqueViolation(error)) {
        const existing = await this.options.workItemService.findBySourceInboxItemId(
          workspaceId,
          originInboxItem.id,
        );
        if (existing) {
          return existing;
        }
      }
      throw error;
    }
  }

  private async ensureDestinationInboxItem(
    workspaceId: string,
    destinationWorkItemId: string,
    originInboxItem: InboxItemRecord,
    targetWorker: Awaited<ReturnType<WorkerService["getById"]>>,
    subject: string,
    originWorkerName: string,
  ) {
    const existing = await this.options.inboxItemService.findByWorkItemId(
      workspaceId,
      destinationWorkItemId,
    );
    if (existing) {
      return existing;
    }

    const assigneeIds =
      targetWorker.reviewer_ids.length > 0 ? targetWorker.reviewer_ids : targetWorker.assignee_ids;

    return await this.options.inboxItemService.create(workspaceId, {
      kind: "review",
      title: `Routed work: ${subject}`,
      summary: `${originWorkerName} handed this message to ${targetWorker.name} after operator confirmation.`,
      assigneeIds,
      workerId: targetWorker.id,
      workItemId: destinationWorkItemId,
      routeKind: originInboxItem.route_kind,
      triageJson: originInboxItem.triage_json,
    });
  }

  private async resolveOriginInboxItem(
    workspaceId: string,
    originInboxItem: InboxItemRecord,
    destinationWorkItemId: string,
    targetWorkerName: string,
    targetWorkerId: string,
  ) {
    const executionState = await this.buildCompletedRouteResumeState(
      workspaceId,
      originInboxItem.worker_id,
      originInboxItem.execution_state_json,
      originInboxItem.triage_json,
      destinationWorkItemId,
      targetWorkerId,
    );

    await this.options.inboxItemService.update(workspaceId, originInboxItem.id, {
      state: "resolved",
      title: `Route handled: ${extractRouteSubject(originInboxItem)}`,
      summary: `Confirmed handoff to ${targetWorkerName}. Downstream work was created and linked here for audit.`,
      workItemId: destinationWorkItemId,
      executionStateJson: executionState,
    });
  }

  private async ensureActivityEvent(
    workspaceId: string,
    originInboxItem: InboxItemRecord,
    destinationWorkItemId: string,
    targetWorkerName: string,
    actor: ConfirmRouteInput["actor"] | null,
  ): Promise<string> {
    const originWorkerName = await this.getWorkerName(workspaceId, originInboxItem.worker_id);
    const actorLabel = actor?.displayName?.trim() || actor?.userId || "an operator";
    const assigneeIds = originInboxItem.assignee_ids;
    const event = await this.options.activityService.appendWorkItemResultOnce(workspaceId, {
      workerId: originInboxItem.worker_id,
      routeKind: originInboxItem.route_kind,
      resultKind: activityResultKinds.routeHandoffConfirmed,
      title: `Route confirmed: ${extractRouteSubject(originInboxItem)}`,
      summary: `${actorLabel} confirmed the handoff from ${originWorkerName} to ${targetWorkerName}.`,
      assigneeIds,
      workItemId: destinationWorkItemId,
    });
    return event.id;
  }

  private async safeGetWorkItem(workspaceId: string, workItemId: string) {
    try {
      return await this.options.workItemService.getById(workspaceId, workItemId);
    } catch (error) {
      if (error instanceof WorkItemNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  private async hasCompletedRouteResumeState(
    workspaceId: string,
    originWorkerId: string | null,
    executionStateJson: unknown,
    destinationWorkItemId: string,
  ): Promise<boolean> {
    const runtimePack = await this.getRuntimeWorkerPack(workspaceId, originWorkerId);
    const state = runtimePack.runtime.hooks.parseExecutionState(executionStateJson);
    return Boolean(
      state
      && state.resume_reason === "route_confirmed"
      && state.downstream_work_item_id === destinationWorkItemId,
    );
  }

  private async buildCompletedRouteResumeState(
    workspaceId: string,
    originWorkerId: string | null,
    executionStateJson: unknown,
    triage: WorkerTriageRecord | null,
    destinationWorkItemId: string,
    targetWorkerId: string,
  ): Promise<ExecutionContinuityStateRecord> {
    const runtimePack = await this.getRuntimeWorkerPack(workspaceId, originWorkerId);
    const existingState = runtimePack.runtime.hooks.parseExecutionState(executionStateJson)
      ?? runtimePack.runtime.hooks.buildPausedExecutionState({
        lastDecision: triage?.decision ?? "route_to_worker",
        pauseReason: "route_confirmation",
        targetWorkerId: triage?.route_target_worker_id ?? targetWorkerId,
      });

    const resumedState = runtimePack.runtime.hooks.resumeAfterRouteConfirmation(existingState, {
      targetWorkerId,
      downstreamWorkItemId: destinationWorkItemId,
    });
    return runtimePack.runtime.hooks.markCompleted(resumedState, "route_confirmed");
  }

  private async getRuntimeWorkerPack(
    workspaceId: string,
    originWorkerId: string | null,
  ): Promise<NonNullable<ReturnType<typeof getRuntimeWorkerPackByKind>>> {
    if (!originWorkerId) {
      throw new RouteConfirmationError(
        "The origin inbox item does not identify the worker runtime that created it.",
        "route_confirmation_runtime_unavailable",
        409,
      );
    }

    const worker = await this.options.workerService.getById(workspaceId, originWorkerId);
    const runtimePack = getRuntimeWorkerPackByKind(worker.kind);
    if (!runtimePack?.runtime.resumesAfterRouteConfirmation) {
      throw new RouteConfirmationError(
        `Worker ${originWorkerId} does not support route-confirmation continuation.`,
        "route_confirmation_runtime_unavailable",
        409,
      );
    }
    return runtimePack;
  }
}

function destinationWorkKindFor(kind: string): WorkItemKind {
  switch (kind) {
    case "proposal":
      return "proposal_draft";
    case "incident":
    case "bugfix":
      return "ticket_draft";
    default:
      throw new RouteConfirmationError(
        `The target worker kind "${kind}" is not supported for route confirmation yet.`,
        "route_confirmation_target_unsupported",
        409,
      );
  }
}

function extractRouteSubject(originInboxItem: InboxItemRecord) {
  return originInboxItem.title
    .replace(/^Route suggested:\s*/i, "")
    .replace(/^Route handled:\s*/i, "")
    .trim() || originInboxItem.title;
}

function isSourceInboxUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const err = error as { code?: string; constraint?: string; message?: string };
  return err.code === "23505"
    && (
      err.constraint === "work_items_source_inbox_item_id_key"
      || err.message?.includes("work_items_source_inbox_item_id_key")
    );
}
