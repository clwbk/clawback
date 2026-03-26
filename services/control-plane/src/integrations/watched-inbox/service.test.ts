import { describe, expect, it, beforeEach } from "vitest";
import type {
  FollowUpExecutionStateRecord,
  SenderResolution,
  WorkerKind,
} from "@clawback/contracts";

import {
  WatchedInboxService,
  WatchedInboxRouteNotFoundError,
  WatchedInboxWorkerNotFoundError,
  GmailConnectionNotReadyError,
} from "./service.js";
import type {
  WatchedInboxPayload,
  SourceEventStore,
  StoredSourceEvent,
  WatchedInboxRouteLookup,
  InputRouteForWatchedInbox,
  ConnectionLookup,
  ConnectionForValidation,
  WorkerLookup,
  RouteTargetLookup,
  WorkerSummary,
} from "./types.js";

// ---------------------------------------------------------------------------
// In-memory fakes
// ---------------------------------------------------------------------------

class FakeSourceEventStore implements SourceEventStore {
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

class FakeWatchedInboxRouteLookup implements WatchedInboxRouteLookup {
  readonly routes: InputRouteForWatchedInbox[] = [];

  async findWatchedInboxRoute(workspaceId: string, workerId: string) {
    return (
      this.routes.find(
        (r) =>
          r.workspaceId === workspaceId &&
          r.workerId === workerId &&
          r.kind === "watched_inbox",
      ) ?? null
    );
  }
}

class FakeConnectionLookup implements ConnectionLookup {
  connections: ConnectionForValidation[] = [];

  async findGmailReadOnly(_workspaceId: string) {
    return (
      this.connections.find(
        (c) => c.provider === "gmail" && c.accessMode === "read_only",
      ) ?? null
    );
  }
}

class FakeWorkerLookup implements WorkerLookup {
  readonly workers: WorkerSummary[] = [];

  async findById(workspaceId: string, id: string) {
    return (
      this.workers.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null
    );
  }
}

type RouteTargetWorker = WorkerSummary & { kind: WorkerKind };

class FakeRouteTargetLookup implements RouteTargetLookup {
  readonly workers: RouteTargetWorker[] = [];

  async listActiveByKind(workspaceId: string, kind: WorkerKind) {
    return this.workers.filter((worker) => worker.workspaceId === workspaceId && worker.kind === kind);
  }
}

type CreatedWorkItem = {
  id: string;
  workspaceId: string;
  workerId: string;
  title: string;
  kind: string;
  sourceRouteKind?: string | null;
  sourceEventId?: string | null;
  triageJson?: unknown;
  executionStateJson?: FollowUpExecutionStateRecord | null;
};
type CreatedInboxItem = {
  id: string;
  workspaceId: string;
  workerId: string | null;
  title: string;
  kind: string;
  routeKind?: string | null;
  triageJson?: unknown;
  executionStateJson?: FollowUpExecutionStateRecord | null;
};
type CreatedActivity = { id: string; workspaceId: string; title: string; resultKind: string };

class FakeWorkItemService {
  readonly items: CreatedWorkItem[] = [];
  private counter = 0;

  async create(
    workspaceId: string,
    input: {
      workerId: string;
      kind: string;
      title: string;
      sourceRouteKind?: string | null;
      sourceEventId?: string | null;
      triageJson?: unknown;
      executionStateJson?: FollowUpExecutionStateRecord | null;
    },
  ) {
    this.counter += 1;
    const item = { id: `wi_test_${this.counter}`, workspaceId, ...input };
    this.items.push(item);
    return item;
  }
}

class FakeInboxItemService {
  readonly items: CreatedInboxItem[] = [];
  private counter = 0;

  async create(
    workspaceId: string,
    input: {
      kind: string;
      title: string;
      workerId?: string | null;
      routeKind?: string | null;
      triageJson?: unknown;
      executionStateJson?: FollowUpExecutionStateRecord | null;
    },
  ) {
    this.counter += 1;
    const item = { id: `inb_test_${this.counter}`, workspaceId, workerId: input.workerId ?? null, ...input };
    this.items.push(item);
    return item;
  }
}

class FakeActivityService {
  readonly events: CreatedActivity[] = [];
  private counter = 0;

