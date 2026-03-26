/**
 * T12 Integration Test: First Real Follow-Up Flow
 *
 * Exercises the complete end-to-end path:
 *   Forward email → source event → work item → inbox item → activity event
 *
 * Uses in-memory stores but wires the real service classes together
 * (InboundEmailService, WorkItemService, InboxItemService, ActivityService).
 */
import { describe, expect, it, beforeEach } from "vitest";

import { InboundEmailService, InboundEmailRoutingError } from "./service.js";
import { WorkItemService } from "../../work-items/service.js";
import { InboxItemService } from "../../inbox/service.js";
import { ActivityService } from "../../activity/service.js";
import { ReviewService } from "../../reviews/service.js";

import type {
  InboundEmailPayload,
  InputRouteLookup,
  InputRouteWithWorker,
  SourceEventStore,
  StoredSourceEvent,
  WorkerLookup,
  WorkerSummary,
} from "./types.js";
import type { StoredWorkItem, WorkItemStore } from "../../work-items/types.js";
import type { StoredInboxItem, InboxItemStore } from "../../inbox/types.js";
import type { StoredActivityEvent, ActivityEventStore } from "../../activity/types.js";
import type { StoredReview, ReviewStore } from "../../reviews/types.js";

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

class MemorySourceEventStore implements SourceEventStore {
  readonly events: StoredSourceEvent[] = [];

  async findByExternalMessageId(workspaceId: string, externalMessageId: string) {
    return (
      this.events.find(
        (e) => e.workspaceId === workspaceId && e.externalMessageId === externalMessageId,
      ) ?? null
    );
  }

