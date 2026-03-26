/**
 * T13 Integration Test: Shadow-Mode Follow-Up Flow
 *
 * Exercises the complete end-to-end watched-inbox -> shadow path:
 *   Watched inbox event → source event → shadow work item → shadow inbox item → activity event
 *
 * Uses in-memory stores but wires the real service classes together
 * (WatchedInboxService, WorkItemService, InboxItemService, ActivityService).
 *
 * Key invariants verified:
 * - Inbox item kind is "shadow" (NOT "review")
 * - Work item has review_id: null (shadow, no review)
 * - Source event kind is "watched_inbox"
 * - Work item status is "draft"
 */
import { describe, expect, it, beforeEach } from "vitest";

import { WatchedInboxService, GmailConnectionNotReadyError, WatchedInboxRouteNotFoundError } from "./service.js";
import { WorkItemService } from "../../work-items/service.js";
import { InboxItemService } from "../../inbox/service.js";
import { ActivityService } from "../../activity/service.js";

import type {
  WatchedInboxPayload,
  SourceEventStore,
  StoredSourceEvent,
  WatchedInboxRouteLookup,
  InputRouteForWatchedInbox,
  ConnectionLookup,
  ConnectionForValidation,
  WorkerLookup,
  WorkerSummary,
} from "./types.js";
import type { StoredWorkItem, WorkItemStore } from "../../work-items/types.js";
import type { StoredInboxItem, InboxItemStore } from "../../inbox/types.js";
import type { StoredActivityEvent, ActivityEventStore } from "../../activity/types.js";

// ---------------------------------------------------------------------------
// In-memory stores (same pattern as follow-up-flow.test.ts)
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
// Fixtures matching the Hartwell seed data
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_hartwell_test";
const WORKER_ID = "wkr_followup_test";
const DAVE_ID = "usr_dave_test";
const EMMA_ID = "usr_emma_test";

function hartwellWatchedRoute(): InputRouteForWatchedInbox {
  return {
    id: "rte_watched_test",
    workspaceId: WORKSPACE_ID,
    workerId: WORKER_ID,
    kind: "watched_inbox",
    status: "active",
  };
}

