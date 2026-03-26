/**
 * T17 Full End-to-End Flow Integration Tests
 *
 * Comprehensive verification that all major product flows produce
 * the correct state transitions across all domain objects.
 *
 * Each test is self-contained and sets up its own data.
 *
 * Scenarios:
 * 1. Forwarded email -> review flow (full lifecycle)
 * 2. Watched inbox -> shadow flow
 * 3. Deny flow
 * 4. Idempotency (forwarded email dedup)
 * 5. Multi-worker visibility (Follow-Up + Proposal via same APIs)
 */
import { describe, expect, it, beforeEach } from "vitest";

import { InboundEmailService, InboundEmailRoutingError } from "../integrations/inbound-email/service.js";
import { WatchedInboxService, GmailConnectionNotReadyError } from "../integrations/watched-inbox/service.js";
import { WorkItemService } from "../work-items/service.js";
import { InboxItemService } from "../inbox/service.js";
import { ActivityService } from "../activity/service.js";
import { ReviewService } from "../reviews/service.js";
import { ReviewResolutionService } from "../reviews/resolution-service.js";
import { createReviewedSendDeps } from "../reviews/test-reviewed-send.js";

import type {
  InboundEmailPayload,
  InputRouteLookup,
  InputRouteWithWorker,
  SourceEventStore as EmailSourceEventStore,
  StoredSourceEvent as EmailStoredSourceEvent,
  WorkerLookup as EmailWorkerLookup,
  WorkerSummary as EmailWorkerSummary,
} from "../integrations/inbound-email/types.js";

import type {
  WatchedInboxPayload,
  SourceEventStore as WatchedSourceEventStore,
  StoredSourceEvent as WatchedStoredSourceEvent,
  WatchedInboxRouteLookup,
  InputRouteForWatchedInbox,
  ConnectionLookup,
  ConnectionForValidation,
  WorkerLookup as WatchedWorkerLookup,
  WorkerSummary as WatchedWorkerSummary,
} from "../integrations/watched-inbox/types.js";

import type { StoredWorkItem, WorkItemStore } from "../work-items/types.js";
import type { StoredInboxItem, InboxItemStore } from "../inbox/types.js";
import type { StoredActivityEvent, ActivityEventStore } from "../activity/types.js";
import type { StoredReview, ReviewStore } from "../reviews/types.js";

// ---------------------------------------------------------------------------
// Shared in-memory stores
// ---------------------------------------------------------------------------

type AnySourceEvent = EmailStoredSourceEvent & WatchedStoredSourceEvent;

class MemorySourceEventStore implements EmailSourceEventStore, WatchedSourceEventStore {
  readonly events: AnySourceEvent[] = [];

  async findByExternalMessageId(workspaceId: string, externalMessageId: string) {
    return (
      this.events.find(
        (e) => e.workspaceId === workspaceId && e.externalMessageId === externalMessageId,
      ) ?? null
    );
  }

  async create(input: AnySourceEvent) {
    this.events.push(input);
    return input;
  }
}

class MemoryInputRouteLookup implements InputRouteLookup {
  readonly routes: InputRouteWithWorker[] = [];

  async findByAddress(address: string) {
    return this.routes.find((r) => r.address === address) ?? null;
  }
}

class MemoryWatchedInboxRouteLookup implements WatchedInboxRouteLookup {
  readonly routes: InputRouteForWatchedInbox[] = [];

  async findWatchedInboxRoute(workspaceId: string, workerId: string) {
    return (
      this.routes.find(
        (r) => r.workspaceId === workspaceId && r.workerId === workerId && r.kind === "watched_inbox",
      ) ?? null
    );
  }
}

class MemoryConnectionLookup implements ConnectionLookup {
  connections: ConnectionForValidation[] = [];

  async findGmailReadOnly(_workspaceId: string) {
    return (
      this.connections.find(
        (c) => c.provider === "gmail" && c.accessMode === "read_only",
      ) ?? null
    );
  }
}

type WorkerSummary = EmailWorkerSummary & WatchedWorkerSummary;

class MemoryWorkerLookup implements EmailWorkerLookup, WatchedWorkerLookup {
  readonly workers: WorkerSummary[] = [];

  async findById(workspaceId: string, id: string) {
    return (
      this.workers.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null
    );
  }
}

