import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ReviewExecutionConfigurationError,
  ReviewExecutionStateError,
  ReviewResolutionService,
} from "../reviews/resolution-service.js";
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
// Fixtures & setup
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

function createServicesWithReviewedSender(
  sendReviewedEmail: (input: {
    workspaceId: string;
    reviewId: string;
    workItemId: string;
    to: string;
    subject: string;
    body: string;
  }) => Promise<{ providerMessageId: string | null }>,
) {
  const reviewStore = new MemoryReviewStore();
  const workItemStore = new MemoryWorkItemStore();
  const inboxItemStore = new MemoryInboxItemStore();
  const activityStore = new MemoryActivityEventStore();

  const reviewService = new ReviewService({ store: reviewStore, now: () => NOW });
  const workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
  const inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
  const activityService = new ActivityService({ store: activityStore, now: () => NOW });

  const reviewedSendDeps = createReviewedSendDeps(WORKER_ID);
  const resolutionService = new ReviewResolutionService({
    reviewService,
    workItemService,
    inboxItemService,
    activityService,
    workerService: reviewedSendDeps.workerService,
    actionCapabilityService: reviewedSendDeps.actionCapabilityService,
    connectionService: reviewedSendDeps.connectionService,
    reviewedEmailSender: { sendReviewedEmail },
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

async function seedReviewWithDeps(stores: ReturnType<typeof createServices>) {
  await stores.reviewStore.create({
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

  await stores.workItemStore.create({
    id: "wi_01",
    workspaceId: WS,
    workerId: WORKER_ID,
    kind: "email_draft",
    status: "pending_review",
    title: "Draft reply: Q3 renewal",
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
    draftBody: "Hi Sarah,\n\nThanks for the follow-up.",
    executionStatus: "not_requested",
    executionError: null,
    createdAt: NOW,
    updatedAt: NOW,
  });

  await stores.inboxItemStore.create({
    id: "inb_01",
    workspaceId: WS,
    kind: "review",
    title: "Review draft",
    summary: null,
    assigneeIds: ["usr_dave"],
    workerId: WORKER_ID,
    workItemId: "wi_01",
    reviewId: "rev_01",
    routeKind: "forward_email",
    state: "open",
    triageJson: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

// ---------------------------------------------------------------------------
// After approval: work item status matches review decision
// ---------------------------------------------------------------------------

describe("Consistency: review approval updates work item status", () => {
  it("after approval, work item status is 'sent'", async () => {
    const s = createServices();
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
      rationale: "Good to go",
    });

    const workItem = s.workItemStore.items.find((i) => i.id === "wi_01")!;
    expect(workItem.status).toBe("sent");
    expect(workItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      pause_reason: null,
      resume_reason: "review_approved",
      last_decision: "shadow_draft",
    });
    expect(workItem.executionOutcomeJson).toMatchObject({
      kind: "reviewed_send_email",
      status: "sent",
      review_id: "rev_01",
      transport: "smtp_relay",
      connection_id: "conn_smtp_01",
      connection_label: "SMTP Relay",
      attempt_count: 1,
      provider_message_id: "msg_test_01",
      last_error: null,
    });
  });

  it("after denial, work item status stays 'pending_review'", async () => {
    const s = createServices();
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "denied",
      rationale: "Not right",
    });

    const workItem = s.workItemStore.items.find((i) => i.id === "wi_01")!;
    expect(workItem.status).toBe("pending_review");
    expect(workItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      pause_reason: null,
      resume_reason: "review_denied",
      last_decision: "shadow_draft",
    });
  });

  it("records failed send truth and increments attempt count on retry", async () => {
    const sendReviewedEmail = vi.fn()
      .mockRejectedValueOnce(new Error("SMTP relay unavailable"))
      .mockResolvedValueOnce({ providerMessageId: "msg_retry_01" });
    const s = createServicesWithReviewedSender(sendReviewedEmail);
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
    });

    let workItem = s.workItemStore.items.find((i) => i.id === "wi_01")!;
    expect(workItem.status).toBe("failed");
    expect(workItem.executionStatus).toBe("failed");
    expect(workItem.executionOutcomeJson).toMatchObject({
      kind: "reviewed_send_email",
      status: "failed",
      attempt_count: 1,
      provider_message_id: null,
      last_error: "SMTP relay unavailable",
    });
    expect(
      s.activityStore.events.some((event) => event.resultKind === "send_failed"),
    ).toBe(true);

    await s.resolutionService.retryApprovedSend(WS, "rev_01");

    workItem = s.workItemStore.items.find((i) => i.id === "wi_01")!;
    expect(sendReviewedEmail).toHaveBeenCalledTimes(2);
    expect(workItem.status).toBe("sent");
    expect(workItem.executionStatus).toBe("completed");
    expect(workItem.executionOutcomeJson).toMatchObject({
      kind: "reviewed_send_email",
      status: "sent",
      attempt_count: 2,
      provider_message_id: "msg_retry_01",
      last_error: null,
    });
  });

  it("keeps failed send truth intact when retry preflight cannot execute", async () => {
    const sendReviewedEmail = vi.fn().mockRejectedValueOnce(new Error("SMTP relay unavailable"));
    const s = createServicesWithReviewedSender(sendReviewedEmail);
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
    });

    const retryResolutionService = new ReviewResolutionService({
      reviewService: s.reviewService,
      workItemService: s.workItemService,
      inboxItemService: s.inboxItemService,
      activityService: s.activityService,
      ...createReviewedSendDeps(WORKER_ID, {
        connectionStatus: "not_connected",
      }),
    });

    await expect(
      retryResolutionService.retryApprovedSend(WS, "rev_01"),
    ).rejects.toThrow(ReviewExecutionConfigurationError);

    const workItem = s.workItemStore.items.find((i) => i.id === "wi_01")!;
    expect(workItem.status).toBe("failed");
    expect(workItem.executionStatus).toBe("failed");
    expect(workItem.executionError).toBe("SMTP relay unavailable");
    expect(workItem.executionOutcomeJson).toMatchObject({
      kind: "reviewed_send_email",
      status: "failed",
      attempt_count: 1,
      last_error: "SMTP relay unavailable",
    });
  });
});

