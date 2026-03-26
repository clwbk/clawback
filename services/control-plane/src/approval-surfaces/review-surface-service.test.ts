import { describe, expect, it, vi } from "vitest";

import type { ReviewRecordView } from "../reviews/types.js";
import type { ReviewDecisionRecordView } from "../reviews/decision-types.js";
import {
  ApprovalSurfaceTokenError,
  ApprovalSurfaceTokenSigner,
  ReviewApprovalSurfaceForbiddenError,
  ReviewApprovalSurfaceService,
} from "./index.js";

const NOW = new Date("2026-03-22T14:00:00Z");

function makeReview(status: ReviewRecordView["status"] = "pending"): ReviewRecordView {
  return {
    id: "rev_01",
    workspace_id: "ws_1",
    action_kind: "send_email",
    status,
    worker_id: "wkr_01",
    work_item_id: "wi_01",
    reviewer_ids: ["usr_reviewer"],
    assignee_ids: [],
    source_route_kind: "forward_email",
    action_destination: "client@example.com",
    requested_at: NOW.toISOString(),
    resolved_at: status === "pending" ? null : NOW.toISOString(),
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
  };
}

function makeDecision(surface: ReviewDecisionRecordView["surface"]): ReviewDecisionRecordView {
  return {
    id: "rdc_01",
    workspace_id: "ws_1",
    review_id: "rev_01",
    decision: "approved",
    surface,
    decided_by_user_id: "usr_reviewer",
    actor_external_id:
      surface === "whatsapp"
        ? "15551234567@c.us"
        : surface === "slack"
          ? "uadmin01"
          : null,
    rationale: null,
    payload: {},
    occurred_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
  };
}

function createService(options?: {
  review?: ReviewRecordView;
  decision?: ReviewDecisionRecordView | null;
  allowedIdentity?: {
    id: string;
    user_id: string;
    external_identity: string;
  } | null;
}) {
  const review = options?.review ?? makeReview();
  const resolution = vi.fn(async (_workspaceId: string, _reviewId: string, input: unknown) => {
    return {
      ...review,
      status: "completed" as const,
      resolved_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      _resolutionInput: input,
    };
  });

  const reviewService = {
    getById: vi.fn(async () => review),
  };
  const reviewDecisionService = {
    findByReviewId: vi.fn(async () => options?.decision ?? null),
  };
  const approvalSurfaceIdentityService = {
    list: vi.fn(async () => ({
      identities: [
        {
          id: "aps_reviewer",
          workspace_id: "ws_1",
          channel: "whatsapp" as const,
          user_id: "usr_reviewer",
          external_identity: "15551234567@c.us",
          label: "Reviewer WhatsApp",
          status: "allowed" as const,
          created_at: NOW.toISOString(),
          updated_at: NOW.toISOString(),
        },
        {
          id: "aps_admin",
          workspace_id: "ws_1",
          channel: "whatsapp" as const,
          user_id: "usr_admin",
          external_identity: "15557654321@c.us",
          label: "Admin WhatsApp",
          status: "allowed" as const,
          created_at: NOW.toISOString(),
          updated_at: NOW.toISOString(),
        },
        {
          id: "aps_extra",
          workspace_id: "ws_1",
          channel: "whatsapp" as const,
          user_id: "usr_outsider",
          external_identity: "19998887777@c.us",
          label: "Outsider WhatsApp",
          status: "allowed" as const,
          created_at: NOW.toISOString(),
          updated_at: NOW.toISOString(),
        },
        {
          id: "aps_slack_admin",
          workspace_id: "ws_1",
          channel: "slack" as const,
          user_id: "usr_admin",
          external_identity: "uadmin01",
          label: "Admin Slack",
          status: "allowed" as const,
          created_at: NOW.toISOString(),
          updated_at: NOW.toISOString(),
        },
      ],
    })),
    findAllowedIdentity: vi.fn(async (_workspaceId: string, channel: "slack" | "whatsapp") => {
      if (options?.allowedIdentity) {
        return options.allowedIdentity;
      }

      if (channel === "slack") {
        return {
          id: "aps_slack_admin",
          workspace_id: "ws_1",
          channel: "slack" as const,
          user_id: "usr_admin",
          external_identity: "uadmin01",
          label: "Admin Slack",
          status: "allowed" as const,
          created_at: NOW.toISOString(),
          updated_at: NOW.toISOString(),
        };
      }

      return {
        id: "aps_reviewer",
        workspace_id: "ws_1",
        channel: "whatsapp" as const,
        user_id: "usr_reviewer",
        external_identity: "15551234567@c.us",
        label: "Reviewer WhatsApp",
        status: "allowed" as const,
        created_at: NOW.toISOString(),
        updated_at: NOW.toISOString(),
      };
    }),
  };
  const workspacePeopleService = {
    list: vi.fn(async () => ({
      people: [
        {
          id: "usr_reviewer",
          email: "reviewer@example.com",
          display_name: "Riley Reviewer",
          role: "user" as const,
        },
        {
          id: "usr_admin",
          email: "admin@example.com",
          display_name: "Alex Admin",
          role: "admin" as const,
        },
        {
          id: "usr_outsider",
          email: "outsider@example.com",
          display_name: "Olive Outsider",
          role: "user" as const,
        },
      ],
    })),
  };

  const service = new ReviewApprovalSurfaceService({
    reviewService: reviewService as any,
    reviewResolutionService: { resolve: resolution } as any,
    reviewDecisionService: reviewDecisionService as any,
    approvalSurfaceIdentityService: approvalSurfaceIdentityService as any,
    workspacePeopleService: workspacePeopleService as any,
    tokenSigner: new ApprovalSurfaceTokenSigner("unit-test-approval-surface-secret", () => NOW),
    now: () => NOW,
  });

  return {
    service,
    resolution,
    reviewService,
    reviewDecisionService,
    approvalSurfaceIdentityService,
    workspacePeopleService,
  };
}