class MemoryWorkItemStore implements WorkItemStore {
  items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items
      .filter((i) => i.workspaceId === workspaceId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async listByWorker(workerId: string) {
    return this.items
      .filter((i) => i.workerId === workerId)
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }

  async create(input: StoredWorkItem) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredWorkItem>) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

class MemoryInboxItemStore implements InboxItemStore {
  items: StoredInboxItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items
      .filter((i) => i.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  async listOpen(workspaceId: string) {
    return this.items
      .filter((i) => i.workspaceId === workspaceId && i.state === "open")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
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

  async listByWorkspace(workspaceId: string, limit = 50) {
    return this.events
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  async create(input: StoredActivityEvent) {
    this.events.push({ ...input });
    return { ...input };
  }

  async findByReviewResult(workspaceId: string, reviewId: string, resultKind: string) {
    return this.events.find(
      (event) =>
        event.workspaceId === workspaceId
        && event.reviewId === reviewId
        && event.resultKind === resultKind,
    ) ?? null;
  }
}

class MemoryReviewStore implements ReviewStore {
  items: StoredReview[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId);
  }

  async listPending(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId && i.status === "pending");
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }

  async create(input: StoredReview) {
    this.items.push({ ...input });
    return { ...input };
  }

  async update(id: string, input: Partial<StoredReview>) {
    const item = this.items.find((i) => i.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }

  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_e2e_test";
const FOLLOWUP_WORKER_ID = "wkr_followup_e2e";
const PROPOSAL_WORKER_ID = "wkr_proposal_e2e";
const DAVE_ID = "usr_dave_e2e";
const EMMA_ID = "usr_emma_e2e";
const FORWARDING_ADDRESS = "followup@hartwell.clawback.dev";

const NOW = new Date("2026-03-19T10:00:00Z");

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function followUpWorker(): WorkerSummary {
  return {
    id: FOLLOWUP_WORKER_ID,
    workspaceId: WORKSPACE_ID,
    slug: "client-follow-up",
    name: "Client Follow-Up",
    kind: "follow_up",
    assigneeIds: [EMMA_ID],
    reviewerIds: [DAVE_ID],
  };
}

function proposalWorker(): WorkerSummary {
  return {
    id: PROPOSAL_WORKER_ID,
    workspaceId: WORKSPACE_ID,
    slug: "proposal",
    name: "Proposal",
    kind: "proposal",
    assigneeIds: [DAVE_ID, EMMA_ID],
    reviewerIds: [DAVE_ID],
  };
}

function forwardEmailRoute(): InputRouteWithWorker {
  return {
    id: "rte_email_e2e",
    workspaceId: WORKSPACE_ID,
    workerId: FOLLOWUP_WORKER_ID,
    kind: "forward_email",
    address: FORWARDING_ADDRESS,
  };
}

function watchedInboxRoute(): InputRouteForWatchedInbox {
  return {
    id: "rte_watched_e2e",
    workspaceId: WORKSPACE_ID,
    workerId: FOLLOWUP_WORKER_ID,
    kind: "watched_inbox",
    status: "active",
  };
}

function gmailConnection(): ConnectionForValidation {
  return {
    id: "conn_gmail_e2e",
    provider: "gmail",
    accessMode: "read_only",
    status: "connected",
  };
}

function emailPayload(overrides?: Partial<InboundEmailPayload>): InboundEmailPayload {
  return {
    message_id: `<e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@mail.example.com>`,
    from: "sarah@acmecorp.com",
    to: FORWARDING_ADDRESS,
    subject: "Re: Q3 Renewal Discussion",
    body_text: "Hi Dave, wanted to follow up on our renewal discussion...",
    body_html: "<p>Hi Dave, wanted to follow up...</p>",
    ...overrides,
  };
}

function watchedPayload(overrides?: Partial<WatchedInboxPayload>): WatchedInboxPayload {
  return {
    external_message_id: `<watched-${Date.now()}-${Math.random().toString(36).slice(2)}@gmail.com>`,
    worker_id: FOLLOWUP_WORKER_ID,
    workspace_id: WORKSPACE_ID,
    from: "sarah@acmecorp.com",
    subject: "Re: Q3 Renewal Discussion",
    body_text: "Hi Dave, wanted to follow up on our renewal discussion...",
    body_html: "<p>Hi Dave, wanted to follow up...</p>",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

type TestContext = {
  sourceEventStore: MemorySourceEventStore;
  inputRouteLookup: MemoryInputRouteLookup;
  watchedInboxRouteLookup: MemoryWatchedInboxRouteLookup;
  connectionLookup: MemoryConnectionLookup;
  workerLookup: MemoryWorkerLookup;
  workItemStore: MemoryWorkItemStore;
  inboxItemStore: MemoryInboxItemStore;
  activityEventStore: MemoryActivityEventStore;
  reviewStore: MemoryReviewStore;

  workItemService: WorkItemService;
  inboxItemService: InboxItemService;
  activityService: ActivityService;
  reviewService: ReviewService;
  reviewResolutionService: ReviewResolutionService;
  inboundEmailService: InboundEmailService;
  watchedInboxService: WatchedInboxService;
};

function createTestContext(): TestContext {
  const sourceEventStore = new MemorySourceEventStore();
  const inputRouteLookup = new MemoryInputRouteLookup();
  const watchedInboxRouteLookup = new MemoryWatchedInboxRouteLookup();
  const connectionLookup = new MemoryConnectionLookup();
  const workerLookup = new MemoryWorkerLookup();
  const workItemStore = new MemoryWorkItemStore();
  const inboxItemStore = new MemoryInboxItemStore();
  const activityEventStore = new MemoryActivityEventStore();
  const reviewStore = new MemoryReviewStore();

  // Seed the lookups
  inputRouteLookup.routes.push(forwardEmailRoute());
  watchedInboxRouteLookup.routes.push(watchedInboxRoute());
  connectionLookup.connections.push(gmailConnection());
  workerLookup.workers.push(followUpWorker());
  workerLookup.workers.push(proposalWorker());

  const workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
  const inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
  const activityService = new ActivityService({ store: activityEventStore, now: () => NOW });
  const reviewService = new ReviewService({ store: reviewStore, now: () => NOW });

  const reviewResolutionService = new ReviewResolutionService({
    reviewService,
    workItemService,
    inboxItemService,
    activityService,
    ...createReviewedSendDeps(FOLLOWUP_WORKER_ID),
  });

  const inboundEmailService = new InboundEmailService({
    sourceEventStore,
    inputRouteLookup,
    workerLookup,
    workItemService,
    inboxItemService,
    reviewService,
    activityService,
    now: () => NOW,
  });

  const watchedInboxService = new WatchedInboxService({
    sourceEventStore,
    watchedInboxRouteLookup,
    connectionLookup,
    workerLookup,
    workItemService,
    inboxItemService,
    activityService,
    now: () => NOW,
  });

  return {
    sourceEventStore,
    inputRouteLookup,
    watchedInboxRouteLookup,
    connectionLookup,
    workerLookup,
    workItemStore,
    inboxItemStore,
    activityEventStore,
    reviewStore,
    workItemService,
    inboxItemService,
    activityService,
    reviewService,
    reviewResolutionService,
    inboundEmailService,
    watchedInboxService,
  };
}

// ===========================================================================
// SCENARIO 1: Forwarded email -> full review lifecycle
// ===========================================================================

describe("T17 Scenario 1: Forwarded email -> review -> approve", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("complete lifecycle: forward -> pending_review -> approve -> sent + resolved + activity", async () => {
    // Step 1: Forward email
    const payload = emailPayload();
    const result = await ctx.inboundEmailService.processInboundEmail(payload);

    expect(result.deduplicated).toBe(false);
    expect(result.worker_id).toBe(FOLLOWUP_WORKER_ID);
    expect(result.workspace_id).toBe(WORKSPACE_ID);

    // Verify state after forward:
    // - source event created
    expect(ctx.sourceEventStore.events).toHaveLength(1);
    expect(ctx.sourceEventStore.events[0]!.kind).toBe("forwarded_email");

    // - work item: pending_review
    const workBefore = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(workBefore.work_items).toHaveLength(1);
    expect(workBefore.work_items[0]!.status).toBe("pending_review");
    expect(workBefore.work_items[0]!.review_id).toBe(result.review_id);
    expect(workBefore.work_items[0]!.draft_to).toBe("sarah@acmecorp.com");
    expect(workBefore.work_items[0]!.execution_status).toBe("not_requested");

    // - inbox item: open, kind: review
    const inboxBefore = await ctx.inboxItemService.list(WORKSPACE_ID);
    expect(inboxBefore.items).toHaveLength(1);
    expect(inboxBefore.items[0]!.kind).toBe("review");
    expect(inboxBefore.items[0]!.state).toBe("open");
    expect(inboxBefore.items[0]!.review_id).toBe(result.review_id);

    // - review: pending
    const reviewBefore = await ctx.reviewService.getById(WORKSPACE_ID, result.review_id);
    expect(reviewBefore.status).toBe("pending");

    // - activity: review_requested
    const activityBefore = await ctx.activityService.list(WORKSPACE_ID);
    expect(activityBefore.events).toHaveLength(1);
    expect(activityBefore.events[0]!.result_kind).toBe("review_requested");

    // Step 2: Approve the review
    const resolvedReview = await ctx.reviewResolutionService.resolve(
      WORKSPACE_ID,
      result.review_id,
      { decision: "approved", rationale: "Looks good" },
    );

    expect(resolvedReview.status).toBe("completed");
    expect(resolvedReview.resolved_at).not.toBeNull();

    // Verify state after approval:
    // - work item: sent
    const workAfter = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(workAfter.work_items).toHaveLength(1);
    expect(workAfter.work_items[0]!.status).toBe("sent");
    expect(workAfter.work_items[0]!.review_id).toBe(result.review_id);
    expect(workAfter.work_items[0]!.execution_status).toBe("completed");

    // - inbox item: resolved
    const inboxAfter = await ctx.inboxItemService.list(WORKSPACE_ID);
    expect(inboxAfter.items).toHaveLength(1);
    expect(inboxAfter.items[0]!.state).toBe("resolved");

    // - activity: review_approved and work_item_sent added
    const activityAfter = await ctx.activityService.list(WORKSPACE_ID);
    expect(activityAfter.events).toHaveLength(3);
    const approvalEvent = activityAfter.events.find((e) => e.result_kind === "review_approved");
    const sentEvent = activityAfter.events.find((e) => e.result_kind === "work_item_sent");
    expect(approvalEvent).toBeTruthy();
    expect(approvalEvent!.review_id).toBe(result.review_id);
    expect(approvalEvent!.work_item_id).toBe(result.work_item_id);
    expect(sentEvent).toBeTruthy();
    expect(sentEvent!.work_item_id).toBe(result.work_item_id);
  });
});

// ===========================================================================
// SCENARIO 2: Watched inbox -> shadow flow
// ===========================================================================

describe("T17 Scenario 2: Watched inbox -> shadow flow", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("watched inbox event produces shadow work item, shadow inbox item, and activity", async () => {
    const payload = watchedPayload();
    const result = await ctx.watchedInboxService.processWatchedInboxEvent(payload);

    expect(result.deduplicated).toBe(false);
    expect(result.worker_id).toBe(FOLLOWUP_WORKER_ID);
    expect(result.workspace_id).toBe(WORKSPACE_ID);

    // Source event (kind: watched_inbox)
    expect(ctx.sourceEventStore.events).toHaveLength(1);
    expect(ctx.sourceEventStore.events[0]!.kind).toBe("watched_inbox");

    // Work item: draft, NO review_id
    const work = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(work.work_items).toHaveLength(1);
    expect(work.work_items[0]!.kind).toBe("email_draft");
    expect(work.work_items[0]!.status).toBe("draft");
    expect(work.work_items[0]!.review_id).toBeNull();

    // Inbox item: shadow (NOT review), open
    const inbox = await ctx.inboxItemService.list(WORKSPACE_ID);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]!.kind).toBe("shadow");
    expect(inbox.items[0]!.state).toBe("open");
    expect(inbox.items[0]!.review_id).toBeNull();

    // Activity: shadow_draft_created
    const activity = await ctx.activityService.list(WORKSPACE_ID);
    expect(activity.events).toHaveLength(1);
    expect(activity.events[0]!.result_kind).toBe("shadow_draft_created");
  });
});

// ===========================================================================
// SCENARIO 3: Deny flow
// ===========================================================================

describe("T17 Scenario 3: Forwarded email -> review -> deny", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("denied review produces correct state: review denied, inbox resolved, activity review_denied", async () => {
    // Step 1: Forward email to create the review
    const payload = emailPayload();
    const result = await ctx.inboundEmailService.processInboundEmail(payload);

    // Confirm initial state
    expect(result.review_id).toBeTruthy();
    const reviewBefore = await ctx.reviewService.getById(WORKSPACE_ID, result.review_id);
    expect(reviewBefore.status).toBe("pending");

    // Step 2: Deny the review
    const resolvedReview = await ctx.reviewResolutionService.resolve(
      WORKSPACE_ID,
      result.review_id,
      { decision: "denied", rationale: "Tone needs revision" },
    );

    expect(resolvedReview.status).toBe("denied");
    expect(resolvedReview.resolved_at).not.toBeNull();

    // - review: denied
    const reviewAfter = await ctx.reviewService.getById(WORKSPACE_ID, result.review_id);
    expect(reviewAfter.status).toBe("denied");

    // - inbox item: resolved (denied reviews also resolve the inbox item)
    const inbox = await ctx.inboxItemService.list(WORKSPACE_ID);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]!.state).toBe("resolved");

    // - work item: remains pending_review (denied does not change to "sent")
    const work = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(work.work_items).toHaveLength(1);
    expect(work.work_items[0]!.status).toBe("pending_review");

    // - activity: review_denied event added
    const activity = await ctx.activityService.list(WORKSPACE_ID);
    expect(activity.events).toHaveLength(2); // review_requested + review_denied
    const denyEvent = activity.events.find((e) => e.result_kind === "review_denied");
    expect(denyEvent).toBeTruthy();
    expect(denyEvent!.review_id).toBe(result.review_id);
    expect(denyEvent!.summary).toBe("Tone needs revision");
  });
});

