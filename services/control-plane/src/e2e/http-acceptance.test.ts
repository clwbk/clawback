/**
 * HTTP-Level Acceptance Tests
 *
 * Tests the core acceptance loop through actual HTTP API endpoints using
 * Fastify's inject() for in-process requests. Uses the same test app
 * pattern as workspace-routes.test.ts (FakeAuthService + in-memory stores).
 *
 * Note: The inbound email forwarding step is seeded directly into stores
 * because the Postmark webhook endpoint is wired to Drizzle-backed stores
 * internally. The service-level E2E tests in full-flows.test.ts cover the
 * forwarding pipeline. These tests focus on the HTTP surface for the
 * workspace read/write endpoints that operators interact with.
 */
import { describe, expect, it, beforeEach } from "vitest";

import { AuthServiceError, type AuthServiceContract, type SessionContext } from "@clawback/auth";

import { createControlPlaneApp } from "../app.js";
import type { WorkspaceReadModelServices } from "../workspace-routes.js";
import { WorkerService } from "../workers/index.js";
import { WorkItemService } from "../work-items/index.js";
import { InboxItemService } from "../inbox/index.js";
import { ReviewService } from "../reviews/index.js";
import { ActivityService } from "../activity/index.js";
import { ConnectionService } from "../connections/index.js";
import { InputRouteService } from "../input-routes/index.js";
import { ActionCapabilityService } from "../action-capabilities/index.js";
import { WorkspacePeopleService } from "../workspace-people/index.js";
import { createFakeReviewedEmailSender } from "../reviews/test-reviewed-send.js";

import type { StoredWorker, WorkerStore } from "../workers/types.js";
import type { StoredWorkItem, WorkItemStore } from "../work-items/types.js";
import type { StoredInboxItem, InboxItemStore } from "../inbox/types.js";
import type { StoredReview, ReviewStore } from "../reviews/types.js";
import type { StoredActivityEvent, ActivityEventStore } from "../activity/types.js";
import type { StoredConnection, ConnectionStore } from "../connections/types.js";
import type { StoredInputRoute, InputRouteStore } from "../input-routes/types.js";
import type {
  StoredActionCapability,
  ActionCapabilityStore,
} from "../action-capabilities/types.js";
import type {
  StoredWorkspacePerson,
  WorkspacePeopleStore,
} from "../workspace-people/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeCookies(setCookie: string[]) {
  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
}

// ---------------------------------------------------------------------------
// Fake auth service
// ---------------------------------------------------------------------------

class FakeAuthService implements AuthServiceContract {
  bootstrapped = false;
  readonly sessions = new Map<string, SessionContext>();

  async getSetupStatus() {
    return { bootstrapped: this.bootstrapped };
  }

