import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  activityListResponseSchema,
  confirmRouteSuggestionResponseSchema,
  requestReviewedExternalWorkflowInputSchema,
  reviewRecordSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

import type { ActivityService } from "./activity/index.js";
import type { InboxItemService } from "./inbox/index.js";
import type { RouteConfirmationService } from "./route-confirmation/index.js";
import type {
  ExternalWorkflowReviewRequestService,
  ReviewResolutionService,
  ReviewService,
} from "./reviews/index.js";
import type { WorkItemService } from "./work-items/index.js";

type WorkspaceReviewRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureReviewActor: (
    session: SessionContext,
    review: { reviewer_ids: string[]; assignee_ids: string[] },
  ) => void;
  ensureInboxActor: (
    session: SessionContext,
    inboxItem: { assignee_ids: string[] },
  ) => void;
  ensureWorkActor: (
    session: SessionContext,
    workItem: { assignee_ids: string[]; reviewer_ids: string[] },
  ) => void;
  activityService: ActivityService;
  inboxItemService: InboxItemService;
  reviewService: ReviewService;
  reviewResolutionService: ReviewResolutionService;
  routeConfirmationService: RouteConfirmationService;
  workItemService: WorkItemService;
  externalWorkflowReviewRequestService: ExternalWorkflowReviewRequestService | null;
};

export function registerWorkspaceReviewRoutes(
  app: FastifyInstance,
  options: WorkspaceReviewRoutesOptions,
) {
  const {
    ensureSession,
    ensureReviewActor,
    ensureInboxActor,
    ensureWorkActor,
    activityService,
    inboxItemService,
    reviewService,
    reviewResolutionService,
    routeConfirmationService,
    workItemService,
    externalWorkflowReviewRequestService,
  } = options;

  app.get("/api/workspace/activity", async (request, reply) => {
    const session = ensureSession(request);
    const result = await activityService.list(session.workspace.id);
    return reply.send(activityListResponseSchema.parse(result));
  });

  app.get("/api/workspace/reviews/:id", async (request, reply) => {
    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const review = await reviewService.getById(session.workspace.id, id);
    return reply.send(reviewRecordSchema.parse(review));
  });

  app.post("/api/workspace/work/:id/request-external-workflow-review", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!externalWorkflowReviewRequestService) {
      return reply.code(501).send({
        error: "External workflow review request path is not configured.",
        code: "feature_not_configured",
      });
    }

    const session = ensureSession(request);
    const workspaceId = session.workspace.id;
    const { id } = request.params as { id: string };
    const workItem = await workItemService.getById(workspaceId, id);
    ensureWorkActor(session, workItem);

    const parsed = requestReviewedExternalWorkflowInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "workflow_identifier and payload are required.",
        code: "invalid_external_workflow_request",
      });
    }

    const result = await externalWorkflowReviewRequestService.request(
      workspaceId,
      id,
      parsed.data,
    );
    return reply.status(201).send({
      review: reviewRecordSchema.parse(result.review),
      inbox_item_id: result.inboxItemId,
    });
  });

  app.post(
    "/api/workspace/reviews/:id/resolve",
    {
      onRequest: [app.csrfProtection],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const session = ensureSession(request);
      const workspaceId = session.workspace.id;
      const { id } = request.params as { id: string };
      const body = request.body as { decision: string; rationale?: string };

      const decision = body.decision;
      if (decision !== "approved" && decision !== "denied") {
        return reply.status(400).send({
          error: "Invalid decision. Must be 'approved' or 'denied'.",
          code: "invalid_decision",
        });
      }

      const currentReview = await reviewService.getById(workspaceId, id);
      ensureReviewActor(session, currentReview);

      const review = await reviewResolutionService.resolve(workspaceId, id, {
        decision,
        rationale: body.rationale ?? null,
        actor: {
          surface: "web",
          userId: session.user.id,
          displayName: session.user.displayName,
        },
      });
      return reply.send(reviewRecordSchema.parse(review));
    },
  );

  app.post(
    "/api/workspace/inbox/:id/confirm-route",
    {
      onRequest: [app.csrfProtection],
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const session = ensureSession(request);
      const workspaceId = session.workspace.id;
      const { id } = request.params as { id: string };

      const inboxItem = await inboxItemService.getById(workspaceId, id);
      ensureInboxActor(session, inboxItem);

      const result = await routeConfirmationService.confirm(workspaceId, id, {
        actor: {
          userId: session.user.id,
          displayName: session.user.displayName,
        },
      });

      return reply.send(confirmRouteSuggestionResponseSchema.parse(result));
    },
  );

  app.post(
    "/api/workspace/work/:id/retry-send",
    {
      onRequest: [app.csrfProtection],
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
    },
    async (request, reply) => {
      const session = ensureSession(request);
      const workspaceId = session.workspace.id;
      const { id } = request.params as { id: string };

      const workItem = await workItemService.getById(workspaceId, id);
      if (!workItem.review_id) {
        return reply.status(409).send({
          error: "This work item is not attached to a review.",
          code: "review_required",
        });
      }

      const currentReview = await reviewService.getById(workspaceId, workItem.review_id);
      ensureReviewActor(session, currentReview);

      const review = await reviewResolutionService.retryApprovedSend(workspaceId, currentReview.id);
      return reply.send(reviewRecordSchema.parse(review));
    },
  );
}