// ===========================================================================
// SCENARIO 4: Idempotency
// ===========================================================================

describe("T17 Scenario 4: Idempotency — same email forwarded twice", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("same message_id produces only one set of objects", async () => {
    const messageId = "<idempotent-e2e-test@mail.example.com>";
    const payload = emailPayload({ message_id: messageId });

    const first = await ctx.inboundEmailService.processInboundEmail(payload);
    expect(first.deduplicated).toBe(false);

    const second = await ctx.inboundEmailService.processInboundEmail(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    // Exactly one of each
    expect(ctx.sourceEventStore.events).toHaveLength(1);
    expect(ctx.workItemStore.items).toHaveLength(1);
    expect(ctx.inboxItemStore.items).toHaveLength(1);
    expect(ctx.reviewStore.items).toHaveLength(1);
    expect(ctx.activityEventStore.events).toHaveLength(1);
  });

  it("watched inbox idempotency also works", async () => {
    const externalId = "<idempotent-watched-e2e@gmail.com>";
    const payload = watchedPayload({ external_message_id: externalId });

    const first = await ctx.watchedInboxService.processWatchedInboxEvent(payload);
    expect(first.deduplicated).toBe(false);

    const second = await ctx.watchedInboxService.processWatchedInboxEvent(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    expect(ctx.sourceEventStore.events).toHaveLength(1);
    expect(ctx.workItemStore.items).toHaveLength(1);
    expect(ctx.inboxItemStore.items).toHaveLength(1);
    expect(ctx.activityEventStore.events).toHaveLength(1);
  });
});

// ===========================================================================
// SCENARIO 5: Multi-worker visibility
// ===========================================================================

describe("T17 Scenario 5: Multi-worker — Follow-Up + Proposal items via same workspace APIs", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("both workers produce work items visible in the same workspace work list", async () => {
    // Follow-Up worker: create via forwarded email
    const emailResult = await ctx.inboundEmailService.processInboundEmail(emailPayload());
    expect(emailResult.worker_id).toBe(FOLLOWUP_WORKER_ID);

    // Proposal worker: create directly via service (simulates proposal worker pack output)
    const proposalWorkItem = await ctx.workItemService.create(WORKSPACE_ID, {
      workerId: PROPOSAL_WORKER_ID,
      kind: "proposal_draft",
      title: "Proposal: Globex consulting engagement",
      summary: "Initial draft for Globex Corp consulting scope.",
      assigneeIds: [DAVE_ID],
      reviewerIds: [DAVE_ID],
      sourceRouteKind: "chat",
    });

    // Both items visible in workspace work list
    const allWork = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(allWork.work_items).toHaveLength(2);

    const followUpItems = allWork.work_items.filter((wi) => wi.worker_id === FOLLOWUP_WORKER_ID);
    const proposalItems = allWork.work_items.filter((wi) => wi.worker_id === PROPOSAL_WORKER_ID);

    expect(followUpItems).toHaveLength(1);
    expect(followUpItems[0]!.kind).toBe("email_draft");

    expect(proposalItems).toHaveLength(1);
    expect(proposalItems[0]!.kind).toBe("proposal_draft");

    // Both items visible in per-worker list
    const fuWorkerItems = await ctx.workItemService.listByWorker(FOLLOWUP_WORKER_ID);
    expect(fuWorkerItems.work_items).toHaveLength(1);

    const propWorkerItems = await ctx.workItemService.listByWorker(PROPOSAL_WORKER_ID);
    expect(propWorkerItems.work_items).toHaveLength(1);
  });

  it("both workers produce inbox items visible in the same workspace inbox", async () => {
    // Follow-Up: forwarded email creates review inbox item
    await ctx.inboundEmailService.processInboundEmail(emailPayload());

    // Proposal worker: create a shadow inbox item directly (simulates proposal output)
    await ctx.inboxItemService.create(WORKSPACE_ID, {
      kind: "shadow",
      title: "Proposal draft: Globex engagement",
      summary: "The Proposal worker drafted an initial scope.",
      assigneeIds: [DAVE_ID],
      workerId: PROPOSAL_WORKER_ID,
      workItemId: null,
      routeKind: "chat",
    });

    // Both visible in workspace inbox
    const allInbox = await ctx.inboxItemService.list(WORKSPACE_ID);
    expect(allInbox.items).toHaveLength(2);

    const reviewItems = allInbox.items.filter((i) => i.kind === "review");
    const shadowItems = allInbox.items.filter((i) => i.kind === "shadow");

    expect(reviewItems).toHaveLength(1);
    expect(reviewItems[0]!.worker_id).toBe(FOLLOWUP_WORKER_ID);

    expect(shadowItems).toHaveLength(1);
    expect(shadowItems[0]!.worker_id).toBe(PROPOSAL_WORKER_ID);
  });

  it("activity events from both workers appear in the same workspace activity feed", async () => {
    // Follow-Up activity
    await ctx.inboundEmailService.processInboundEmail(emailPayload());

    // Watched inbox activity (also Follow-Up worker)
    await ctx.watchedInboxService.processWatchedInboxEvent(watchedPayload());

    // Proposal worker activity (direct)
    await ctx.activityService.append(WORKSPACE_ID, {
      workerId: PROPOSAL_WORKER_ID,
      routeKind: "chat",
      resultKind: "work_item_created",
      title: "Proposal draft created: Globex engagement",
      assigneeIds: [DAVE_ID],
    });

    const activity = await ctx.activityService.list(WORKSPACE_ID);
    expect(activity.events).toHaveLength(3);

    const workerIds = activity.events.map((e) => e.worker_id);
    expect(workerIds).toContain(FOLLOWUP_WORKER_ID);
    expect(workerIds).toContain(PROPOSAL_WORKER_ID);
  });
});

