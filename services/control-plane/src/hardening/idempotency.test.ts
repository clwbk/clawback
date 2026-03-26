import { beforeEach, describe, expect, it } from "vitest";

import {
  InboundEmailService,
} from "../integrations/inbound-email/service.js";
import type {
  InboundEmailPayload,
  InputRouteLookup,
  InputRouteWithWorker,
  SourceEventStore,
  StoredSourceEvent,
  WorkerLookup,
  WorkerSummary,
} from "../integrations/inbound-email/types.js";

import {
  WatchedInboxService,
} from "../integrations/watched-inbox/service.js";
import type {
  WatchedInboxPayload,
  WatchedInboxRouteLookup,
  InputRouteForWatchedInbox,
  ConnectionLookup,
  ConnectionForValidation,
} from "../integrations/watched-inbox/types.js";

import { ReviewResolutionService } from "../reviews/resolution-service.js";
import { ReviewService } from "../reviews/service.js";
import type { StoredReview, ReviewStore } from "../reviews/types.js";
import { createReviewedSendDeps } from "../reviews/test-reviewed-send.js";

import { WorkItemService } from "../work-items/service.js";
import type { StoredWorkItem, WorkItemStore } from "../work-items/types.js";

import { InboxItemService } from "../inbox/service.js";
import type { StoredInboxItem, InboxItemStore } from "../inbox/types.js";

import { ActivityService } from "../activity/service.js";
import type { StoredActivityEvent, ActivityEventStore } from "../activity/types.js";

import { ConnectionService } from "../connections/service.js";
import type { StoredConnection, ConnectionStore } from "../connections/types.js";

// ---------------------------------------------------------------------------
// In-memory stores (reusable test doubles)
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
    return this.workers.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }
}

class MemoryWatchedInboxRouteLookup implements WatchedInboxRouteLookup {
  readonly routes: InputRouteForWatchedInbox[] = [];
  async findWatchedInboxRoute(workspaceId: string, workerId: string) {
    return (
      this.routes.find(
        (r) => r.workspaceId === workspaceId && r.workerId === workerId,
      ) ?? null
    );
  }
}

class MemoryConnectionLookup implements ConnectionLookup {
  connection: ConnectionForValidation | null = null;
  async findGmailReadOnly(_workspaceId: string) {
    return this.connection;
  }
}

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

class MemoryConnectionStore implements ConnectionStore {
  items: StoredConnection[] = [];