  async append(workspaceId: string, input: { resultKind: string; title: string }) {
    this.counter += 1;
    const event = { id: `evt_test_${this.counter}`, workspaceId, ...input };
    this.events.push(event);
    return event;
  }
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const WORKSPACE_ID = "ws_test_01";
const WORKER_ID = "wkr_followup_test";
const ROUTE_ID = "rte_watched_test";
const CONNECTION_ID = "conn_gmail_test";

function createTestRoute(): InputRouteForWatchedInbox {
  return {
    id: ROUTE_ID,
    workspaceId: WORKSPACE_ID,
    workerId: WORKER_ID,
    kind: "watched_inbox",
    status: "active",
  };
}

function createTestConnection(): ConnectionForValidation {
  return {
    id: CONNECTION_ID,
    provider: "gmail",
    accessMode: "read_only",
    status: "connected",
  };
}

function createTestWorker(): WorkerSummary {
  return {
    id: WORKER_ID,
    workspaceId: WORKSPACE_ID,
    slug: "client-follow-up",
    name: "Client Follow-Up",
    kind: "follow_up",
    assigneeIds: ["usr_emma"],
    reviewerIds: ["usr_dave"],
  };
}

function createRouteTargetWorker(kind: WorkerKind, overrides: Partial<RouteTargetWorker> = {}): RouteTargetWorker {
  return {
    id: `wkr_${kind}_test`,
    workspaceId: WORKSPACE_ID,
    slug: `${kind}-worker`,
    name: kind === "bugfix" ? "Bugfix" : kind === "incident" ? "Incident" : "Proposal",
    assigneeIds: ["usr_target"],
    reviewerIds: ["usr_target_reviewer"],
    kind,
    ...overrides,
  };
}

function resolvedSender(
  relationship: SenderResolution["relationship_class"],
): SenderResolution {
  return {
    contact_id: "cot_test_01",
    account_id: "acc_test_01",
    relationship_class: relationship,
    owner_user_id: "usr_owner_01",
    handling_note: null,
    do_not_auto_reply: false,
    resolution_method: "exact_contact",
  };
}

function createTestPayload(overrides?: Partial<WatchedInboxPayload>): WatchedInboxPayload {
  return {
    external_message_id: "<watched-msg-001@gmail.com>",
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

describe("WatchedInboxService", () => {
  let sourceEventStore: FakeSourceEventStore;
  let watchedInboxRouteLookup: FakeWatchedInboxRouteLookup;
  let connectionLookup: FakeConnectionLookup;
  let workerLookup: FakeWorkerLookup;
  let workItemService: FakeWorkItemService;
  let inboxItemService: FakeInboxItemService;
  let activityService: FakeActivityService;
  let service: WatchedInboxService;

  beforeEach(() => {
    sourceEventStore = new FakeSourceEventStore();
    watchedInboxRouteLookup = new FakeWatchedInboxRouteLookup();
    connectionLookup = new FakeConnectionLookup();
    workerLookup = new FakeWorkerLookup();
    workItemService = new FakeWorkItemService();
    inboxItemService = new FakeInboxItemService();
    activityService = new FakeActivityService();

    watchedInboxRouteLookup.routes.push(createTestRoute());
    connectionLookup.connections.push(createTestConnection());
    workerLookup.workers.push(createTestWorker());

    service = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup,
      connectionLookup,
      workerLookup,
      workItemService,
      inboxItemService,
      activityService,
      now: () => new Date("2026-03-19T10:00:00Z"),
    });
  });

  it("processes a watched inbox event end-to-end: source event -> shadow work item -> shadow inbox item -> activity", async () => {
    const payload = createTestPayload();
    const result = await service.processWatchedInboxEvent(payload);

    // Result should contain all created IDs
    expect(result.source_event_id).toMatch(/^src_/);
    expect(result.work_item_id).toBe("wi_test_1");
    expect(result.inbox_item_id).toBe("inb_test_1");
    expect(result.activity_event_id).toBe("evt_test_1");
    expect(result.worker_id).toBe(WORKER_ID);
    expect(result.workspace_id).toBe(WORKSPACE_ID);
    expect(result.deduplicated).toBe(false);

    // Source event was created with kind: watched_inbox
    expect(sourceEventStore.events).toHaveLength(1);
    const srcEvent = sourceEventStore.events[0]!;
    expect(srcEvent.kind).toBe("watched_inbox");
    expect(srcEvent.externalMessageId).toBe(payload.external_message_id);
    expect(srcEvent.fromAddress).toBe("sarah@acmecorp.com");
    expect(srcEvent.subject).toBe("Re: Q3 Renewal Discussion");
    expect(srcEvent.workerId).toBe(WORKER_ID);
    expect(srcEvent.inputRouteId).toBe(ROUTE_ID);

    // Work item was created: email_draft, status defaults to draft
    expect(workItemService.items).toHaveLength(1);
    const workItem = workItemService.items[0]!;
    expect(workItem.kind).toBe("email_draft");
    expect(workItem.title).toContain("Shadow draft");
    expect(workItem.title).toContain("Q3 Renewal Discussion");
    expect(workItem.workerId).toBe(WORKER_ID);
    expect(workItem.sourceRouteKind).toBe("watched_inbox");
    expect(workItem.sourceEventId).toBe(result.source_event_id);
    expect(workItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "shadow_draft",
    });

    // Inbox item was created with kind: "shadow" (NOT "review")
    expect(inboxItemService.items).toHaveLength(1);
    const inboxItem = inboxItemService.items[0]!;
    expect(inboxItem.kind).toBe("shadow");
    expect(inboxItem.title).toContain("Shadow suggestion");
    expect(inboxItem.workerId).toBe(WORKER_ID);
    expect(inboxItem.routeKind).toBe("watched_inbox");
    expect(inboxItem.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "shadow_draft",
    });

    // Activity event was created
    expect(activityService.events).toHaveLength(1);
    expect(activityService.events[0]!.resultKind).toBe("shadow_draft_created");
  });

