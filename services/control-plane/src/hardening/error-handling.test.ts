import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReviewResolutionService } from "../reviews/resolution-service.js";
import { ReviewService, ReviewNotFoundError } from "../reviews/service.js";
import type { StoredReview, ReviewStore } from "../reviews/types.js";
import { createReviewedSendDeps } from "../reviews/test-reviewed-send.js";

import { WorkItemService, WorkItemNotFoundError } from "../work-items/service.js";
import type { StoredWorkItem, WorkItemStore } from "../work-items/types.js";

import { InboxItemService, InboxItemStateError } from "../inbox/service.js";
import type { StoredInboxItem, InboxItemStore } from "../inbox/types.js";

import { ActivityService } from "../activity/service.js";
import type { StoredActivityEvent, ActivityEventStore } from "../activity/types.js";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

class MemoryReviewStore implements ReviewStore {
  reviews: StoredReview[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.reviews.filter((r) => r.workspaceId === workspaceId);
  }
  async listPending(workspaceId: string) {
    return this.reviews.filter((r) => r.workspaceId === workspaceId && r.status === "pending");
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

class MemoryWorkItemStore implements WorkItemStore {
  items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((w) => w.workspaceId === workspaceId);
  }
  async listByWorker(workerId: string) {
    return this.items.filter((w) => w.workerId === workerId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }
  async create(input: StoredWorkItem) {
    this.items.push({ ...input });
    return { ...input };
  }
  async update(id: string, input: Partial<StoredWorkItem>) {
    const item = this.items.find((w) => w.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }
  async remove(id: string) {
    this.items = this.items.filter((w) => w.id !== id);
  }
}

class MemoryInboxItemStore implements InboxItemStore {
  items: StoredInboxItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId);
  }
  async listOpen(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId && i.state === "open");
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }
  async findByReviewId(workspaceId: string, reviewId: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.reviewId === reviewId) ?? null;
  }
  async create(input: StoredInboxItem) {
    this.items.push({ ...input });
    return { ...input };
  }
  async update(id: string, input: Partial<StoredInboxItem>) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }
  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

class MemoryActivityEventStore implements ActivityEventStore {
  events: StoredActivityEvent[] = [];