describe("ReviewApprovalSurfaceService", () => {
  it("builds WhatsApp approval actions only for eligible allowed identities", async () => {
    const { service } = createService();

    const result = await service.buildWhatsAppApprovalActions("ws_1", {
      reviewId: "rev_01",
      expiresInMinutes: 15,
    });

    expect(result.review.id).toBe("rev_01");
    expect(result.recipients).toHaveLength(2);
    expect(result.recipients.map((recipient) => recipient.userId).sort()).toEqual([
      "usr_admin",
      "usr_reviewer",
    ]);

    const signer = new ApprovalSurfaceTokenSigner("unit-test-approval-surface-secret", () => NOW);
    const payload = signer.verify(result.recipients[0]!.approveToken);
    expect(payload.workspaceId).toBe("ws_1");
    expect(payload.reviewId).toBe("rev_01");
    expect(payload.channel).toBe("whatsapp");
  });

  it("rejects malformed tokens", async () => {
    const { service } = createService();

    await expect(
      service.resolveWhatsAppAction({
        approvalToken: "bad-token",
        actorIdentity: "15551234567@c.us",
      }),
    ).rejects.toBeInstanceOf(ApprovalSurfaceTokenError);
  });

  it("rejects actor identities that do not match the signed token", async () => {
    const { service } = createService();
    const signer = new ApprovalSurfaceTokenSigner("unit-test-approval-surface-secret", () => NOW);
    const token = signer.sign({
      version: 1,
      workspaceId: "ws_1",
      reviewId: "rev_01",
      channel: "whatsapp",
      decision: "approved",
      userId: "usr_reviewer",
      actorIdentity: "15551234567@c.us",
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });

    await expect(
      service.resolveWhatsAppAction({
        approvalToken: token,
        actorIdentity: "19998887777@c.us",
      }),
    ).rejects.toBeInstanceOf(ReviewApprovalSurfaceForbiddenError);
  });

  it("returns alreadyResolved without calling resolution for non-pending reviews", async () => {
    const { service, resolution } = createService({
      review: makeReview("completed"),
      decision: makeDecision("whatsapp"),
    });
    const signer = new ApprovalSurfaceTokenSigner("unit-test-approval-surface-secret", () => NOW);
    const token = signer.sign({
      version: 1,
      workspaceId: "ws_1",
      reviewId: "rev_01",
      channel: "whatsapp",
      decision: "approved",
      userId: "usr_reviewer",
      actorIdentity: "15551234567@c.us",
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });

    const result = await service.resolveWhatsAppAction({
      approvalToken: token,
      actorIdentity: "15551234567@c.us",
    });

    expect(result.alreadyResolved).toBe(true);
    expect(result.decision?.surface).toBe("whatsapp");
    expect(resolution).not.toHaveBeenCalled();
  });

  it("passes explicit actor metadata into the shared review resolution path", async () => {
    const { service, resolution } = createService();
    const signer = new ApprovalSurfaceTokenSigner("unit-test-approval-surface-secret", () => NOW);
    const token = signer.sign({
      version: 1,
      workspaceId: "ws_1",
      reviewId: "rev_01",
      channel: "whatsapp",
      decision: "denied",
      userId: "usr_reviewer",
      actorIdentity: "15551234567@c.us",
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });

    const result = await service.resolveWhatsAppAction({
      approvalToken: token,
      actorIdentity: "15551234567@c.us",
      rationale: "Not ready",
      interactionId: "wa_msg_123",
    });

    expect(result.alreadyResolved).toBe(false);
    expect(resolution).toHaveBeenCalledTimes(1);
    expect(resolution.mock.calls[0]?.[0]).toBe("ws_1");
    expect(resolution.mock.calls[0]?.[1]).toBe("rev_01");
    expect(resolution.mock.calls[0]?.[2]).toMatchObject({
      decision: "denied",
      rationale: "Not ready",
      actor: {
        surface: "whatsapp",
        userId: "usr_reviewer",
        actorExternalId: "15551234567@c.us",
        displayName: "Riley Reviewer",
        payload: {
          approval_surface_identity_id: "aps_reviewer",
          interaction_id: "wa_msg_123",
        },
      },
    });
  });

  it("routes already-resolved Slack approvals through the shared resolver for repair consistency", async () => {
    const { service, resolution } = createService({
      review: makeReview("completed"),
      decision: makeDecision("slack"),
    });
    const signer = new ApprovalSurfaceTokenSigner("unit-test-approval-surface-secret", () => NOW);
    const token = signer.sign({
      version: 1,
      workspaceId: "ws_1",
      reviewId: "rev_01",
      channel: "slack",
      decision: "approved",
      userId: "usr_admin",
      actorIdentity: "uadmin01",
      expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    });

    const result = await service.resolveSlackAction({
      approvalToken: token,
      actorIdentity: "UADMIN01",
    });

    expect(result.alreadyResolved).toBe(true);
    expect(result.decision?.surface).toBe("slack");
    expect(resolution).toHaveBeenCalledTimes(1);
    expect(resolution.mock.calls[0]?.[0]).toBe("ws_1");
    expect(resolution.mock.calls[0]?.[1]).toBe("rev_01");
    expect(resolution.mock.calls[0]?.[2]).toMatchObject({
      decision: "approved",
      actor: {
        surface: "slack",
        userId: "usr_admin",
        actorExternalId: "uadmin01",
        displayName: "Alex Admin",
      },
    });
  });
});
