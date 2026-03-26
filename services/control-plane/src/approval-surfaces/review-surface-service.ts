import type { ReviewRecordView } from "../reviews/types.js";
import type { ReviewResolutionService } from "../reviews/resolution-service.js";
import type { ReviewService } from "../reviews/service.js";
import type { ReviewDecisionService } from "../reviews/decision-service.js";
import type { ReviewDecisionRecordView } from "../reviews/decision-types.js";
import type { WorkspacePeopleService } from "../workspace-people/service.js";
import type { ApprovalSurfaceIdentityService } from "./service.js";
import { ApprovalSurfaceTokenError, ApprovalSurfaceTokenSigner } from "./tokens.js";
import { normalizeExternalIdentity } from "./service.js";

type ResolveWhatsAppReviewInput = {
  approvalToken: string;
  actorIdentity: string;
  rationale?: string | null;
  interactionId?: string | null;
};

type ResolveSlackReviewInput = {
  approvalToken: string;
  actorIdentity: string;
  rationale?: string | null;
  interactionId?: string | null;
};

type BuildWhatsAppApprovalActionsInput = {
  reviewId: string;
  expiresInMinutes?: number;
};

type BuildSlackApprovalActionsInput = {
  reviewId: string;
  expiresInMinutes?: number;
};

export type WhatsAppApprovalActionRecipient = {
  userId: string;
  displayName: string;
  actorIdentity: string;
  approveToken: string;
  denyToken: string;
};

export type SlackApprovalActionRecipient = {
  userId: string;
  displayName: string;
  actorIdentity: string;
  approveToken: string;
  denyToken: string;
};

type ReviewApprovalSurfaceServiceOptions = {
  reviewService: ReviewService;
  reviewResolutionService: ReviewResolutionService;
  reviewDecisionService?: ReviewDecisionService;
  approvalSurfaceIdentityService: ApprovalSurfaceIdentityService;
  workspacePeopleService: WorkspacePeopleService;
  tokenSigner: ApprovalSurfaceTokenSigner;
  now?: () => Date;
};

export class ReviewApprovalSurfaceError extends Error {
  readonly code = "review_approval_surface_invalid";
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
  }
}

export class ReviewApprovalSurfaceForbiddenError extends Error {
  readonly code = "review_approval_surface_forbidden";
  readonly statusCode = 403;

  constructor(message: string) {
    super(message);
  }
}

export class ReviewApprovalSurfaceService {
  private readonly now: () => Date;