  it("shadow inbox item has kind: 'shadow' — NOT 'review'", async () => {
    const payload = createTestPayload();
    await service.processWatchedInboxEvent(payload);

    const inboxItem = inboxItemService.items[0]!;
    expect(inboxItem.kind).toBe("shadow");
    expect(inboxItem.kind).not.toBe("review");
  });

  it("shadow work item has no review_id (review_id should not be set)", async () => {
    const payload = createTestPayload();
    await service.processWatchedInboxEvent(payload);

    // The work item creation input should not include reviewId
    // Since our fake just stores what was passed, check the raw item
    const workItem = workItemService.items[0]!;
    // The service does NOT pass reviewId to the create call
    expect((workItem as any).reviewId).toBeUndefined();
  });

  it("deduplicates events by external_message_id", async () => {
    const payload = createTestPayload();

    const first = await service.processWatchedInboxEvent(payload);
    expect(first.deduplicated).toBe(false);

    const second = await service.processWatchedInboxEvent(payload);
    expect(second.deduplicated).toBe(true);
    expect(second.source_event_id).toBe(first.source_event_id);

    // Only one source event and one work item created
    expect(sourceEventStore.events).toHaveLength(1);
    expect(workItemService.items).toHaveLength(1);
  });

  it("throws WatchedInboxWorkerNotFoundError when worker is missing", async () => {
    workerLookup.workers.length = 0;

    const payload = createTestPayload();
    await expect(service.processWatchedInboxEvent(payload)).rejects.toThrow(
      WatchedInboxWorkerNotFoundError,
    );
  });

  it("throws WatchedInboxRouteNotFoundError when no active watched_inbox route exists", async () => {
    watchedInboxRouteLookup.routes.length = 0;

    const payload = createTestPayload();
    await expect(service.processWatchedInboxEvent(payload)).rejects.toThrow(
      WatchedInboxRouteNotFoundError,
    );
  });

  it("throws WatchedInboxRouteNotFoundError when route is inactive", async () => {
    watchedInboxRouteLookup.routes.length = 0;
    watchedInboxRouteLookup.routes.push({
      ...createTestRoute(),
      status: "inactive",
    });

    const payload = createTestPayload();
    await expect(service.processWatchedInboxEvent(payload)).rejects.toThrow(
      WatchedInboxRouteNotFoundError,
    );
  });

  it("throws GmailConnectionNotReadyError when no connected Gmail read-only connection", async () => {
    connectionLookup.connections.length = 0;

    const payload = createTestPayload();
    await expect(service.processWatchedInboxEvent(payload)).rejects.toThrow(
      GmailConnectionNotReadyError,
    );
  });

  it("throws GmailConnectionNotReadyError when Gmail connection is not_connected", async () => {
    connectionLookup.connections.length = 0;
    connectionLookup.connections.push({
      ...createTestConnection(),
      status: "not_connected",
    });

    const payload = createTestPayload();
    await expect(service.processWatchedInboxEvent(payload)).rejects.toThrow(
      GmailConnectionNotReadyError,
    );
  });