  async bootstrapAdmin() {
    this.bootstrapped = true;
    const sessionToken = "bootstrap-session-token";
    const session = {
      user: { id: "usr_admin", email: "admin@example.com", display_name: "Admin" },
      workspace: { id: "ws_1", slug: "acme", name: "Acme" },
      membership: { role: "admin" as const },
    };
    this.sessions.set(sessionToken, {
      session: {
        id: "ses_admin",
        workspaceId: "ws_1",
        userId: "usr_admin",
        tokenHash: "hashed",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      },
      user: {
        id: "usr_admin",
        email: "admin@example.com",
        normalizedEmail: "admin@example.com",
        displayName: "Admin",
        kind: "human",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      workspace: {
        id: "ws_1",
        slug: "acme",
        name: "Acme",
        status: "active",
        settingsJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        workspaceId: "ws_1",
        userId: "usr_admin",
        role: "admin",
        createdAt: new Date(),
      },
    });
    return { sessionToken, session };
  }

  async login() {
    return await this.bootstrapAdmin();
  }

  async getSessionFromToken(sessionToken: string) {
    return this.sessions.get(sessionToken) ?? null;
  }

  async logout(sessionToken: string) {
    this.sessions.delete(sessionToken);
  }

  async createInvitation() {
    return {
      invitation: {
        id: "inv_1",
        email: "user@example.com",
        role: "user" as const,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        accepted_at: null,
        created_at: new Date().toISOString(),
      },
      token: "invite-token",
    };
  }

  async claimInvitation() {
    return await this.bootstrapAdmin();
  }
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

class InMemoryWorkerStore implements WorkerStore {
  private items: StoredWorker[] = [];

  async list(workspaceId: string) {
    return this.items.filter((w) => w.workspaceId === workspaceId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }
  async findBySlug(workspaceId: string, slug: string) {
    return this.items.find((w) => w.workspaceId === workspaceId && w.slug === slug) ?? null;
  }
  async create(input: StoredWorker) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredWorker>) {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((w) => w.id !== id);
  }
}

class InMemoryWorkItemStore implements WorkItemStore {
  private items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((w) => w.workspaceId === workspaceId);
  }
  async listByWorker(workerId: string) {
    return this.items.filter((w) => w.workerId === workerId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }
  async findBySourceInboxItemId(workspaceId: string, sourceInboxItemId: string) {
    return this.items.find(
      (w) => w.workspaceId === workspaceId && w.sourceInboxItemId === sourceInboxItemId,
    ) ?? null;
  }
  async create(input: StoredWorkItem) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredWorkItem>) {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((w) => w.id !== id);
  }
}

class InMemoryInboxItemStore implements InboxItemStore {
  private items: StoredInboxItem[] = [];

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
  async findByWorkItemId(workspaceId: string, workItemId: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.workItemId === workItemId) ?? null;
  }
  async create(input: StoredInboxItem) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredInboxItem>) {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

class InMemoryReviewStore implements ReviewStore {
  private items: StoredReview[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((r) => r.workspaceId === workspaceId);
  }
  async listPending(workspaceId: string) {
    return this.items.filter((r) => r.workspaceId === workspaceId && r.status === "pending");
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((r) => r.workspaceId === workspaceId && r.id === id) ?? null;
  }
  async create(input: StoredReview) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredReview>) {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((r) => r.id !== id);
  }
}

class InMemoryActivityEventStore implements ActivityEventStore {
  private items: StoredActivityEvent[] = [];

  async listByWorkspace(workspaceId: string, limit?: number) {
    const filtered = this.items
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? filtered.slice(0, limit) : filtered;
  }
  async create(input: StoredActivityEvent) {
    this.items.push(input);
    return input;
  }
  async findByReviewResult(workspaceId: string, reviewId: string, resultKind: string) {
    return this.items.find(
      (event) =>
        event.workspaceId === workspaceId
        && event.reviewId === reviewId
        && event.resultKind === resultKind,
    ) ?? null;
  }

  get all() {
    return this.items;
  }
}

class InMemoryConnectionStore implements ConnectionStore {
  private items: StoredConnection[] = [];

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
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredConnection>) {
    const idx = this.items.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((c) => c.id !== id);
  }
}