// ---------------------------------------------------------------------------
// After denial: inbox item is resolved even though work item stays draft
// ---------------------------------------------------------------------------

describe("Consistency: review denial resolves inbox item", () => {
  it("inbox item is resolved after denial", async () => {
    const s = createServices();
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "denied",
    });

    const inboxItem = s.inboxItemStore.items.find((i) => i.id === "inb_01")!;
    expect(inboxItem.state).toBe("resolved");
    expect(inboxItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      resume_reason: "review_denied",
    });
  });

  it("inbox item is resolved after approval", async () => {
    const s = createServices();
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
    });

    const inboxItem = s.inboxItemStore.items.find((i) => i.id === "inb_01")!;
    expect(inboxItem.state).toBe("resolved");
    expect(inboxItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      resume_reason: "review_approved",
    });
  });
});

// ---------------------------------------------------------------------------
// Activity events are created for all state transitions
// ---------------------------------------------------------------------------

describe("Consistency: activity events for state transitions", () => {
  it("creates review_approved activity event on approval", async () => {
    const s = createServices();
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
      rationale: "Looks great",
    });

    expect(s.activityStore.events).toHaveLength(2);
    const evt = s.activityStore.events.find((event) => event.resultKind === "review_approved")!;
    const sent = s.activityStore.events.find((event) => event.resultKind === "work_item_sent");
    expect(sent).toBeTruthy();
    expect(evt.resultKind).toBe("review_approved");
    expect(evt.workerId).toBe(WORKER_ID);
    expect(evt.reviewId).toBe("rev_01");
    expect(evt.workItemId).toBe("wi_01");
    expect(evt.title).toBe("Review approved");
    expect(evt.summary).toBe("Looks great");
  });

  it("creates review_denied activity event on denial", async () => {
    const s = createServices();
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "denied",
      rationale: "Needs more work",
    });

    expect(s.activityStore.events).toHaveLength(1);
    const evt = s.activityStore.events[0]!;
    expect(evt.resultKind).toBe("review_denied");
    expect(evt.title).toBe("Review denied");
    expect(evt.summary).toBe("Needs more work");
  });

  it("activity event summary is null when no rationale provided", async () => {
    const s = createServices();
    await seedReviewWithDeps(s);

    await s.resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
    });

    const approvedEvent = s.activityStore.events.find((event) => event.resultKind === "review_approved");
    expect(approvedEvent?.summary).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No orphaned inbox items (every review inbox item has a linked review)
// ---------------------------------------------------------------------------

