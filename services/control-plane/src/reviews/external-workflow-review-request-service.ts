import {
  externalWorkflowRequestSchema,
  requestReviewedExternalWorkflowInputSchema,
  type RequestReviewedExternalWorkflowInput,
} from "@clawback/contracts";

import type { ActivityService } from "../activity/index.js";
import type { InboxItemService } from "../inbox/index.js";
import type { ReviewService } from "./service.js";
import type { WorkItemService } from "../work-items/index.js";

type ActionCapabilityLookup = {
  list(workspaceId: string): Promise<{
    action_capabilities: Array<{
      id: string;
      worker_id: string;
      kind: string;
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
};

type ExternalWorkflowReviewRequestServiceOptions = {
  workItemService: WorkItemService;
  reviewService: ReviewService;
  inboxItemService: InboxItemService;
  activityService: ActivityService;
  actionCapabilityService: ActionCapabilityLookup;
  connectionService: ConnectionLookup;
};

export class ExternalWorkflowReviewRequestError extends Error {
  readonly code = "external_workflow_review_invalid";
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
  }
}

export class ExternalWorkflowReviewRequestService {
  constructor(private readonly options: ExternalWorkflowReviewRequestServiceOptions) {}

  async request(
    workspaceId: string,
    workItemId: string,
    input: RequestReviewedExternalWorkflowInput,
  ) {
    const parsed = requestReviewedExternalWorkflowInputSchema.parse(input);
    const workItem = await this.options.workItemService.getById(workspaceId, workItemId);
    if (workItem.kind !== "action_plan") {
      throw new ExternalWorkflowReviewRequestError(
        "External workflow handoffs are currently limited to action_plan work items.",
      );
    }
    if (workItem.review_id) {
      throw new ExternalWorkflowReviewRequestError(
        "This work item already has a linked review.",
      );
    }

    const capability = await this.getExternalWorkflowCapability(workspaceId, workItem.worker_id);
    if (!capability.destination_connection_id) {
      throw new ExternalWorkflowReviewRequestError(
        `Worker ${workItem.worker_id} has no configured external workflow destination.`,
      );
    }

    const connection = await this.options.connectionService.getById(
      workspaceId,
      capability.destination_connection_id,
    );
    if (connection.provider !== "n8n") {
      throw new ExternalWorkflowReviewRequestError(
        `Connection ${connection.id} is not an n8n backend.`,
      );
    }
    if (connection.access_mode !== "write_capable" || connection.status !== "connected") {
      throw new ExternalWorkflowReviewRequestError(
        `n8n backend connection ${connection.id} is not ready for outbound handoff.`,
      );
    }

    const reviewAssignees =
      workItem.reviewer_ids.length > 0 ? workItem.reviewer_ids : workItem.assignee_ids;
    const requestPayload = externalWorkflowRequestSchema.parse({
      backend_kind: "n8n",
      connection_id: connection.id,
      workflow_identifier: parsed.workflow_identifier,
      payload: parsed.payload,
    });

    const review = await this.options.reviewService.create(workspaceId, {
      actionKind: "run_external_workflow",
      workerId: workItem.worker_id,
      workItemId: workItem.id,
      reviewerIds: reviewAssignees,
      assigneeIds: reviewAssignees,
      sourceRouteKind: workItem.source_route_kind,
      actionDestination: parsed.workflow_identifier,
      requestPayload,
    });

    await this.options.workItemService.update(workspaceId, workItem.id, {
      status: "pending_review",
      reviewId: review.id,
      executionStatus: "not_requested",
      executionError: null,
      executionOutcomeJson: null,
    });

    const inboxItem = await this.options.inboxItemService.create(workspaceId, {
      kind: "review",
      title: `Review external workflow: ${workItem.title}`,
      summary: `Run n8n workflow ${parsed.workflow_identifier} for ${workItem.title}.`,
      assigneeIds: reviewAssignees,
      workerId: workItem.worker_id,
      workItemId: workItem.id,
      reviewId: review.id,
      routeKind: workItem.source_route_kind,
    });

    await this.options.activityService.append(workspaceId, {
      workerId: workItem.worker_id,
      routeKind: workItem.source_route_kind,
      resultKind: "external_workflow_review_requested",
      title: "External workflow review requested",
      summary: `Prepared n8n workflow ${parsed.workflow_identifier} for reviewed handoff.`,
      assigneeIds: reviewAssignees,
      workItemId: workItem.id,
      reviewId: review.id,
    });

    return {
      review,
      inboxItemId: inboxItem.id,
    };
  }

  private async getExternalWorkflowCapability(workspaceId: string, workerId: string) {
    const result = await this.options.actionCapabilityService.list(workspaceId);
    const capability = result.action_capabilities.find(
      (item) => item.worker_id === workerId && item.kind === "run_external_workflow",
    );
    if (!capability) {
      throw new ExternalWorkflowReviewRequestError(
        `No run_external_workflow capability is configured for worker ${workerId}.`,
      );
    }

    return capability;
  }
}