  constructor(private readonly options: ReviewApprovalSurfaceServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  async buildWhatsAppApprovalActions(
    workspaceId: string,
    input: BuildWhatsAppApprovalActionsInput,
  ): Promise<{
    review: ReviewRecordView;
    recipients: WhatsAppApprovalActionRecipient[];
  }> {
    const review = await this.options.reviewService.getById(workspaceId, input.reviewId);
    const people = await this.options.workspacePeopleService.list(workspaceId);
    const identities = await this.options.approvalSurfaceIdentityService.list(workspaceId);
    const expiresAt = new Date(this.now().getTime() + (input.expiresInMinutes ?? 60) * 60_000).toISOString();

    const eligibleUserIds = new Set<string>([
      ...review.reviewer_ids,
      ...review.assignee_ids,
      ...people.people.filter((person) => person.role === "admin").map((person) => person.id),
    ]);

    const recipients = identities.identities
      .filter((identity) => identity.channel === "whatsapp" && identity.status === "allowed")
      .filter((identity) => eligibleUserIds.has(identity.user_id))
      .map((identity) => {
        const person = people.people.find((candidate) => candidate.id === identity.user_id);
        if (!person) {
          return null;
        }

        return {
          userId: identity.user_id,
          displayName: person.display_name,
          actorIdentity: identity.external_identity,
          approveToken: this.options.tokenSigner.sign({
            version: 1,
            workspaceId,
            reviewId: review.id,
            channel: "whatsapp",
            decision: "approved",
            userId: identity.user_id,
            actorIdentity: identity.external_identity,
            expiresAt,
          }),
          denyToken: this.options.tokenSigner.sign({
            version: 1,
            workspaceId,
            reviewId: review.id,
            channel: "whatsapp",
            decision: "denied",
            userId: identity.user_id,
            actorIdentity: identity.external_identity,
            expiresAt,
          }),
        };
      })
      .filter((recipient): recipient is WhatsAppApprovalActionRecipient => Boolean(recipient));

    return {
      review,
      recipients,
    };
  }

  async buildSlackApprovalActions(
    workspaceId: string,
    input: BuildSlackApprovalActionsInput,
  ): Promise<{
    review: ReviewRecordView;
    recipients: SlackApprovalActionRecipient[];
  }> {
    const review = await this.options.reviewService.getById(workspaceId, input.reviewId);
    const people = await this.options.workspacePeopleService.list(workspaceId);
    const identities = await this.options.approvalSurfaceIdentityService.list(workspaceId);
    const expiresAt = new Date(this.now().getTime() + (input.expiresInMinutes ?? 60) * 60_000).toISOString();

    const eligibleUserIds = new Set<string>([
      ...review.reviewer_ids,
      ...review.assignee_ids,
      ...people.people.filter((person) => person.role === "admin").map((person) => person.id),
    ]);

    const recipients = identities.identities
      .filter((identity) => identity.channel === "slack" && identity.status === "allowed")
      .filter((identity) => eligibleUserIds.has(identity.user_id))
      .map((identity) => {
        const person = people.people.find((candidate) => candidate.id === identity.user_id);
        if (!person) {
          return null;
        }

        return {
          userId: identity.user_id,
          displayName: person.display_name,
          actorIdentity: identity.external_identity,
          approveToken: this.options.tokenSigner.sign({
            version: 1,
            workspaceId,
            reviewId: review.id,
            channel: "slack",
            decision: "approved",
            userId: identity.user_id,
            actorIdentity: identity.external_identity,
            expiresAt,
          }),
          denyToken: this.options.tokenSigner.sign({
            version: 1,
            workspaceId,
            reviewId: review.id,
            channel: "slack",
            decision: "denied",
            userId: identity.user_id,
            actorIdentity: identity.external_identity,
            expiresAt,
          }),
        };
      })
      .filter((recipient): recipient is SlackApprovalActionRecipient => Boolean(recipient));

    return {
      review,
      recipients,
    };
  }

  async resolveSlackAction(input: ResolveSlackReviewInput): Promise<{
    review: ReviewRecordView;
    decision: ReviewDecisionRecordView | null;
    alreadyResolved: boolean;
  }> {
    const tokenPayload = this.options.tokenSigner.verify(input.approvalToken);
    if (tokenPayload.channel !== "slack") {
      throw new ReviewApprovalSurfaceError("Approval token is not valid for Slack.");
    }

    const normalizedActorIdentity = normalizeExternalIdentity(input.actorIdentity);
    if (normalizedActorIdentity !== tokenPayload.actorIdentity) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "Slack actor identity does not match the approval token.",
      );
    }