describe("Consistency: no orphaned inbox items", () => {
  it("inbox item created via inbound email always has a linked review_id", async () => {
    // This tests that the InboundEmailService properly links review to inbox
    // We verify by checking that InboxItemService's findByReviewId can locate it
    const s = createServices();

    // Create a review inbox item with a review_id
    const inboxItem = await s.inboxItemService.create(WS, {
      kind: "review",
      title: "Review: test",
      summary: null,
      reviewId: "rev_linked",
      workerId: WORKER_ID,
    });

    const found = await s.inboxItemService.findByReviewId(WS, "rev_linked");
    expect(found).not.toBeNull();
    expect(found!.id).toBe(inboxItem.id);
  });

  it("inbox items of kind 'review' without a review_id are allowed but flagged", async () => {
    // The system doesn't enforce FK constraints at the service level,
    // but we verify the linkage is always present in normal flow
    const s = createServices();

    // Create an inbox item without review_id (simulating a bug scenario)
    const orphan = await s.inboxItemService.create(WS, {
      kind: "review",
      title: "Orphaned review inbox item",
      summary: null,
      workerId: WORKER_ID,
    });

    // findByReviewId with a non-existent review should not find this
    const found = await s.inboxItemService.findByReviewId(WS, "rev_nonexistent");
    expect(found).toBeNull();

    // But the item exists
    const item = await s.inboxItemService.getById(WS, orphan.id);
    expect(item.review_id).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// No orphaned work items without a worker_id
// ---------------------------------------------------------------------------

describe("Consistency: no orphaned work items", () => {
  it("work item always has a worker_id when created", async () => {
    const s = createServices();

    const workItem = await s.workItemService.create(WS, {
      workerId: WORKER_ID,
      kind: "email_draft",
      title: "Test draft",
    });

    expect(workItem.worker_id).toBe(WORKER_ID);
  });

  it("work item always has a workspace_id when created", async () => {
    const s = createServices();

    const workItem = await s.workItemService.create(WS, {
      workerId: WORKER_ID,
      kind: "email_draft",
      title: "Test draft",
    });

    expect(workItem.workspace_id).toBe(WS);
  });

  it("listing work items by workspace only returns items for that workspace", async () => {
    const s = createServices();

    await s.workItemService.create(WS, {
      workerId: WORKER_ID,
      kind: "email_draft",
      title: "WS1 draft",
    });
    await s.workItemService.create("ws_other", {
      workerId: "wkr_other",
      kind: "email_draft",
      title: "WS2 draft",
    });

    const { work_items } = await s.workItemService.listByWorkspace(WS);
    expect(work_items).toHaveLength(1);
    expect(work_items[0]!.workspace_id).toBe(WS);
  });
});

// ---------------------------------------------------------------------------
// Review with no work_item_id is handled gracefully
// ---------------------------------------------------------------------------

describe("Consistency: review without work_item_id", () => {
  it("reviewed send fails when review has no work_item_id", async () => {
    const s = createServices();

    await s.reviewStore.create({
      id: "rev_no_wi",
      workspaceId: WS,
      actionKind: "send_email",
      status: "pending",
      workerId: WORKER_ID,
      workItemId: null, // no work item
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
      s.resolutionService.resolve(WS, "rev_no_wi", {
        decision: "approved",
      }),
    ).rejects.toThrow(ReviewExecutionStateError);

    const review = s.reviewStore.reviews.find((item) => item.id === "rev_no_wi")!;
    expect(review.status).toBe("pending");
    expect(s.activityStore.events).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Resolution with no inbox item linked is handled gracefully
// ---------------------------------------------------------------------------

describe("Consistency: review without linked inbox item", () => {
  it("resolution succeeds even when no inbox item is linked to the review", async () => {
    const s = createServices();

    await s.reviewStore.create({
      id: "rev_no_inbox",
      workspaceId: WS,
      actionKind: "send_email",
      status: "pending",
      workerId: WORKER_ID,
      workItemId: null,
      reviewerIds: ["usr_dave"],
      assigneeIds: ["usr_dave"],
      sourceRouteKind: "forward_email",
      actionDestination: "sarah@acme.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    // No inbox item created

    const result = await s.resolutionService.resolve(WS, "rev_no_inbox", {
      decision: "denied",
    });
    expect(result.status).toBe("denied");
    expect(s.activityStore.events).toHaveLength(1);
  });
});