  async create(input: StoredSourceEvent) {
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

class MemoryWorkerLookup implements WorkerLookup {
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
// Fixtures matching the Hartwell seed data
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_hartwell_test";
const WORKER_ID = "wkr_followup_test";
const DAVE_ID = "usr_dave_test";
const EMMA_ID = "usr_emma_test";

const FORWARDING_ADDRESS = "followup@hartwell.clawback.dev";

function hartwellRoute(): InputRouteWithWorker {
  return {
    id: "rte_email_test",
    workspaceId: WORKSPACE_ID,
    workerId: WORKER_ID,
    kind: "forward_email",
    address: FORWARDING_ADDRESS,
  };
}

function hartwellFollowUpWorker(): WorkerSummary {
  return {
    id: WORKER_ID,
    workspaceId: WORKSPACE_ID,
    slug: "client-follow-up",
    name: "Client Follow-Up",
    kind: "follow_up",
    assigneeIds: [EMMA_ID],
    reviewerIds: [DAVE_ID],
  };
}

function sampleEmailPayload(overrides?: Partial<InboundEmailPayload>): InboundEmailPayload {
  return {
    message_id: `<test-${Date.now()}@mail.example.com>`,
    from: "sarah@acmecorp.com",
    to: FORWARDING_ADDRESS,
    subject: "Re: Q3 Renewal Discussion",
    body_text: "Hi Dave, wanted to follow up on our renewal discussion...",
    body_html: "<p>Hi Dave, wanted to follow up...</p>",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T12: First Real Follow-Up Flow (end-to-end integration)", () => {
  let sourceEventStore: MemorySourceEventStore;
  let inputRouteLookup: MemoryInputRouteLookup;
  let workerLookup: MemoryWorkerLookup;
  let workItemStore: MemoryWorkItemStore;
  let inboxItemStore: MemoryInboxItemStore;
  let activityEventStore: MemoryActivityEventStore;
  let reviewStore: MemoryReviewStore;

  let workItemService: WorkItemService;
  let inboxItemService: InboxItemService;
  let activityService: ActivityService;
  let reviewService: ReviewService;
  let inboundEmailService: InboundEmailService;

  const NOW = new Date("2026-03-18T10:00:00Z");

  beforeEach(() => {
    sourceEventStore = new MemorySourceEventStore();
    inputRouteLookup = new MemoryInputRouteLookup();
    workerLookup = new MemoryWorkerLookup();
    workItemStore = new MemoryWorkItemStore();
    inboxItemStore = new MemoryInboxItemStore();
    activityEventStore = new MemoryActivityEventStore();
    reviewStore = new MemoryReviewStore();

    inputRouteLookup.routes.push(hartwellRoute());
    workerLookup.workers.push(hartwellFollowUpWorker());

    workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
    inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
    activityService = new ActivityService({ store: activityEventStore, now: () => NOW });
    reviewService = new ReviewService({ store: reviewStore, now: () => NOW });

    inboundEmailService = new InboundEmailService({
      sourceEventStore,
      inputRouteLookup,
      workerLookup,
      workItemService,
      inboxItemService,
      reviewService,
      activityService,
      now: () => NOW,
    });
  });

  it("forwarded email creates source event, work item, inbox item, and activity event", async () => {
    const payload = sampleEmailPayload();
    const result = await inboundEmailService.processInboundEmail(payload);

    // --- Result shape ---
    expect(result.deduplicated).toBe(false);
    expect(result.source_event_id).toMatch(/^src_/);
    expect(result.work_item_id).toMatch(/^wi_/);
    expect(result.inbox_item_id).toMatch(/^inb_/);
    expect(result.review_id).toMatch(/^rev_/);
    expect(result.worker_id).toBe(WORKER_ID);
    expect(result.workspace_id).toBe(WORKSPACE_ID);

    // --- 1. Source event ---
    expect(sourceEventStore.events).toHaveLength(1);
    const srcEvt = sourceEventStore.events[0]!;
    expect(srcEvt.kind).toBe("forwarded_email");
    expect(srcEvt.externalMessageId).toBe(payload.message_id);
    expect(srcEvt.fromAddress).toBe("sarah@acmecorp.com");
    expect(srcEvt.toAddress).toBe(FORWARDING_ADDRESS);
    expect(srcEvt.subject).toBe("Re: Q3 Renewal Discussion");
    expect(srcEvt.workerId).toBe(WORKER_ID);
    expect(srcEvt.inputRouteId).toBe("rte_email_test");

    // --- 2. Work item (email_draft, pending_review) ---
    expect(workItemStore.items).toHaveLength(1);
    const wi = workItemStore.items[0]!;
    expect(wi.kind).toBe("email_draft");
    expect(wi.status).toBe("pending_review");
    expect(wi.workerId).toBe(WORKER_ID);
    expect(wi.workspaceId).toBe(WORKSPACE_ID);
    expect(wi.title).toContain("Q3 Renewal Discussion");
    expect(wi.assigneeIds).toEqual([EMMA_ID]);
    expect(wi.reviewerIds).toEqual([DAVE_ID]);
    expect(wi.sourceRouteKind).toBe("forward_email");
    expect(wi.sourceEventId).toBe(result.source_event_id);
    expect(wi.reviewId).toBe(result.review_id);

    // --- 3. Review (send_email, pending) ---
    expect(reviewStore.items).toHaveLength(1);
    const review = reviewStore.items[0]!;
    expect(review.actionKind).toBe("send_email");
    expect(review.status).toBe("pending");
    expect(review.workItemId).toBe(result.work_item_id);
    expect(review.actionDestination).toBe("sarah@acmecorp.com");

    // --- 4. Inbox item (review, open) ---
    expect(inboxItemStore.items).toHaveLength(1);
    const inb = inboxItemStore.items[0]!;
    expect(inb.kind).toBe("review");
    expect(inb.state).toBe("open");
    expect(inb.workerId).toBe(WORKER_ID);
    expect(inb.workItemId).toBe(result.work_item_id);
    expect(inb.reviewId).toBe(result.review_id);
    expect(inb.assigneeIds).toEqual([DAVE_ID]); // Assigned to reviewers
    expect(inb.routeKind).toBe("forward_email");

    // --- 5. Activity event ---
    expect(activityEventStore.events).toHaveLength(1);
    const evt = activityEventStore.events[0]!;
    expect(evt.resultKind).toBe("review_requested");
    expect(evt.workerId).toBe(WORKER_ID);
    expect(evt.workItemId).toBe(result.work_item_id);
    expect(evt.routeKind).toBe("forward_email");
    expect(evt.assigneeIds).toEqual([DAVE_ID]);
    expect(evt.reviewId).toBe(result.review_id);
  });

  it("items are visible via service read methods (simulating workspace APIs)", async () => {
    const payload = sampleEmailPayload();
    await inboundEmailService.processInboundEmail(payload);

    // GET /api/workspace/work equivalent
    const workResult = await workItemService.listByWorkspace(WORKSPACE_ID);
    expect(workResult.work_items).toHaveLength(1);
    expect(workResult.work_items[0]!.kind).toBe("email_draft");
    expect(workResult.work_items[0]!.status).toBe("pending_review");

    // GET /api/workspace/inbox equivalent
    const inboxResult = await inboxItemService.list(WORKSPACE_ID);
    expect(inboxResult.items).toHaveLength(1);
    expect(inboxResult.items[0]!.kind).toBe("review");
    expect(inboxResult.items[0]!.state).toBe("open");
    expect(inboxResult.items[0]!.review_id).toBeTruthy();

    // GET /api/workspace/activity equivalent
    const activityResult = await activityService.list(WORKSPACE_ID);
    expect(activityResult.events).toHaveLength(1);
    expect(activityResult.events[0]!.result_kind).toBe("review_requested");

    // GET /api/workspace/today "for_you" equivalent
    // Dave is the reviewer, so he should see the inbox item
    const openInbox = await inboxItemService.listOpen(WORKSPACE_ID);
    const forDave = openInbox.items.filter((i) => i.assignee_ids.includes(DAVE_ID));
    expect(forDave).toHaveLength(1);
    expect(forDave[0]!.kind).toBe("review");
  });

  it("idempotency: same message_id returns 200 (deduplicated)", async () => {
    const payload = sampleEmailPayload({ message_id: "<idempotent-test@mail.example.com>" });

    const first = await inboundEmailService.processInboundEmail(payload);
    expect(first.deduplicated).toBe(false);

    const second = await inboundEmailService.processInboundEmail(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    // Only one of each was created
    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemStore.items).toHaveLength(1);
    expect(inboxItemStore.items).toHaveLength(1);
    expect(reviewStore.items).toHaveLength(1);
    expect(activityEventStore.events).toHaveLength(1);
  });

  it("unknown address returns routing error (would be 404 from webhook)", async () => {
    const payload = sampleEmailPayload({ to: "nobody@unknown.clawback.dev" });

    await expect(inboundEmailService.processInboundEmail(payload)).rejects.toThrow(
      InboundEmailRoutingError,
    );

    // Nothing was created
    expect(sourceEventStore.events).toHaveLength(0);
    expect(workItemStore.items).toHaveLength(0);
    expect(inboxItemStore.items).toHaveLength(0);
    expect(activityEventStore.events).toHaveLength(0);
  });

  it("multiple distinct emails create separate items", async () => {
    const email1 = sampleEmailPayload({
      message_id: "<msg-001@mail.example.com>",
      subject: "First email",
    });
    const email2 = sampleEmailPayload({
      message_id: "<msg-002@mail.example.com>",
      subject: "Second email",
    });

    await inboundEmailService.processInboundEmail(email1);
    await inboundEmailService.processInboundEmail(email2);

    expect(sourceEventStore.events).toHaveLength(2);
    expect(workItemStore.items).toHaveLength(2);
    expect(inboxItemStore.items).toHaveLength(2);
    expect(reviewStore.items).toHaveLength(2);
    expect(activityEventStore.events).toHaveLength(2);

    // Work items should have different titles
    const titles = workItemStore.items.map((i) => i.title);
    expect(titles.find((t) => t.includes("First email"))).toBeTruthy();
    expect(titles.find((t) => t.includes("Second email"))).toBeTruthy();
  });

  it("work item links back to source event", async () => {
    const payload = sampleEmailPayload();
    const result = await inboundEmailService.processInboundEmail(payload);

    const wi = workItemStore.items[0]!;
    expect(wi.sourceEventId).toBe(result.source_event_id);
    expect(wi.sourceRouteKind).toBe("forward_email");
  });

  it("inbox item links to work item", async () => {
    const payload = sampleEmailPayload();
    const result = await inboundEmailService.processInboundEmail(payload);

    const inb = inboxItemStore.items[0]!;
    expect(inb.workItemId).toBe(result.work_item_id);
    expect(inb.workerId).toBe(WORKER_ID);
  });
});