// ===========================================================================
// SCENARIO 6: Review resolution idempotency
// ===========================================================================

describe("T17 Scenario 6: Review resolution idempotency", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("resolving an already-resolved review is idempotent", async () => {
    const payload = emailPayload();
    const result = await ctx.inboundEmailService.processInboundEmail(payload);

    // Approve
    await ctx.reviewResolutionService.resolve(WORKSPACE_ID, result.review_id, {
      decision: "approved",
    });

    // Approve again — should not throw, should not create duplicate activity
    const secondResolve = await ctx.reviewResolutionService.resolve(
      WORKSPACE_ID,
      result.review_id,
      { decision: "approved" },
    );
    expect(secondResolve.status).toBe("completed");

    // Still only one approval and send activity event (idempotent)
    const activity = await ctx.activityService.list(WORKSPACE_ID);
    const approvalEvents = activity.events.filter((e) => e.result_kind === "review_approved");
    const sentEvents = activity.events.filter((e) => e.result_kind === "work_item_sent");
    expect(approvalEvents).toHaveLength(1);
    expect(sentEvents).toHaveLength(1);
  });
});

// ===========================================================================
// SCENARIO 7: Failure after approval (SMTP send fails)
// ===========================================================================

describe("T17 Scenario 7: Forwarded email -> approve -> SMTP failure", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("approval with a failing sender produces failed work item, inbox stays open, activity records send_failed", async () => {
    // Step 1: Forward email to create work item + review
    const payload = emailPayload();
    const result = await ctx.inboundEmailService.processInboundEmail(payload);

    expect(result.deduplicated).toBe(false);
    expect(result.review_id).toBeTruthy();

    // Step 2: Replace the ReviewResolutionService with one using a failing sender
    const failingResolutionService = new ReviewResolutionService({
      reviewService: ctx.reviewService,
      workItemService: ctx.workItemService,
      inboxItemService: ctx.inboxItemService,
      activityService: ctx.activityService,
      ...createReviewedSendDeps(FOLLOWUP_WORKER_ID, {
        failWith: new Error("SMTP connection timeout"),
      }),
    });

    // Step 3: Approve the review (send will fail)
    const resolvedReview = await failingResolutionService.resolve(
      WORKSPACE_ID,
      result.review_id,
      { decision: "approved", rationale: "Looks good" },
    );

    // Review status should be "approved" (not "completed" since send failed)
    expect(resolvedReview.status).toBe("approved");

    // Work item: status is "failed", execution_status is "failed"
    const work = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(work.work_items).toHaveLength(1);
    expect(work.work_items[0]!.status).toBe("failed");
    expect(work.work_items[0]!.execution_status).toBe("failed");
    expect(work.work_items[0]!.execution_error).toBe("SMTP connection timeout");

    // Inbox item: stays open (send failed, not resolved)
    const inbox = await ctx.inboxItemService.list(WORKSPACE_ID);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]!.state).toBe("open");

    // Activity: should have review_requested, review_approved, and send_failed
    const activity = await ctx.activityService.list(WORKSPACE_ID);
    const sendFailedEvent = activity.events.find((e) => e.result_kind === "send_failed");
    expect(sendFailedEvent).toBeTruthy();
    expect(sendFailedEvent!.summary).toBe("SMTP connection timeout");
    expect(sendFailedEvent!.work_item_id).toBe(result.work_item_id);

    const approvalEvent = activity.events.find((e) => e.result_kind === "review_approved");
    expect(approvalEvent).toBeTruthy();
  });
});