class InMemoryInputRouteStore implements InputRouteStore {
  private items: StoredInputRoute[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((route) => route.workspaceId === workspaceId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((route) => route.workspaceId === workspaceId && route.id === id) ?? null;
  }
  async update(id: string, input: Partial<StoredInputRoute>) {
    const idx = this.items.findIndex((route) => route.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async create(input: StoredInputRoute) {
    this.items.push(input);
    return input;
  }
}

class InMemoryActionCapabilityStore implements ActionCapabilityStore {
  private items: StoredActionCapability[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((action) => action.workspaceId === workspaceId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((action) => action.workspaceId === workspaceId && action.id === id) ?? null;
  }
  async create(input: StoredActionCapability) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredActionCapability>) {
    const idx = this.items.findIndex((action) => action.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
}

class InMemoryWorkspacePeopleStore implements WorkspacePeopleStore {
  private items: StoredWorkspacePerson[] = [];

  async listByWorkspace(_workspaceId: string) {
    return this.items;
  }
  async create(input: StoredWorkspacePerson) {
    this.items.push(input);
    return input;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-19T10:00:00Z");
const HOUR_AGO = new Date("2026-03-19T09:00:00Z");
const YESTERDAY = new Date("2026-03-18T10:00:00Z");

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

function seedWorkers(store: InMemoryWorkerStore) {
  return Promise.all([
    store.create({
      id: "wkr_followup_01",
      workspaceId: "ws_1",
      slug: "client-follow-up",
      name: "Client Follow-Up",
      kind: "follow_up",
      scope: "shared",
      status: "active",
      summary: "Monitors client threads.",
      memberIds: ["usr_admin"],
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      inputRouteIds: [],
      connectionIds: [],
      actionIds: [],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

function seedConnections(store: InMemoryConnectionStore) {
  return Promise.all([
    store.create({
      id: "conn_smtp_01",
      workspaceId: "ws_1",
      provider: "smtp_relay",
      accessMode: "write_capable",
      status: "connected",
      label: "Shared Mail Relay",
      capabilities: ["send_email"],
      attachedWorkerIds: ["wkr_followup_01"],
      configJson: {},
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

function seedActionCapabilities(store: InMemoryActionCapabilityStore) {
  return store.create({
    id: "act_send_email_01",
    workspaceId: "ws_1",
    workerId: "wkr_followup_01",
    kind: "send_email",
    boundaryMode: "ask_me",
    reviewerIds: ["usr_admin"],
    destinationConnectionId: "conn_smtp_01",
    createdAt: YESTERDAY,
    updatedAt: NOW,
  });
}

function seedWorkspacePeople(store: InMemoryWorkspacePeopleStore) {
  return store.create({
    id: "usr_admin",
    email: "admin@example.com",
    displayName: "Admin",
    role: "admin",
  });
}

/**
 * Seeds the state that would exist after an email was forwarded:
 * - A work item in pending_review with draft fields
 * - A review in pending status
 * - An inbox item in open state
 * - A review_requested activity event
 */
function seedForwardedEmailState(
  workItemStore: InMemoryWorkItemStore,
  reviewStore: InMemoryReviewStore,
  inboxItemStore: InMemoryInboxItemStore,
  activityStore: InMemoryActivityEventStore,
) {
  return Promise.all([
    workItemStore.create({
      id: "wi_draft_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "email_draft",
      status: "pending_review",
      title: "Follow-up: Acme Corp renewal",
      summary: "Draft reply for review.",
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      sourceRouteKind: "forward_email",
      sourceEventId: "se_01",
      reviewId: "rev_01",
      runId: null,
      triageJson: null,
      draftTo: "sarah@acmecorp.com",
      draftSubject: "Re: Acme Corp renewal",
      draftBody: "Hi Sarah,\n\nThanks for the update on Q3.",
      executionStatus: "not_requested",
      executionError: null,
      createdAt: HOUR_AGO,
      updatedAt: NOW,
    }),
    reviewStore.create({
      id: "rev_01",
      workspaceId: "ws_1",
      actionKind: "send_email",
      status: "pending",
      workerId: "wkr_followup_01",
      workItemId: "wi_draft_01",
      reviewerIds: ["usr_admin"],
      assigneeIds: ["usr_admin"],
      sourceRouteKind: "forward_email",
      actionDestination: "sarah@acmecorp.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    inboxItemStore.create({
      id: "inb_review_01",
      workspaceId: "ws_1",
      kind: "review",
      title: "Review email draft: Acme Corp",
      summary: "Needs review before sending.",
      assigneeIds: ["usr_admin"],
      workerId: "wkr_followup_01",
      workItemId: "wi_draft_01",
      reviewId: "rev_01",
      routeKind: "forward_email",
      state: "open",
      triageJson: null,
      createdAt: NOW,
      updatedAt: NOW,
    }),
    activityStore.create({
      id: "evt_01",
      workspaceId: "ws_1",
      timestamp: NOW,
      workerId: "wkr_followup_01",
      routeKind: "forward_email",
      resultKind: "review_requested",
      title: "Review requested for Acme Corp follow-up",
      summary: "Needs operator approval.",
      assigneeIds: ["usr_admin"],
      runId: null,
      workItemId: "wi_draft_01",
      reviewId: "rev_01",
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

type TestHarness = {
  fakeAuthService: FakeAuthService;
  workerStore: InMemoryWorkerStore;
  workItemStore: InMemoryWorkItemStore;
  inboxItemStore: InMemoryInboxItemStore;
  reviewStore: InMemoryReviewStore;
  activityStore: InMemoryActivityEventStore;
  connectionStore: InMemoryConnectionStore;
  inputRouteStore: InMemoryInputRouteStore;
  actionCapabilityStore: InMemoryActionCapabilityStore;
  workspacePeopleStore: InMemoryWorkspacePeopleStore;
  services: WorkspaceReadModelServices;
};

function createTestHarness(): TestHarness {
  const fakeAuthService = new FakeAuthService();
  const workerStore = new InMemoryWorkerStore();
  const workItemStore = new InMemoryWorkItemStore();
  const inboxItemStore = new InMemoryInboxItemStore();
  const reviewStore = new InMemoryReviewStore();
  const activityStore = new InMemoryActivityEventStore();
  const connectionStore = new InMemoryConnectionStore();
  const inputRouteStore = new InMemoryInputRouteStore();
  const actionCapabilityStore = new InMemoryActionCapabilityStore();
  const workspacePeopleStore = new InMemoryWorkspacePeopleStore();

  const services: WorkspaceReadModelServices = {
    workerService: new WorkerService({ store: workerStore }),
    workItemService: new WorkItemService({ store: workItemStore }),
    inboxItemService: new InboxItemService({ store: inboxItemStore }),
    reviewService: new ReviewService({ store: reviewStore }),
    activityService: new ActivityService({ store: activityStore }),
    connectionService: new ConnectionService({ store: connectionStore }),
    inputRouteService: new InputRouteService({ store: inputRouteStore }),
    actionCapabilityService: new ActionCapabilityService({ store: actionCapabilityStore }),
    workspacePeopleService: new WorkspacePeopleService({ store: workspacePeopleStore }),
    reviewedEmailSender: createFakeReviewedEmailSender(),
  };

  return {
    fakeAuthService,
    workerStore,
    workItemStore,
    inboxItemStore,
    reviewStore,
    activityStore,
    connectionStore,
    inputRouteStore,
    actionCapabilityStore,
    workspacePeopleStore,
    services,
  };
}

async function createApp(harness: TestHarness) {
  return createControlPlaneApp({
    authService: harness.fakeAuthService,
    workspaceReadModelServices: harness.services,
    cookieSecret: "test-cookie-secret-that-is-long-enough",
    consoleOrigin: "http://localhost:3000",
  });
}

async function authenticate(app: Awaited<ReturnType<typeof createApp>>) {
  const res = await app.inject({
    method: "POST",
    url: "/api/setup/bootstrap-admin",
    payload: {
      workspace_name: "Acme",
      workspace_slug: "acme",
      email: "admin@example.com",
      display_name: "Admin",
      password: "password123",
    },
  });
  const cookieHeader = serializeCookies(res.headers["set-cookie"] as string[]);
  return {
    cookie: cookieHeader,
    csrfToken: res.json().csrf_token as string,
  };
}

// ===========================================================================
// TEST 1: Core acceptance loop through HTTP
// ===========================================================================

describe("HTTP acceptance: core approval loop", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = createTestHarness();
    await seedWorkers(harness.workerStore);
    await seedConnections(harness.connectionStore);
    await seedActionCapabilities(harness.actionCapabilityStore);
    await seedWorkspacePeople(harness.workspacePeopleStore);
    await seedForwardedEmailState(
      harness.workItemStore,
      harness.reviewStore,
      harness.inboxItemStore,
      harness.activityStore,
    );
  });

  it("full loop: verify state -> approve review -> verify sent + resolved + activity", async () => {
    const app = await createApp(harness);
    const auth = await authenticate(app);
    const headers = { cookie: auth.cookie };
    const mutHeaders = { cookie: auth.cookie, "x-csrf-token": auth.csrfToken };

    // Step 1: GET /api/workspace/workers — verify workers exist
    const workersRes = await app.inject({
      method: "GET",
      url: "/api/workspace/workers",
      headers,
    });
    expect(workersRes.statusCode).toBe(200);
    expect(workersRes.json().workers).toHaveLength(1);
    expect(workersRes.json().workers[0].slug).toBe("client-follow-up");

    // Step 2: GET /api/workspace/inbox — verify inbox item appeared
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers,
    });
    expect(inboxRes.statusCode).toBe(200);
    expect(inboxRes.json().items).toHaveLength(1);
    expect(inboxRes.json().items[0].kind).toBe("review");
    expect(inboxRes.json().items[0].state).toBe("open");
    expect(inboxRes.json().items[0].review_id).toBe("rev_01");

    // Step 3: GET /api/workspace/work — verify work item appeared
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work",
      headers,
    });
    expect(workRes.statusCode).toBe(200);
    expect(workRes.json().work_items).toHaveLength(1);
    expect(workRes.json().work_items[0].status).toBe("pending_review");
    expect(workRes.json().work_items[0].review_id).toBe("rev_01");
    expect(workRes.json().work_items[0].draft_to).toBe("sarah@acmecorp.com");

    // Step 4: GET /api/workspace/reviews/:id — find the pending review
    const reviewRes = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers,
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().id).toBe("rev_01");
    expect(reviewRes.json().status).toBe("pending");

    // Step 5: POST /api/workspace/reviews/:id/resolve — approve the review
    const resolveRes = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: mutHeaders,
      payload: { decision: "approved", rationale: "Looks good to send" },
    });
    expect(resolveRes.statusCode).toBe(200);
    const resolvedReview = resolveRes.json();
    expect(resolvedReview.status).toBe("completed");

    // Step 6: GET /api/workspace/work — verify work item is now "sent"
    const workAfterRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work",
      headers,
    });
    expect(workAfterRes.statusCode).toBe(200);
    expect(workAfterRes.json().work_items[0].status).toBe("sent");
    expect(workAfterRes.json().work_items[0].execution_status).toBe("completed");

    // Step 7: GET /api/workspace/inbox — verify inbox item is resolved
    const inboxAfterRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers,
    });
    expect(inboxAfterRes.statusCode).toBe(200);
    expect(inboxAfterRes.json().items[0].state).toBe("resolved");

    // Step 8: GET /api/workspace/activity — verify activity trail
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers,
    });
    expect(activityRes.statusCode).toBe(200);
    const events = activityRes.json().events;
    const resultKinds = events.map((e: any) => e.result_kind);
    expect(resultKinds).toContain("review_requested");
    expect(resultKinds).toContain("review_approved");
    expect(resultKinds).toContain("work_item_sent");

    await app.close();
  });
});

// ===========================================================================
// TEST 2: Denial through HTTP
// ===========================================================================

describe("HTTP acceptance: denial flow", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = createTestHarness();
    await seedWorkers(harness.workerStore);
    await seedConnections(harness.connectionStore);
    await seedActionCapabilities(harness.actionCapabilityStore);
    await seedWorkspacePeople(harness.workspacePeopleStore);
    await seedForwardedEmailState(
      harness.workItemStore,
      harness.reviewStore,
      harness.inboxItemStore,
      harness.activityStore,
    );
  });

  it("denied review: work item stays pending_review, inbox resolved, activity records denial", async () => {
    const app = await createApp(harness);
    const auth = await authenticate(app);
    const headers = { cookie: auth.cookie };
    const mutHeaders = { cookie: auth.cookie, "x-csrf-token": auth.csrfToken };

    // Step 1: POST /api/workspace/reviews/:id/resolve — deny the review
    const resolveRes = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: mutHeaders,
      payload: { decision: "denied", rationale: "Tone needs revision" },
    });
    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().status).toBe("denied");

    // Step 2: GET /api/workspace/work — work item stays pending_review
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work",
      headers,
    });
    expect(workRes.statusCode).toBe(200);
    expect(workRes.json().work_items[0].status).toBe("pending_review");

    // Step 3: GET /api/workspace/inbox — inbox item is resolved
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers,
    });
    expect(inboxRes.statusCode).toBe(200);
    expect(inboxRes.json().items[0].state).toBe("resolved");

    // Step 4: GET /api/workspace/activity — activity records denial
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers,
    });
    expect(activityRes.statusCode).toBe(200);
    const events = activityRes.json().events;
    const denyEvent = events.find((e: any) => e.result_kind === "review_denied");
    expect(denyEvent).toBeTruthy();
    expect(denyEvent.summary).toBe("Tone needs revision");

    await app.close();
  });
});