  async listByWorkspace(workspaceId: string, limit?: number) {
    const filtered = this.events
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? filtered.slice(0, limit) : filtered;
  }
  async findByReviewResult(workspaceId: string, reviewId: string, resultKind: string) {
    return (
      this.events.find(
        (e) =>
          e.workspaceId === workspaceId &&
          e.reviewId === reviewId &&
          e.resultKind === resultKind,
      ) ?? null
    );
  }
  async create(input: StoredActivityEvent) {
    this.events.push({ ...input });
    return { ...input };
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WS = "ws_test";
const WORKER_ID = "wkr_followup";
const NOW = new Date("2026-03-18T10:00:00Z");

function createServices() {
  const reviewStore = new MemoryReviewStore();
  const workItemStore = new MemoryWorkItemStore();
  const inboxItemStore = new MemoryInboxItemStore();
  const activityStore = new MemoryActivityEventStore();

  const reviewService = new ReviewService({ store: reviewStore, now: () => NOW });
  const workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
  const inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
  const activityService = new ActivityService({ store: activityStore, now: () => NOW });

  const resolutionService = new ReviewResolutionService({
    reviewService,
    workItemService,
    inboxItemService,
    activityService,
    ...createReviewedSendDeps(WORKER_ID),
  });

  return {
    reviewStore,
    workItemStore,
    inboxItemStore,
    activityStore,
    reviewService,
    workItemService,
    inboxItemService,
    activityService,
    resolutionService,
  };
}

// ---------------------------------------------------------------------------
// What happens if resolve is called with a nonexistent review?
// ---------------------------------------------------------------------------

describe("Error handling: resolve nonexistent review", () => {
  it("throws ReviewNotFoundError when review_id does not exist", async () => {
    const s = createServices();

    await expect(
      s.resolutionService.resolve(WS, "rev_nonexistent", { decision: "approved" }),
    ).rejects.toThrow(ReviewNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// What happens if the work_item_id on the review references a deleted work item?
// ---------------------------------------------------------------------------

describe("Error handling: review references nonexistent work item", () => {
  it("throws WorkItemNotFoundError when work item was deleted after review creation", async () => {
    const s = createServices();

    // Create review that references a work item that doesn't exist
    await s.reviewStore.create({
      id: "rev_orphan",
      workspaceId: WS,
      actionKind: "send_email",
      status: "pending",
      workerId: WORKER_ID,
      workItemId: "wi_deleted", // this work item doesn't exist
      reviewerIds: ["usr_dave"],
      assigneeIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      actionDestination: "sarah@acme.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      s.resolutionService.resolve(WS, "rev_orphan", { decision: "approved" }),
    ).rejects.toThrow(WorkItemNotFoundError);

    // Preflight must fail before review truth mutates.
    const review = s.reviewStore.reviews.find((r) => r.id === "rev_orphan")!;
    expect(review.status).toBe("pending");
    expect(s.activityStore.events).toHaveLength(0);
  });

  it("keeps the review pending when the reviewed send draft is incomplete", async () => {
    const s = createServices();

    await s.reviewStore.create({
      id: "rev_incomplete_draft",
      workspaceId: WS,
      actionKind: "send_email",
      status: "pending",
      workerId: WORKER_ID,
      workItemId: "wi_incomplete_draft",
      reviewerIds: ["usr_dave"],
      assigneeIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      actionDestination: "sarah@acme.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await s.workItemStore.create({
      id: "wi_incomplete_draft",
      workspaceId: WS,
      workerId: WORKER_ID,
      kind: "email_draft",
      status: "pending_review",
      title: "Draft reply",
      summary: null,
      assigneeIds: ["usr_dave"],
      reviewerIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      sourceEventId: "src_01",
      reviewId: "rev_incomplete_draft",
      runId: null,
      triageJson: null,
      draftTo: "sarah@acme.com",
      draftSubject: "Re: Q3 renewal",
      draftBody: null,
      executionStatus: "not_requested",
      executionError: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await expect(
      s.resolutionService.resolve(WS, "rev_incomplete_draft", { decision: "approved" }),
    ).rejects.toThrow("Reviewed send requires a draft recipient, subject, and body.");

    const review = s.reviewStore.reviews.find((r) => r.id === "rev_incomplete_draft")!;
    const workItem = s.workItemStore.items.find((item) => item.id === "wi_incomplete_draft")!;
    expect(review.status).toBe("pending");
    expect(workItem.status).toBe("pending_review");
    expect(workItem.executionStatus).toBe("not_requested");
    expect(workItem.executionStateJson).toBeUndefined();
    expect(s.activityStore.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// What happens if the inbox item is already resolved?
// ---------------------------------------------------------------------------

describe("Error handling: inbox item already resolved before review resolution", () => {
  it("resolution succeeds when inbox item is already resolved", async () => {
    const s = createServices();

    await s.reviewStore.create({
      id: "rev_01",
      workspaceId: WS,
      actionKind: "send_email",
      status: "pending",
      workerId: WORKER_ID,
      workItemId: "wi_01",
      reviewerIds: ["usr_dave"],
      assigneeIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      actionDestination: "sarah@acme.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await s.workItemStore.create({
      id: "wi_01",
      workspaceId: WS,
      workerId: WORKER_ID,
      kind: "email_draft",
      status: "pending_review",
      title: "Draft reply",
      summary: null,
      assigneeIds: ["usr_dave"],
      reviewerIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      sourceEventId: "src_01",
      reviewId: "rev_01",
      runId: null,
      triageJson: null,
      draftTo: "sarah@acme.com",
      draftSubject: "Re: Q3 renewal",
      draftBody: "Hi Sarah,\n\nThanks for the note.",
      executionStatus: "not_requested",
      executionError: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Create inbox item already resolved
    await s.inboxItemStore.create({
      id: "inb_01",
      workspaceId: WS,
      kind: "review",
      title: "Review draft",
      summary: null,
      assigneeIds: ["usr_dave"],
      workerId: WORKER_ID,
      workItemId: null,
      reviewId: "rev_01",
      routeKind: "forward_email",
      state: "resolved", // already resolved
      triageJson: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Resolution should succeed — ensureInboxState skips already-resolved items
    const result = await s.resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
    });
    expect(result.status).toBe("completed");

    // Inbox item stays resolved (not double-updated)
    const inboxItem = s.inboxItemStore.items.find((i) => i.id === "inb_01")!;
    expect(inboxItem.state).toBe("resolved");
  });
});

// ---------------------------------------------------------------------------
// What happens if activity append fails?
// ---------------------------------------------------------------------------

describe("Error handling: activity append failure", () => {
  it("activity failure propagates (review is already resolved — partial state)", async () => {
    const s = createServices();

    await s.reviewStore.create({
      id: "rev_act_fail",
      workspaceId: WS,
      actionKind: "send_email",
      status: "pending",
      workerId: WORKER_ID,
      workItemId: "wi_act_fail",
      reviewerIds: ["usr_dave"],
      assigneeIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      actionDestination: "sarah@acme.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await s.workItemStore.create({
      id: "wi_act_fail",
      workspaceId: WS,
      workerId: WORKER_ID,
      kind: "email_draft",
      status: "pending_review",
      title: "Draft reply",
      summary: null,
      assigneeIds: ["usr_dave"],
      reviewerIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      sourceEventId: "src_01",
      reviewId: "rev_act_fail",
      runId: null,
      triageJson: null,
      draftTo: "sarah@acme.com",
      draftSubject: "Re: Q3 renewal",
      draftBody: "Hi Sarah,\n\nThanks for the note.",
      executionStatus: "not_requested",
      executionError: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Make the activity store throw on create
    const originalCreate = s.activityStore.create.bind(s.activityStore);
    s.activityStore.create = async () => {
      throw new Error("Activity store failure");
    };

    // BUG FOUND: If activity append fails, the review is already resolved
    // but the activity event is missing. This is a partial state problem.
    // The resolution service should either:
    // 1. Wrap activity append in try/catch (activity is less critical)
    // 2. Use a transaction or saga pattern
    await expect(
      s.resolutionService.resolve(WS, "rev_act_fail", { decision: "approved" }),
    ).rejects.toThrow("Activity store failure");

    // The review was marked as approved before the activity failure
    const review = s.reviewStore.reviews.find((r) => r.id === "rev_act_fail")!;
    expect(review.status).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// Work item service edge cases
// ---------------------------------------------------------------------------

describe("Error handling: work item service", () => {
  it("getById throws for nonexistent work item", async () => {
    const s = createServices();
    await expect(
      s.workItemService.getById(WS, "wi_nonexistent"),
    ).rejects.toThrow(WorkItemNotFoundError);
  });

  it("update throws for nonexistent work item", async () => {
    const s = createServices();
    await expect(
      s.workItemService.update(WS, "wi_nonexistent", { status: "sent" }),
    ).rejects.toThrow(WorkItemNotFoundError);
  });

  it("remove throws for nonexistent work item", async () => {
    const s = createServices();
    await expect(
      s.workItemService.remove(WS, "wi_nonexistent"),
    ).rejects.toThrow(WorkItemNotFoundError);
  });
});

// ---------------------------------------------------------------------------
// Inbox item service edge cases
// ---------------------------------------------------------------------------

describe("Error handling: inbox item service", () => {
  it("resolve throws InboxItemStateError for already-resolved item", async () => {
    const s = createServices();

    const item = await s.inboxItemService.create(WS, {
      kind: "review",
      title: "Test",
    });

    await s.inboxItemService.resolve(WS, item.id);

    // Second resolve should throw
    await expect(
      s.inboxItemService.resolve(WS, item.id),
    ).rejects.toThrow(InboxItemStateError);
  });

  it("dismiss throws InboxItemStateError for already-resolved item", async () => {
    const s = createServices();

    const item = await s.inboxItemService.create(WS, {
      kind: "review",
      title: "Test",
    });

    await s.inboxItemService.resolve(WS, item.id);

    // Can't dismiss a resolved item
    await expect(
      s.inboxItemService.dismiss(WS, item.id),
    ).rejects.toThrow(InboxItemStateError);
  });

  it("dismiss throws InboxItemStateError for already-dismissed item", async () => {
    const s = createServices();

    const item = await s.inboxItemService.create(WS, {
      kind: "setup",
      title: "Test setup",
    });

    await s.inboxItemService.dismiss(WS, item.id);

    await expect(
      s.inboxItemService.dismiss(WS, item.id),
    ).rejects.toThrow(InboxItemStateError);
  });
});

// ---------------------------------------------------------------------------
// Review service edge cases
// ---------------------------------------------------------------------------

describe("Error handling: review service", () => {
  it("resolve throws for nonexistent review", async () => {
    const s = createServices();
    await expect(
      s.reviewService.resolve(WS, "rev_ghost", { status: "approved" }),
    ).rejects.toThrow(ReviewNotFoundError);
  });

  it("getById throws for nonexistent review", async () => {
    const s = createServices();
    await expect(
      s.reviewService.getById(WS, "rev_ghost"),
    ).rejects.toThrow(ReviewNotFoundError);
  });
});