function hartwellGmailConnection(): ConnectionForValidation {
  return {
    id: "conn_gmail_test",
    provider: "gmail",
    accessMode: "read_only",
    status: "connected",
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

function sampleWatchedInboxPayload(overrides?: Partial<WatchedInboxPayload>): WatchedInboxPayload {
  return {
    external_message_id: `<watched-${Date.now()}@gmail.com>`,
    worker_id: WORKER_ID,
    workspace_id: WORKSPACE_ID,
    from: "sarah@acmecorp.com",
    subject: "Re: Q3 Renewal Discussion",
    body_text: "Hi Dave, wanted to follow up on our renewal discussion...",
    body_html: "<p>Hi Dave, wanted to follow up...</p>",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("T13: Shadow-Mode Follow-Up Flow (end-to-end integration)", () => {
  let sourceEventStore: MemorySourceEventStore;
  let watchedInboxRouteLookup: MemoryWatchedInboxRouteLookup;
  let connectionLookup: MemoryConnectionLookup;
  let workerLookup: MemoryWorkerLookup;
  let workItemStore: MemoryWorkItemStore;
  let inboxItemStore: MemoryInboxItemStore;
  let activityEventStore: MemoryActivityEventStore;

  let workItemService: WorkItemService;
  let inboxItemService: InboxItemService;
  let activityService: ActivityService;
  let watchedInboxService: WatchedInboxService;

  const NOW = new Date("2026-03-19T10:00:00Z");

  beforeEach(() => {
    sourceEventStore = new MemorySourceEventStore();
    watchedInboxRouteLookup = new MemoryWatchedInboxRouteLookup();
    connectionLookup = new MemoryConnectionLookup();
    workerLookup = new MemoryWorkerLookup();
    workItemStore = new MemoryWorkItemStore();
    inboxItemStore = new MemoryInboxItemStore();
    activityEventStore = new MemoryActivityEventStore();

    watchedInboxRouteLookup.routes.push(hartwellWatchedRoute());
    connectionLookup.connections.push(hartwellGmailConnection());
    workerLookup.workers.push(hartwellFollowUpWorker());

    workItemService = new WorkItemService({ store: workItemStore, now: () => NOW });
    inboxItemService = new InboxItemService({ store: inboxItemStore, now: () => NOW });
    activityService = new ActivityService({ store: activityEventStore, now: () => NOW });

    watchedInboxService = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup,
      connectionLookup,
      workerLookup,
      workItemService,
      inboxItemService,
      activityService,
      now: () => NOW,
    });
  });

  it("watched inbox event creates source event, shadow work item, shadow inbox item, and activity event", async () => {
    const payload = sampleWatchedInboxPayload();
    const result = await watchedInboxService.processWatchedInboxEvent(payload);

    // --- Result shape ---
    expect(result.deduplicated).toBe(false);
    expect(result.source_event_id).toMatch(/^src_/);
    expect(result.work_item_id).toMatch(/^wi_/);
    expect(result.inbox_item_id).toMatch(/^inb_/);
    expect(result.activity_event_id).toMatch(/^evt_/);
    expect(result.worker_id).toBe(WORKER_ID);
    expect(result.workspace_id).toBe(WORKSPACE_ID);

    // --- 1. Source event (kind: watched_inbox) ---
    expect(sourceEventStore.events).toHaveLength(1);
    const srcEvt = sourceEventStore.events[0]!;
    expect(srcEvt.kind).toBe("watched_inbox");
    expect(srcEvt.externalMessageId).toBe(payload.external_message_id);
    expect(srcEvt.fromAddress).toBe("sarah@acmecorp.com");
    expect(srcEvt.subject).toBe("Re: Q3 Renewal Discussion");
    expect(srcEvt.workerId).toBe(WORKER_ID);
    expect(srcEvt.inputRouteId).toBe("rte_watched_test");

    // --- 2. Work item (email_draft, status: draft, review_id: null) ---
    expect(workItemStore.items).toHaveLength(1);
    const wi = workItemStore.items[0]!;
    expect(wi.kind).toBe("email_draft");
    expect(wi.status).toBe("draft");
    expect(wi.workerId).toBe(WORKER_ID);
    expect(wi.workspaceId).toBe(WORKSPACE_ID);
    expect(wi.title).toContain("Shadow draft");
    expect(wi.assigneeIds).toEqual([EMMA_ID]);
    expect(wi.reviewerIds).toEqual([DAVE_ID]);
    expect(wi.sourceRouteKind).toBe("watched_inbox");
    expect(wi.sourceEventId).toBe(result.source_event_id);
    expect(wi.reviewId).toBeNull(); // Shadow work items have NO review

    // --- 3. Inbox item (kind: "shadow", NOT "review", state: open) ---
    expect(inboxItemStore.items).toHaveLength(1);
    const inb = inboxItemStore.items[0]!;
    expect(inb.kind).toBe("shadow");
    expect(inb.kind).not.toBe("review"); // Explicitly verify NOT review
    expect(inb.state).toBe("open");
    expect(inb.workerId).toBe(WORKER_ID);
    expect(inb.workItemId).toBe(result.work_item_id);
    expect(inb.assigneeIds).toEqual([DAVE_ID]); // Assigned to reviewers
    expect(inb.routeKind).toBe("watched_inbox");
    expect(inb.reviewId).toBeNull(); // Shadow, no review

    // --- 4. Activity event ---
    expect(activityEventStore.events).toHaveLength(1);
    const evt = activityEventStore.events[0]!;
    expect(evt.resultKind).toBe("shadow_draft_created");
    expect(evt.workerId).toBe(WORKER_ID);
    expect(evt.workItemId).toBe(result.work_item_id);
    expect(evt.routeKind).toBe("watched_inbox");
    expect(evt.assigneeIds).toEqual([EMMA_ID]);
  });

  it("shadow items are visible via service read methods (simulating workspace APIs)", async () => {
    const payload = sampleWatchedInboxPayload();
    await watchedInboxService.processWatchedInboxEvent(payload);

    // GET /api/workspace/work equivalent
    const workResult = await workItemService.listByWorkspace(WORKSPACE_ID);
    expect(workResult.work_items).toHaveLength(1);
    expect(workResult.work_items[0]!.kind).toBe("email_draft");
    expect(workResult.work_items[0]!.status).toBe("draft");
    expect(workResult.work_items[0]!.review_id).toBeNull();

    // GET /api/workspace/inbox equivalent
    const inboxResult = await inboxItemService.list(WORKSPACE_ID);
    expect(inboxResult.items).toHaveLength(1);
    expect(inboxResult.items[0]!.kind).toBe("shadow");
    expect(inboxResult.items[0]!.state).toBe("open");

    // GET /api/workspace/activity equivalent
    const activityResult = await activityService.list(WORKSPACE_ID);
    expect(activityResult.events).toHaveLength(1);
    expect(activityResult.events[0]!.result_kind).toBe("shadow_draft_created");

    // Dave should see shadow inbox item in "for you"
    const openInbox = await inboxItemService.listOpen(WORKSPACE_ID);
    const forDave = openInbox.items.filter((i) => i.assignee_ids.includes(DAVE_ID));
    expect(forDave).toHaveLength(1);
    expect(forDave[0]!.kind).toBe("shadow");
  });

  it("idempotency: same external_message_id returns deduplicated result", async () => {
    const payload = sampleWatchedInboxPayload({
      external_message_id: "<idempotent-test@gmail.com>",
    });

    const first = await watchedInboxService.processWatchedInboxEvent(payload);
    expect(first.deduplicated).toBe(false);

    const second = await watchedInboxService.processWatchedInboxEvent(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemStore.items).toHaveLength(1);
    expect(inboxItemStore.items).toHaveLength(1);
    expect(activityEventStore.events).toHaveLength(1);
  });

  it("rejects event when Gmail connection is not connected", async () => {
    connectionLookup.connections.length = 0;
    connectionLookup.connections.push({
      ...hartwellGmailConnection(),
      status: "not_connected",
    });

    const payload = sampleWatchedInboxPayload();
    await expect(watchedInboxService.processWatchedInboxEvent(payload)).rejects.toThrow(
      GmailConnectionNotReadyError,
    );

    expect(sourceEventStore.events).toHaveLength(0);
    expect(workItemStore.items).toHaveLength(0);
  });

  it("rejects event when watched_inbox route is not active", async () => {
    watchedInboxRouteLookup.routes.length = 0;
    watchedInboxRouteLookup.routes.push({
      ...hartwellWatchedRoute(),
      status: "inactive",
    });

    const payload = sampleWatchedInboxPayload();
    await expect(watchedInboxService.processWatchedInboxEvent(payload)).rejects.toThrow(
      WatchedInboxRouteNotFoundError,
    );

    expect(sourceEventStore.events).toHaveLength(0);
    expect(workItemStore.items).toHaveLength(0);
  });

  it("multiple distinct watched events create separate shadow items", async () => {
    const event1 = sampleWatchedInboxPayload({
      external_message_id: "<msg-001@gmail.com>",
      subject: "First watched email",
    });
    const event2 = sampleWatchedInboxPayload({
      external_message_id: "<msg-002@gmail.com>",
      subject: "Second watched email",
    });

    await watchedInboxService.processWatchedInboxEvent(event1);
    await watchedInboxService.processWatchedInboxEvent(event2);

    expect(sourceEventStore.events).toHaveLength(2);
    expect(workItemStore.items).toHaveLength(2);
    expect(inboxItemStore.items).toHaveLength(2);
    expect(activityEventStore.events).toHaveLength(2);

    // All inbox items should be shadow, not review
    for (const item of inboxItemStore.items) {
      expect(item.kind).toBe("shadow");
    }

    // All work items should have null reviewId
    for (const item of workItemStore.items) {
      expect(item.reviewId).toBeNull();
    }
  });

  it("work item links back to source event", async () => {
    const payload = sampleWatchedInboxPayload();
    const result = await watchedInboxService.processWatchedInboxEvent(payload);

    const wi = workItemStore.items[0]!;
    expect(wi.sourceEventId).toBe(result.source_event_id);
    expect(wi.sourceRouteKind).toBe("watched_inbox");
  });
});