  it("handles events without HTML body", async () => {
    const payload = createTestPayload({ body_html: null });
    const result = await service.processWatchedInboxEvent(payload);

    expect(result.deduplicated).toBe(false);
    const srcEvent = sourceEventStore.events[0]!;
    expect(srcEvent.bodyHtml).toBeNull();
  });

  it("multiple distinct watched inbox events create separate items", async () => {
    const event1 = createTestPayload({
      external_message_id: "<msg-001@gmail.com>",
      subject: "First watched email",
    });
    const event2 = createTestPayload({
      external_message_id: "<msg-002@gmail.com>",
      subject: "Second watched email",
    });

    await service.processWatchedInboxEvent(event1);
    await service.processWatchedInboxEvent(event2);

    expect(sourceEventStore.events).toHaveLength(2);
    expect(workItemService.items).toHaveLength(2);
    expect(inboxItemService.items).toHaveLength(2);
    expect(activityService.events).toHaveLength(2);

    const titles = workItemService.items.map((i) => i.title);
    expect(titles.find((t) => t.includes("First watched email"))).toBeTruthy();
    expect(titles.find((t) => t.includes("Second watched email"))).toBeTruthy();
  });

  it("cold outreach is ignored: no inbox/work item, activity only", async () => {
    const payload = createTestPayload({
      from: "sales@leadgen-partners.io",
      subject: "Quick question for you",
      body_text:
        "Hi Dave, I noticed your company and wanted to reach out. We help companies like yours with outbound growth and would love to connect for a free demo.",
    });

    const result = await service.processWatchedInboxEvent(payload);

    expect(result.work_item_id).toBe("");
    expect(result.inbox_item_id).toBe("");
    expect(activityService.events).toHaveLength(1);
    expect(activityService.events[0]!.resultKind).toBe("triage_ignored");
    expect(workItemService.items).toHaveLength(0);
    expect(inboxItemService.items).toHaveLength(0);
    expect(sourceEventStore.events[0]!.triageJson).toMatchObject({
      decision: "ignore",
      intent: "cold_outreach",
    });
  });

  it("billing email requests review and persists triage on the inbox item", async () => {
    const payload = createTestPayload({
      subject: "Invoice question",
      body_text: "Hi, can you clarify this invoice and payment timing for the renewal?",
    });

    const result = await service.processWatchedInboxEvent(payload);

    expect(result.work_item_id).toBe("");
    expect(result.inbox_item_id).toBe("inb_test_1");
    expect(workItemService.items).toHaveLength(0);
    expect(inboxItemService.items).toHaveLength(1);
    expect(inboxItemService.items[0]!.kind).toBe("review");
    expect(inboxItemService.items[0]!.triageJson).toMatchObject({
      decision: "request_review",
      intent: "billing_admin",
    });
    expect(activityService.events[0]!.resultKind).toBe("triage_review_requested");
  });

  it("support issue requests review instead of drafting", async () => {
    const payload = createTestPayload({
      subject: "App is broken after update",
      body_text: "The app crashes on login and we cannot access the dashboard. Can you help?",
    });

    const result = await service.processWatchedInboxEvent(payload);

    expect(result.work_item_id).toBe("");
    expect(result.inbox_item_id).toBe("inb_test_1");
    expect(workItemService.items).toHaveLength(0);
    expect(inboxItemService.items[0]!.kind).toBe("review");
    expect(inboxItemService.items[0]!.triageJson).toMatchObject({
      decision: "request_review",
      intent: "support_issue",
    });
  });

  it("creates a suggestion-first review item for known prospect proposal mail when a Proposal worker is active", async () => {
    const routeTargetLookup = new FakeRouteTargetLookup();
    routeTargetLookup.workers.push(createRouteTargetWorker("proposal"));

    service = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup,
      connectionLookup,
      workerLookup,
      routeTargetLookup,
      workItemService,
      inboxItemService,
      activityService,
      senderResolutionService: {
        resolve: async () => resolvedSender("prospect"),
      } as any,
      now: () => new Date("2026-03-19T10:00:00Z"),
    });

    const result = await service.processWatchedInboxEvent(createTestPayload({
      from: "buyer@globex.io",
      subject: "Request for proposal - consulting engagement",
      body_text: "We would like to discuss a potential consulting engagement. Can you share a proposal for the scope of work?",
    }));