// ===========================================================================
// SCENARIO 8: Retry after failure (swap to working sender)
// ===========================================================================

describe("T17 Scenario 8: Retry after SMTP failure with working sender", () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = createTestContext();
  });

  it("retryApprovedSend with a working sender transitions failed -> sent", async () => {
    // Step 1: Forward email to create work item + review
    const payload = emailPayload();
    const result = await ctx.inboundEmailService.processInboundEmail(payload);

    // Step 2: Approve with a FAILING sender
    const failingResolutionService = new ReviewResolutionService({
      reviewService: ctx.reviewService,
      workItemService: ctx.workItemService,
      inboxItemService: ctx.inboxItemService,
      activityService: ctx.activityService,
      ...createReviewedSendDeps(FOLLOWUP_WORKER_ID, {
        failWith: new Error("SMTP connection timeout"),
      }),
    });

    await failingResolutionService.resolve(
      WORKSPACE_ID,
      result.review_id,
      { decision: "approved", rationale: "Looks good" },
    );

    // Confirm failed state
    const workBefore = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(workBefore.work_items[0]!.status).toBe("failed");
    expect(workBefore.work_items[0]!.execution_status).toBe("failed");

    // Step 3: Retry with a WORKING sender
    const workingResolutionService = new ReviewResolutionService({
      reviewService: ctx.reviewService,
      workItemService: ctx.workItemService,
      inboxItemService: ctx.inboxItemService,
      activityService: ctx.activityService,
      ...createReviewedSendDeps(FOLLOWUP_WORKER_ID),
    });

    const retryResult = await workingResolutionService.retryApprovedSend(
      WORKSPACE_ID,
      result.review_id,
    );

    // Review should now be "completed"
    expect(retryResult.status).toBe("completed");

    // Work item: status is "sent", execution_status is "completed"
    const workAfter = await ctx.workItemService.listByWorkspace(WORKSPACE_ID);
    expect(workAfter.work_items).toHaveLength(1);
    expect(workAfter.work_items[0]!.status).toBe("sent");
    expect(workAfter.work_items[0]!.execution_status).toBe("completed");
    expect(workAfter.work_items[0]!.execution_error).toBeNull();

    // Inbox item: should now be resolved
    const inbox = await ctx.inboxItemService.list(WORKSPACE_ID);
    expect(inbox.items).toHaveLength(1);
    expect(inbox.items[0]!.state).toBe("resolved");

    // Activity: should have work_item_sent event (from retry)
    const activity = await ctx.activityService.list(WORKSPACE_ID);
    const sentEvent = activity.events.find((e) => e.result_kind === "work_item_sent");
    expect(sentEvent).toBeTruthy();
    expect(sentEvent!.work_item_id).toBe(result.work_item_id);
  });
});