  async listAll() {
    return [...this.items];
  }
  async listByWorkspace(workspaceId: string) {
    return this.items.filter((c) => c.workspaceId === workspaceId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((c) => c.workspaceId === workspaceId && c.id === id) ?? null;
  }
  async create(input: StoredConnection) {
    this.items.push({ ...input });
    return { ...input };
  }
  async update(id: string, input: Partial<StoredConnection>) {
    const item = this.items.find((c) => c.id === id);
    if (!item) throw new Error("not found");
    Object.assign(item, input);
    return { ...item };
  }
  async remove(id: string) {
    this.items = this.items.filter((c) => c.id !== id);
  }
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const WS = "ws_test";
const WORKER_ID = "wkr_followup";
const NOW = new Date("2026-03-18T10:00:00Z");

function makeEmailPayload(overrides?: Partial<InboundEmailPayload>): InboundEmailPayload {
  return {
    message_id: "<msg-001@example.com>",
    from: "sarah@acme.com",
    to: "followup@inbound.clawback.dev",
    subject: "Re: Q3 renewal",
    body_text: "Hi, following up on renewal...",
    ...overrides,
  };
}

function makeWatchedInboxPayload(overrides?: Partial<WatchedInboxPayload>): WatchedInboxPayload {
  return {
    external_message_id: "gmail-hist-001",
    worker_id: WORKER_ID,
    workspace_id: WS,
    from: "sarah@acme.com",
    subject: "Re: Q3 renewal",
    body_text: "Hi, following up...",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Inbound email idempotency
// ---------------------------------------------------------------------------

describe("Idempotency: inbound email forwarding", () => {
  let sourceEventStore: MemorySourceEventStore;
  let service: InboundEmailService;
  let workItemCounter: number;
  let inboxItemCounter: number;
  let reviewCounter: number;
  let activityCounter: number;

  beforeEach(() => {
    sourceEventStore = new MemorySourceEventStore();
    const inputRouteLookup = new MemoryInputRouteLookup();
    const workerLookup = new MemoryWorkerLookup();

    inputRouteLookup.routes.push({
      id: "rte_fwd",
      workspaceId: WS,
      workerId: WORKER_ID,
      kind: "forward_email",
      address: "followup@inbound.clawback.dev",
    });
    workerLookup.workers.push({
      id: WORKER_ID,
      workspaceId: WS,
      slug: "follow-up",
      name: "Follow-Up",
      kind: "follow_up",
      assigneeIds: ["usr_dave"],
      reviewerIds: ["usr_dave"],
    });

    workItemCounter = 0;
    inboxItemCounter = 0;
    reviewCounter = 0;
    activityCounter = 0;

    service = new InboundEmailService({
      sourceEventStore,
      inputRouteLookup,
      workerLookup,
      workItemService: {
        create: async (_ws, input) => {
          workItemCounter++;
          return { id: `wi_${workItemCounter}` };
        },
        update: async () => ({ id: "wi_1" }),
      },
      inboxItemService: {
        create: async () => {
          inboxItemCounter++;
          return { id: `inb_${inboxItemCounter}` };
        },
      },
      reviewService: {
        create: async () => {
          reviewCounter++;
          return { id: `rev_${reviewCounter}` };
        },
      },
      activityService: {
        append: async () => {
          activityCounter++;
          return { id: `evt_${activityCounter}` };
        },
      },
      now: () => NOW,
    });
  });

  it("forward same email twice → only one source event, one work item, one inbox item", async () => {
    const payload = makeEmailPayload();

    const first = await service.processInboundEmail(payload);
    expect(first.deduplicated).toBe(false);
    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemCounter).toBe(1);
    expect(inboxItemCounter).toBe(1);
    expect(reviewCounter).toBe(1);
    expect(activityCounter).toBe(1);

    const second = await service.processInboundEmail(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    // Counts should NOT have increased
    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemCounter).toBe(1);
    expect(inboxItemCounter).toBe(1);
    expect(reviewCounter).toBe(1);
    expect(activityCounter).toBe(1);
  });

  it("different message_id produces separate source events", async () => {
    await service.processInboundEmail(makeEmailPayload({ message_id: "<msg-A@x.com>" }));
    await service.processInboundEmail(makeEmailPayload({ message_id: "<msg-B@x.com>" }));

    expect(sourceEventStore.events).toHaveLength(2);
    expect(workItemCounter).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Review resolution idempotency
// ---------------------------------------------------------------------------

describe("Idempotency: review resolution", () => {
  let reviewStore: MemoryReviewStore;
  let workItemStore: MemoryWorkItemStore;
  let inboxItemStore: MemoryInboxItemStore;
  let activityStore: MemoryActivityEventStore;
  let resolutionService: ReviewResolutionService;

  beforeEach(async () => {
    reviewStore = new MemoryReviewStore();
    workItemStore = new MemoryWorkItemStore();
    inboxItemStore = new MemoryInboxItemStore();
    activityStore = new MemoryActivityEventStore();

    const reviewService = new ReviewService({ store: reviewStore, now: () => NOW });
    const workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
    const inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
    const activityService = new ActivityService({ store: activityStore, now: () => NOW });

    resolutionService = new ReviewResolutionService({
      reviewService,
      workItemService,
      inboxItemService,
      activityService,
      ...createReviewedSendDeps(WORKER_ID),
    });

    // Seed a pending review with linked work item and inbox item
    await reviewStore.create({
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

    await workItemStore.create({
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

    await inboxItemStore.create({
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
  });

  it("resolve same review twice → same result, no duplicate activity events", async () => {
    const first = await resolutionService.resolve(WS, "rev_01", {
      decision: "approved",
      rationale: "Looks good",
    });
    expect(first.status).toBe("completed");
    expect(activityStore.events).toHaveLength(2);
    expect(activityStore.events.some((event) => event.resultKind === "review_approved")).toBe(true);
    expect(activityStore.events.some((event) => event.resultKind === "work_item_sent")).toBe(true);

    // Second resolution attempt — should be idempotent
    const second = await resolutionService.resolve(WS, "rev_01", {
      decision: "denied", // try different decision
      rationale: "Changed my mind",
    });
    expect(second.status).toBe("completed"); // keeps completed state
    expect(activityStore.events).toHaveLength(2); // no duplicate activity

    // Work item was only updated once
    const workItem = workItemStore.items.find((i) => i.id === "wi_01")!;
    expect(workItem.status).toBe("sent");
    expect(workItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      resume_reason: "review_approved",
    });

    // Inbox item is resolved (not double-resolved)
    const inboxItem = inboxItemStore.items.find((i) => i.id === "inb_01")!;
    expect(inboxItem.state).toBe("resolved");
    expect(inboxItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      resume_reason: "review_approved",
    });
  });

  it("deny resolution is also idempotent", async () => {
    const first = await resolutionService.resolve(WS, "rev_01", { decision: "denied" });
    expect(first.status).toBe("denied");

    const second = await resolutionService.resolve(WS, "rev_01", { decision: "approved" });
    expect(second.status).toBe("denied"); // keeps first decision

    expect(activityStore.events).toHaveLength(1);
    expect(activityStore.events[0]!.resultKind).toBe("review_denied");
    const workItem = workItemStore.items.find((i) => i.id === "wi_01")!;
    expect(workItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "completed",
      current_step: "record_outcome",
      resume_reason: "review_denied",
    });
  });
});

// ---------------------------------------------------------------------------
// Watched inbox deduplication
// ---------------------------------------------------------------------------

describe("Idempotency: watched inbox same message_id", () => {
  let sourceEventStore: MemorySourceEventStore;
  let service: WatchedInboxService;
  let workItemCounter: number;
  let inboxItemCounter: number;
  let activityCounter: number;

  beforeEach(() => {
    sourceEventStore = new MemorySourceEventStore();
    const watchedInboxRouteLookup = new MemoryWatchedInboxRouteLookup();
    const connectionLookup = new MemoryConnectionLookup();
    const workerLookup = new MemoryWorkerLookup();

    workerLookup.workers.push({
      id: WORKER_ID,
      workspaceId: WS,
      slug: "follow-up",
      name: "Follow-Up",
      kind: "follow_up",
      assigneeIds: ["usr_dave"],
      reviewerIds: ["usr_dave"],
    });

    watchedInboxRouteLookup.routes.push({
      id: "rte_watch",
      workspaceId: WS,
      workerId: WORKER_ID,
      kind: "watched_inbox",
      status: "active",
    });

    connectionLookup.connection = {
      id: "conn_gmail",
      provider: "gmail",
      accessMode: "read_only",
      status: "connected",
    };

    workItemCounter = 0;
    inboxItemCounter = 0;
    activityCounter = 0;

    service = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup,
      connectionLookup,
      workerLookup,
      workItemService: {
        create: async () => {
          workItemCounter++;
          return { id: `wi_${workItemCounter}` };
        },
      },
      inboxItemService: {
        create: async () => {
          inboxItemCounter++;
          return { id: `inb_${inboxItemCounter}` };
        },
      },
      activityService: {
        append: async () => {
          activityCounter++;
          return { id: `evt_${activityCounter}` };
        },
      },
      now: () => NOW,
    });
  });

  it("watched inbox same message_id twice → deduplicated", async () => {
    const payload = makeWatchedInboxPayload();

    const first = await service.processWatchedInboxEvent(payload);
    expect(first.deduplicated).toBe(false);
    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemCounter).toBe(1);
    expect(inboxItemCounter).toBe(1);
    expect(activityCounter).toBe(1);

    const second = await service.processWatchedInboxEvent(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    // No extra work items or inbox items
    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemCounter).toBe(1);
    expect(inboxItemCounter).toBe(1);
    expect(activityCounter).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Connection connect/disconnect idempotency
// ---------------------------------------------------------------------------

describe("Idempotency: connection connect/disconnect", () => {
  let connectionStore: MemoryConnectionStore;
  let connectionService: ConnectionService;

  beforeEach(async () => {
    connectionStore = new MemoryConnectionStore();
    connectionService = new ConnectionService({ store: connectionStore, now: () => NOW });

    await connectionStore.create({
      id: "conn_01",
      workspaceId: WS,
      provider: "gmail",
      accessMode: "read_only",
      status: "not_connected",
      label: "Gmail (read-only)",
      capabilities: ["read_threads"],
      attachedWorkerIds: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it("connect twice → second call is idempotent", async () => {
    await connectionService.update(WS, "conn_01", { status: "connected" });
    const conn = await connectionService.getById(WS, "conn_01");
    expect(conn.status).toBe("connected");

    // Connect again — should still be connected without error
    await connectionService.update(WS, "conn_01", { status: "connected" });
    const conn2 = await connectionService.getById(WS, "conn_01");
    expect(conn2.status).toBe("connected");
  });

  it("disconnect twice → second call is idempotent", async () => {
    // First connect
    await connectionService.update(WS, "conn_01", { status: "connected" });
    // First disconnect
    await connectionService.update(WS, "conn_01", { status: "not_connected" });
    const conn = await connectionService.getById(WS, "conn_01");
    expect(conn.status).toBe("not_connected");

    // Second disconnect — should still be not_connected without error
    await connectionService.update(WS, "conn_01", { status: "not_connected" });
    const conn2 = await connectionService.getById(WS, "conn_01");
    expect(conn2.status).toBe("not_connected");
  });

  it("connect → disconnect → connect cycle works correctly", async () => {
    await connectionService.update(WS, "conn_01", { status: "connected" });
    expect((await connectionService.getById(WS, "conn_01")).status).toBe("connected");

    await connectionService.update(WS, "conn_01", { status: "not_connected" });
    expect((await connectionService.getById(WS, "conn_01")).status).toBe("not_connected");

    await connectionService.update(WS, "conn_01", { status: "connected" });
    expect((await connectionService.getById(WS, "conn_01")).status).toBe("connected");
  });
});