    expect(result.work_item_id).toBe("");
    expect(result.inbox_item_id).toBe("inb_test_1");
    expect(workItemService.items).toHaveLength(0);
    expect(inboxItemService.items[0]!.kind).toBe("review");
    expect(inboxItemService.items[0]!.title).toContain("Route suggested");
    expect(inboxItemService.items[0]!.triageJson).toMatchObject({
      decision: "route_to_worker",
      intent: "proposal",
      route_target_worker_id: "wkr_proposal_test",
    });
    expect(inboxItemService.items[0]!.executionStateJson).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "route_confirmation",
      resume_reason: null,
      last_decision: "route_to_worker",
      target_worker_id: "wkr_proposal_test",
    });
    expect(activityService.events[0]!.resultKind).toBe("triage_route_suggested");
  });

  it("falls back to review with route_missing when a suggested target worker is not installed", async () => {
    service = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup,
      connectionLookup,
      workerLookup,
      routeTargetLookup: new FakeRouteTargetLookup(),
      workItemService,
      inboxItemService,
      activityService,
      senderResolutionService: {
        resolve: async () => resolvedSender("prospect"),
      } as any,
      now: () => new Date("2026-03-19T10:00:00Z"),
    });

    const result = await service.processWatchedInboxEvent(createTestPayload({
      from: "buyer@globex.io",
      subject: "Request for proposal - consulting engagement",
      body_text: "We would like to discuss a potential consulting engagement. Can you share a proposal for the scope of work?",
    }));

    expect(result.work_item_id).toBe("");
    expect(result.inbox_item_id).toBe("inb_test_1");
    expect(inboxItemService.items[0]!.kind).toBe("review");
    expect(inboxItemService.items[0]!.title).toContain("Route review needed");
    expect(inboxItemService.items[0]!.triageJson).toMatchObject({
      decision: "request_review",
      intent: "proposal",
      route_target_worker_id: null,
    });
    expect((inboxItemService.items[0]!.triageJson as any).reasons).toContain("route_missing");
  });

  it("falls back to review with route_ambiguous when multiple matching targets are active", async () => {
    const routeTargetLookup = new FakeRouteTargetLookup();
    routeTargetLookup.workers.push(
      createRouteTargetWorker("proposal", { id: "wkr_proposal_a", name: "Proposal A" }),
      createRouteTargetWorker("proposal", { id: "wkr_proposal_b", name: "Proposal B" }),
    );

    service = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup,
      connectionLookup,
      workerLookup,
      routeTargetLookup,
      workItemService,
      inboxItemService,
      activityService,
      senderResolutionService: {
        resolve: async () => resolvedSender("prospect"),
      } as any,
      now: () => new Date("2026-03-19T10:00:00Z"),
    });

    await service.processWatchedInboxEvent(createTestPayload({
      from: "buyer@globex.io",
      subject: "Request for proposal - consulting engagement",
      body_text: "We would like to discuss a potential consulting engagement. Can you share a proposal for the scope of work?",
    }));

    expect(inboxItemService.items[0]!.kind).toBe("review");
    expect((inboxItemService.items[0]!.triageJson as any).decision).toBe("request_review");
    expect((inboxItemService.items[0]!.triageJson as any).reasons).toContain("route_ambiguous");
  });

  it("legal escalation creates a boundary inbox item", async () => {
    const payload = createTestPayload({
      subject: "Formal complaint regarding contract",
      body_text: "This is a formal complaint. Our lawyer will be in touch unless this is resolved immediately.",
    });

    const result = await service.processWatchedInboxEvent(payload);

    expect(result.work_item_id).toBe("");
    expect(result.inbox_item_id).toBe("inb_test_1");
    expect(workItemService.items).toHaveLength(0);
    expect(inboxItemService.items[0]!.kind).toBe("boundary");
    expect(inboxItemService.items[0]!.triageJson).toMatchObject({
      decision: "escalate",
      intent: "escalation",
    });
    expect(activityService.events[0]!.resultKind).toBe("triage_escalated");
  });

  // ---------------------------------------------------------------------------
  // B3: Destination worker availability — incident and bugfix routing
  // ---------------------------------------------------------------------------

  describe("destination worker availability for support-issue routing", () => {
    function createServiceWithTargets(targets: RouteTargetWorker[]) {
      const routeTargetLookup = new FakeRouteTargetLookup();
      routeTargetLookup.workers.push(...targets);

      return new WatchedInboxService({
        sourceEventStore,
        watchedInboxRouteLookup,
        connectionLookup,
        workerLookup,
        routeTargetLookup,
        workItemService,
        inboxItemService,
        activityService,
        senderResolutionService: {
          resolve: async () => resolvedSender("customer"),
        } as any,
        now: () => new Date("2026-03-23T10:00:00Z"),
      });
    }

    const bugPayload = () => createTestPayload({
      from: "client@acmecorp.com",
      subject: "Bug in the dashboard export",
      body_text: "The export feature is broken and not working since yesterday's update.",
    });

    const incidentPayload = () => createTestPayload({
      from: "client@acmecorp.com",
      subject: "Production outage — app is down",
      body_text: "The app is completely down and unavailable. This is blocking our entire team.",
    });

    it("routes bug report to Bugfix worker when exactly one is active", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("bugfix"),
      ]);

      await svc.processWatchedInboxEvent(bugPayload());

      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "route_to_worker",
        intent: "support_issue",
        route_target_worker_id: "wkr_bugfix_test",
      });
      expect(activityService.events[0]!.resultKind).toBe("triage_route_suggested");
    });

    it("routes incident report to Incident worker when exactly one is active", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("incident"),
      ]);

      await svc.processWatchedInboxEvent(incidentPayload());

      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "route_to_worker",
        intent: "support_issue",
        route_target_worker_id: "wkr_incident_test",
      });
      expect(activityService.events[0]!.resultKind).toBe("triage_route_suggested");
    });

    it("falls back to Incident worker for bug report when no Bugfix worker exists", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("incident"),
      ]);

      await svc.processWatchedInboxEvent(bugPayload());

      // Bug prefers bugfix first, but falls back to incident
      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "route_to_worker",
        intent: "support_issue",
        route_target_worker_id: "wkr_incident_test",
      });
    });

    it("falls back to Bugfix worker for incident report when no Incident worker exists", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("bugfix"),
      ]);

      await svc.processWatchedInboxEvent(incidentPayload());

      // Incident prefers incident first, but falls back to bugfix
      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "route_to_worker",
        intent: "support_issue",
        route_target_worker_id: "wkr_bugfix_test",
      });
    });

    it("degrades to request_review when no support worker exists at all", async () => {
      const svc = createServiceWithTargets([]);

      await svc.processWatchedInboxEvent(bugPayload());

      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "request_review",
        intent: "support_issue",
        route_target_worker_id: null,
      });
      expect((inboxItemService.items[0]!.triageJson as any).reasons).toContain("route_missing");
    });

    it("degrades to request_review when multiple Bugfix workers exist (ambiguous)", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("bugfix", { id: "wkr_bugfix_a", name: "Bugfix A" }),
        createRouteTargetWorker("bugfix", { id: "wkr_bugfix_b", name: "Bugfix B" }),
      ]);

      await svc.processWatchedInboxEvent(bugPayload());

      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "request_review",
        intent: "support_issue",
      });
      expect((inboxItemService.items[0]!.triageJson as any).reasons).toContain("route_ambiguous");
    });

    it("degrades to request_review when multiple Incident workers exist (ambiguous)", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("incident", { id: "wkr_incident_a", name: "Incident A" }),
        createRouteTargetWorker("incident", { id: "wkr_incident_b", name: "Incident B" }),
      ]);

      await svc.processWatchedInboxEvent(incidentPayload());

      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "request_review",
        intent: "support_issue",
      });
      expect((inboxItemService.items[0]!.triageJson as any).reasons).toContain("route_ambiguous");
    });

    it("resolves correctly when both Bugfix and Incident workers are active (bug prefers bugfix)", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("bugfix"),
        createRouteTargetWorker("incident"),
      ]);

      await svc.processWatchedInboxEvent(bugPayload());

      // Bug report prefers bugfix over incident
      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "route_to_worker",
        intent: "support_issue",
        route_target_worker_id: "wkr_bugfix_test",
      });
    });

    it("resolves correctly when both Incident and Bugfix workers are active (incident prefers incident)", async () => {
      const svc = createServiceWithTargets([
        createRouteTargetWorker("bugfix"),
        createRouteTargetWorker("incident"),
      ]);

      await svc.processWatchedInboxEvent(incidentPayload());

      // Incident report prefers incident over bugfix
      expect(inboxItemService.items[0]!.triageJson).toMatchObject({
        decision: "route_to_worker",
        intent: "support_issue",
        route_target_worker_id: "wkr_incident_test",
      });
    });
  });
});