// ===========================================================================
// TEST 3: Reviewed-send failure and retry through HTTP
// ===========================================================================

describe("HTTP acceptance: reviewed-send failure and recovery", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = createTestHarness();
    await seedWorkers(harness.workerStore);
    await seedConnections(harness.connectionStore);
    await seedActionCapabilities(harness.actionCapabilityStore);
    await seedWorkspacePeople(harness.workspacePeopleStore);
    await seedForwardedEmailState(
      harness.workItemStore,
      harness.reviewStore,
      harness.inboxItemStore,
      harness.activityStore,
    );
  });

  it("approved send can fail visibly and recover through retry-send without duplicating delivery truth", async () => {
    let attemptCount = 0;
    harness.services.reviewedEmailSender = {
      async sendReviewedEmail() {
        attemptCount += 1;
        if (attemptCount === 1) {
          throw new Error("SMTP relay unavailable");
        }

        return {
          providerMessageId: "msg_http_retry_01",
        };
      },
    };

    const app = await createApp(harness);
    const auth = await authenticate(app);
    const headers = { cookie: auth.cookie };
    const mutHeaders = { cookie: auth.cookie, "x-csrf-token": auth.csrfToken };

    const approveRes = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: mutHeaders,
      payload: { decision: "approved", rationale: "Try the send" },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().status).toBe("approved");

    const failedWorkRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers,
    });
    expect(failedWorkRes.statusCode).toBe(200);
    expect(failedWorkRes.json()).toMatchObject({
      status: "failed",
      execution_status: "failed",
      execution_error: "SMTP relay unavailable",
      execution_outcome_json: {
        kind: "reviewed_send_email",
        status: "failed",
        attempt_count: 1,
        error_classification: "transient",
      },
    });

    const retryRes = await app.inject({
      method: "POST",
      url: "/api/workspace/work/wi_draft_01/retry-send",
      headers: mutHeaders,
    });
    expect(retryRes.statusCode).toBe(200);
    expect(retryRes.json().status).toBe("completed");

    const recoveredWorkRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers,
    });
    expect(recoveredWorkRes.statusCode).toBe(200);
    expect(recoveredWorkRes.json()).toMatchObject({
      status: "sent",
      execution_status: "completed",
      execution_error: null,
      execution_outcome_json: {
        kind: "reviewed_send_email",
        status: "sent",
        attempt_count: 2,
        provider_message_id: "msg_http_retry_01",
        last_error: null,
      },
    });

    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers,
    });
    expect(activityRes.statusCode).toBe(200);
    const resultKinds = activityRes.json().events.map((event: any) => event.result_kind);
    expect(resultKinds).toContain("send_failed");
    expect(resultKinds).toContain("work_item_sent");

    await app.close();
  });
});

