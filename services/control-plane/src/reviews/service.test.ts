import { beforeEach, describe, expect, it } from "vitest";

import { ReviewService, ReviewNotFoundError, ReviewStateError } from "./service.js";
import type { StoredReview, ReviewStore } from "./types.js";

class MemoryReviewStore implements ReviewStore {
  reviews: StoredReview[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.reviews
      .filter((r) => r.workspaceId === workspaceId)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  async listPending(workspaceId: string) {
    return this.reviews
      .filter((r) => r.workspaceId === workspaceId && r.status === "pending")
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime());
  }

  async findById(workspaceId: string, id: string) {
    return this.reviews.find((r) => r.workspaceId === workspaceId && r.id === id) ?? null;
  }

  async create(input: StoredReview) {
    this.reviews.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredReview>) {
    const review = this.reviews.find((r) => r.id === id);
    if (!review) throw new Error("not found");
    Object.assign(review, input);
    return { ...review };
  }

  async remove(id: string) {
    this.reviews = this.reviews.filter((r) => r.id !== id);
  }
}

describe("ReviewService", () => {
  let store: MemoryReviewStore;
  let service: ReviewService;
  const WS = "ws_test";
  const NOW = new Date("2026-03-18T10:00:00Z");

  beforeEach(() => {
    store = new MemoryReviewStore();
    service = new ReviewService({ store, now: () => NOW });
  });

  it("creates a review in pending state", async () => {
    const result = await service.create(WS, {
      actionKind: "send_email",
      workerId: "wkr_01",
      workItemId: "wi_01",
      reviewerIds: ["usr_dave"],
      assigneeIds: ["usr_emma"],
      sourceRouteKind: "watched_inbox",
      actionDestination: "sarah@acme.com",
    });

    expect(result.id).toMatch(/^rev_/);
    expect(result.status).toBe("pending");
    expect(result.action_kind).toBe("send_email");
    expect(result.worker_id).toBe("wkr_01");
    expect(result.action_destination).toBe("sarah@acme.com");
    expect(result.requested_at).toBeTruthy();
    expect(result.resolved_at).toBeNull();
  });

  it("lists pending reviews", async () => {
    await service.create(WS, { actionKind: "send_email", workerId: "wkr_01" });
    const b = await service.create(WS, { actionKind: "create_ticket", workerId: "wkr_02" });
    await service.resolve(WS, b.id, { status: "approved" });

    const pending = await service.listPending(WS);
    expect(pending.reviews).toHaveLength(1);
  });

  it("approves a pending review", async () => {
    const created = await service.create(WS, { actionKind: "send_email", workerId: "wkr_01" });
    const { review: approved } = await service.resolve(WS, created.id, { status: "approved" });
    expect(approved.status).toBe("approved");
    expect(approved.resolved_at).toBeTruthy();
  });

  it("denies a pending review", async () => {
    const created = await service.create(WS, { actionKind: "open_pr", workerId: "wkr_01" });
    const { review: denied } = await service.resolve(WS, created.id, { status: "denied" });
    expect(denied.status).toBe("denied");
  });

  it("returns already resolved review idempotently", async () => {
    const created = await service.create(WS, { actionKind: "send_email", workerId: "wkr_01" });
    const { alreadyResolved: first } = await service.resolve(WS, created.id, { status: "approved" });
    expect(first).toBe(false);

    const { review, alreadyResolved: second } = await service.resolve(WS, created.id, { status: "denied" });
    expect(second).toBe(true);
    expect(review.status).toBe("approved"); // keeps original decision
  });

  it("throws when getting nonexistent review", async () => {
    await expect(service.getById(WS, "rev_missing")).rejects.toBeInstanceOf(ReviewNotFoundError);
  });
});