    const identity = await this.options.approvalSurfaceIdentityService.findAllowedIdentity(
      tokenPayload.workspaceId,
      "slack",
      normalizedActorIdentity,
    );
    if (!identity || identity.user_id !== tokenPayload.userId) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "Slack identity is not allowed to resolve this review.",
      );
    }

    const people = await this.options.workspacePeopleService.list(tokenPayload.workspaceId);
    const person = people.people.find((candidate) => candidate.id === identity.user_id);
    if (!person) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "Mapped workspace person no longer exists for this Slack identity.",
      );
    }

    const currentReview = await this.options.reviewService.getById(
      tokenPayload.workspaceId,
      tokenPayload.reviewId,
    );
    const isEligible =
      person.role === "admin"
      || currentReview.reviewer_ids.includes(identity.user_id)
      || currentReview.assignee_ids.includes(identity.user_id);
    if (!isEligible) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "This Slack identity is not eligible to resolve the review.",
      );
    }
    const alreadyResolved = currentReview.status !== "pending";

    const review = await this.options.reviewResolutionService.resolve(
      tokenPayload.workspaceId,
      tokenPayload.reviewId,
      {
        decision: tokenPayload.decision,
        rationale: input.rationale ?? null,
        actor: {
          surface: "slack",
          userId: identity.user_id,
          actorExternalId: normalizedActorIdentity,
          displayName: person.display_name,
          payload: {
            approval_surface_identity_id: identity.id,
            ...(input.interactionId ? { interaction_id: input.interactionId } : {}),
          },
        },
      },
    );

    return {
      review,
      decision: this.options.reviewDecisionService
        ? await this.options.reviewDecisionService.findByReviewId(
            tokenPayload.workspaceId,
            tokenPayload.reviewId,
          )
        : null,
      alreadyResolved,
    };
  }

  async resolveWhatsAppAction(input: ResolveWhatsAppReviewInput): Promise<{
    review: ReviewRecordView;
    decision: ReviewDecisionRecordView | null;
    alreadyResolved: boolean;
  }> {
    const tokenPayload = this.options.tokenSigner.verify(input.approvalToken);
    if (tokenPayload.channel !== "whatsapp") {
      throw new ReviewApprovalSurfaceError("Approval token is not valid for WhatsApp.");
    }

    const normalizedActorIdentity = normalizeExternalIdentity(input.actorIdentity);
    if (normalizedActorIdentity !== tokenPayload.actorIdentity) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "WhatsApp actor identity does not match the approval token.",
      );
    }

    const identity = await this.options.approvalSurfaceIdentityService.findAllowedIdentity(
      tokenPayload.workspaceId,
      "whatsapp",
      normalizedActorIdentity,
    );
    if (!identity || identity.user_id !== tokenPayload.userId) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "WhatsApp identity is not allowed to resolve this review.",
      );
    }

    const people = await this.options.workspacePeopleService.list(tokenPayload.workspaceId);
    const person = people.people.find((candidate) => candidate.id === identity.user_id);
    if (!person) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "Mapped workspace person no longer exists for this WhatsApp identity.",
      );
    }

    const currentReview = await this.options.reviewService.getById(
      tokenPayload.workspaceId,
      tokenPayload.reviewId,
    );
    const isEligible =
      person.role === "admin"
      || currentReview.reviewer_ids.includes(identity.user_id)
      || currentReview.assignee_ids.includes(identity.user_id);
    if (!isEligible) {
      throw new ReviewApprovalSurfaceForbiddenError(
        "This WhatsApp identity is not eligible to resolve the review.",
      );
    }

    if (currentReview.status !== "pending") {
      return {
        review: currentReview,
        decision: this.options.reviewDecisionService
          ? await this.options.reviewDecisionService.findByReviewId(
              tokenPayload.workspaceId,
              tokenPayload.reviewId,
            )
          : null,
        alreadyResolved: true,
      };
    }

    const review = await this.options.reviewResolutionService.resolve(
      tokenPayload.workspaceId,
      tokenPayload.reviewId,
      {
        decision: tokenPayload.decision,
        rationale: input.rationale ?? null,
        actor: {
          surface: "whatsapp",
          userId: identity.user_id,
          actorExternalId: normalizedActorIdentity,
          displayName: person.display_name,
          payload: {
            approval_surface_identity_id: identity.id,
            ...(input.interactionId ? { interaction_id: input.interactionId } : {}),
          },
        },
      },
    );

    return {
      review,
      decision: this.options.reviewDecisionService
        ? await this.options.reviewDecisionService.findByReviewId(
            tokenPayload.workspaceId,
            tokenPayload.reviewId,
          )
        : null,
      alreadyResolved: false,
    };
  }
}

export { ApprovalSurfaceTokenError };