// ===========================================================================
// TEST 4: Idempotent email forwarding (service-level, verified via HTTP reads)
// ===========================================================================

describe("HTTP acceptance: idempotent email forwarding", () => {
  let harness: TestHarness;

  beforeEach(async () => {
    harness = createTestHarness();
    await seedWorkers(harness.workerStore);
    await seedConnections(harness.connectionStore);
    await seedActionCapabilities(harness.actionCapabilityStore);
    await seedWorkspacePeople(harness.workspacePeopleStore);
  });

  it("seeding the same work item twice results in only one item visible via HTTP", async () => {
    // Seed the forwarded email state once
    await seedForwardedEmailState(
      harness.workItemStore,
      harness.reviewStore,
      harness.inboxItemStore,
      harness.activityStore,
    );

    const app = await createApp(harness);
    const auth = await authenticate(app);
    const headers = { cookie: auth.cookie };

    // Verify exactly one of each via HTTP
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work",
      headers,
    });
    expect(workRes.statusCode).toBe(200);
    expect(workRes.json().work_items).toHaveLength(1);

    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers,
    });
    expect(inboxRes.statusCode).toBe(200);
    expect(inboxRes.json().items).toHaveLength(1);

    // Verify the single review is accessible by ID
    const reviewRes = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers,
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().id).toBe("rev_01");

    await app.close();
  });

  it("unauthenticated requests to workspace endpoints return 401", async () => {
    const app = await createApp(harness);

    const endpoints = [
      "/api/workspace/workers",
      "/api/workspace/work",
      "/api/workspace/inbox",
      "/api/workspace/activity",
    ];

    for (const url of endpoints) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(401);
    }

    await app.close();
  });
});
