/**
 * Gmail Connect E2E Flow Tests
 *
 * Verifies the full Gmail connection lifecycle and its effect on
 * watched inbox event processing:
 *
 * 1. Connect → routes activate → watched inbox events accepted
 * 2. Disconnect → routes deactivate → watched inbox events rejected
 * 3. Auth enforcement (admin-only, CSRF)
 * 4. Idempotency (double-connect, double-disconnect)
 * 5. Route state consistency (only watched_inbox affected, not forward_email/chat)
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

import { WatchedInboxService, WatchedInboxRouteNotFoundError, GmailConnectionNotReadyError } from "../integrations/watched-inbox/service.js";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeCookies(setCookie: string[]) {
  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
}

// ---------------------------------------------------------------------------
// Fake auth service with admin + non-admin user support
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
    // Return a non-admin user session for invitation claims
    const sessionToken = "user-session-token";
    const session = {
      user: { id: "usr_member", email: "member@example.com", display_name: "Member" },
      workspace: { id: "ws_1", slug: "acme", name: "Acme" },
      membership: { role: "user" as const },
    };
    this.sessions.set(sessionToken, {
      session: {
        id: "ses_member",
        workspaceId: "ws_1",
        userId: "usr_member",
        tokenHash: "hashed_member",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      },
      user: {
        id: "usr_member",
        email: "member@example.com",
        normalizedEmail: "member@example.com",
        displayName: "Member",
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
        userId: "usr_member",
        role: "user",
        createdAt: new Date(),
      },
    });
    return { sessionToken, session };
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
  items: StoredInputRoute[] = [];
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
// In-memory stores for WatchedInboxService (domain-level lookups)
// ---------------------------------------------------------------------------

class MemoryWatchedSourceEventStore implements WatchedSourceEventStore {
  events: WatchedStoredSourceEvent[] = [];
  async findByExternalMessageId(workspaceId: string, externalMessageId: string) {
    return (
      this.events.find(
        (e) => e.workspaceId === workspaceId && e.externalMessageId === externalMessageId,
      ) ?? null
    );
  }
  async create(input: WatchedStoredSourceEvent) {
    this.events.push(input);
    return input;
  }
}

class MemoryWatchedInboxRouteLookup implements WatchedInboxRouteLookup {
  routes: InputRouteForWatchedInbox[] = [];
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

class MemoryWorkerLookup implements WatchedWorkerLookup {
  workers: WatchedWorkerSummary[] = [];
  async findById(workspaceId: string, id: string) {
    return this.workers.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-19T10:00:00Z");
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
    store.create({
      id: "wkr_proposal_01",
      workspaceId: "ws_1",
      slug: "proposal",
      name: "Proposal",
      kind: "proposal",
      scope: "shared",
      status: "active",
      summary: "Generates proposals.",
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

function seedGmailConnectionNotConnected(store: InMemoryConnectionStore) {
  return store.create({
    id: "conn_gmail_01",
    workspaceId: "ws_1",
    provider: "gmail",
    accessMode: "read_only",
    status: "not_connected",
    label: "Admin Gmail (read-only)",
    capabilities: ["read_threads", "watch_inbox"],
    attachedWorkerIds: ["wkr_followup_01"],
    createdAt: YESTERDAY,
    updatedAt: NOW,
  });
}

function seedGmailConnectionConnected(store: InMemoryConnectionStore) {
  return store.create({
    id: "conn_gmail_01",
    workspaceId: "ws_1",
    provider: "gmail",
    accessMode: "read_only",
    status: "connected",
    label: "Admin Gmail (read-only)",
    capabilities: ["read_threads", "watch_inbox"],
    attachedWorkerIds: ["wkr_followup_01"],
    createdAt: YESTERDAY,
    updatedAt: NOW,
  });
}

function seedInputRoutesWithSuggestedWatchedInbox(store: InMemoryInputRouteStore) {
  return Promise.all([
    store.create({
      id: "rte_forward_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "forward_email",
      status: "active",
      label: "Forwarded email",
      description: "Forward one thread into the worker.",
      address: "followup-acme@inbound.clawback.dev",
      capabilityNote: "Lowest-trust route for real client context.",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
    store.create({
      id: "rte_watch_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "watched_inbox",
      status: "suggested",
      label: "Watched inbox",
      description: "Notices inbox activity and prepares shadow drafts.",
      address: null,
      capabilityNote: "Enabled when Gmail read-only is connected.",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
    // Chat route for the proposal worker — should NOT be affected by Gmail connect/disconnect
    store.create({
      id: "rte_chat_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "chat",
      status: "active",
      label: "Chat",
      description: "Chat with the proposal worker.",
      address: null,
      capabilityNote: null,
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

function seedInputRoutesWithActiveWatchedInbox(store: InMemoryInputRouteStore) {
  return Promise.all([
    store.create({
      id: "rte_forward_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "forward_email",
      status: "active",
      label: "Forwarded email",
      description: "Forward one thread into the worker.",
      address: "followup-acme@inbound.clawback.dev",
      capabilityNote: "Lowest-trust route for real client context.",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
    store.create({
      id: "rte_watch_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "watched_inbox",
      status: "active",
      label: "Watched inbox",
      description: "Notices inbox activity and prepares shadow drafts.",
      address: null,
      capabilityNote: "Enabled when Gmail read-only is connected.",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
    store.create({
      id: "rte_chat_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "chat",
      status: "active",
      label: "Chat",
      description: "Chat with the proposal worker.",
      address: null,
      capabilityNote: null,
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// App + auth helpers
// ---------------------------------------------------------------------------

type TestAppContext = {
  fakeAuthService: FakeAuthService;
  connectionStore: InMemoryConnectionStore;
  inputRouteStore: InMemoryInputRouteStore;
  workItemStore: InMemoryWorkItemStore;
  inboxItemStore: InMemoryInboxItemStore;
  services: WorkspaceReadModelServices;
};

function createTestServices(): TestAppContext {
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
  };

  return { fakeAuthService, connectionStore, inputRouteStore, workItemStore, inboxItemStore, services };
}

async function createApp(ctx: TestAppContext) {
  return createControlPlaneApp({
    authService: ctx.fakeAuthService,
    workspaceReadModelServices: ctx.services,
    cookieSecret: "test-cookie-secret-that-is-long-enough",
    consoleOrigin: "http://localhost:3000",
  });
}

async function authenticateAsAdmin(app: Awaited<ReturnType<typeof createApp>>) {
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
    toString() {
      return cookieHeader;
    },
  };
}

async function authenticateAsUser(app: Awaited<ReturnType<typeof createApp>>) {
  // First bootstrap admin to enable invitation flow
  await authenticateAsAdmin(app);

  const res = await app.inject({
    method: "POST",
    url: "/api/invitations/claim",
    payload: {
      token: "invite-token",
      display_name: "Member",
      password: "password123",
    },
  });
  const cookieHeader = serializeCookies(res.headers["set-cookie"] as string[]);
  return {
    cookie: cookieHeader,
    csrfToken: res.json().csrf_token as string,
    toString() {
      return cookieHeader;
    },
  };
}

// ===========================================================================
// SCENARIO 1: Full Gmail connect lifecycle
// ===========================================================================

describe("Gmail connect E2E: full lifecycle", () => {
  let ctx: TestAppContext;
  let workerStore: InMemoryWorkerStore;

  beforeEach(async () => {
    ctx = createTestServices();
    workerStore = new InMemoryWorkerStore();
    await seedWorkers(workerStore);

    // Rebuild services with seeded worker store
    ctx.services = {
      ...ctx.services,
      workerService: new WorkerService({ store: workerStore }),
    };
  });

  it("connect → routes activate → watched inbox event accepted → disconnect → routes suggested → event rejected", async () => {
    // Seed: Gmail not_connected, watched_inbox route "suggested"
    await seedGmailConnectionNotConnected(ctx.connectionStore);
    await seedInputRoutesWithSuggestedWatchedInbox(ctx.inputRouteStore);

    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    // 1. Verify initial state: connection not_connected, watched route suggested
    const connBefore = await app.inject({
      method: "GET",
      url: "/api/workspace/connections",
      headers: { cookie: admin.toString() },
    });
    expect(connBefore.json().connections[0].status).toBe("not_connected");

    const routesBefore = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const watchedBefore = routesBefore.json().input_routes.find((r: any) => r.kind === "watched_inbox");
    expect(watchedBefore.status).toBe("suggested");

    // 2. Connect Gmail
    const connectRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });
    expect(connectRes.statusCode).toBe(200);
    expect(connectRes.json().status).toBe("connected");

    // 3. Verify watched_inbox route is now active
    const routesAfterConnect = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const watchedAfterConnect = routesAfterConnect.json().input_routes.find((r: any) => r.kind === "watched_inbox");
    expect(watchedAfterConnect.status).toBe("active");

    // 4. Verify watched inbox event is now accepted (via domain service)
    const sourceEventStore = new MemoryWatchedSourceEventStore();
    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push({
      id: "rte_watch_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "watched_inbox",
      status: "active", // matches the now-active route
    });
    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connections.push({
      id: "conn_gmail_01",
      provider: "gmail",
      accessMode: "read_only",
      status: "connected",
    });
    const watchedWorkerLookup = new MemoryWorkerLookup();
    watchedWorkerLookup.workers.push({
      id: "wkr_followup_01",
      workspaceId: "ws_1",
      slug: "client-follow-up",
      name: "Client Follow-Up",
      kind: "follow_up",
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
    });

    const workItemService = new WorkItemService({ store: ctx.workItemStore, now: () => NOW });
    const inboxItemService = new InboxItemService({ store: ctx.inboxItemStore, now: () => NOW });
    const activityService = new ActivityService({ store: new InMemoryActivityEventStore(), now: () => NOW });

    const watchedInboxService = new WatchedInboxService({
      sourceEventStore,
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup: watchedWorkerLookup,
      workItemService,
      inboxItemService,
      activityService,
      now: () => NOW,
    });

    const watchedPayload: WatchedInboxPayload = {
      external_message_id: "<watched-lifecycle-test@gmail.com>",
      worker_id: "wkr_followup_01",
      workspace_id: "ws_1",
      from: "sarah@acmecorp.com",
      subject: "Re: Q3 Renewal Discussion",
      body_text: "Hi Dave, wanted to follow up...",
    };

    const result = await watchedInboxService.processWatchedInboxEvent(watchedPayload);
    expect(result.deduplicated).toBe(false);
    expect(result.worker_id).toBe("wkr_followup_01");

    // 5. Verify shadow work item + inbox item created
    const workItems = await workItemService.listByWorkspace("ws_1");
    expect(workItems.work_items.length).toBeGreaterThanOrEqual(1);
    const shadowWork = workItems.work_items.find((wi) => wi.source_route_kind === "watched_inbox");
    expect(shadowWork).toBeTruthy();
    expect(shadowWork!.status).toBe("draft");

    const inboxItems = await inboxItemService.list("ws_1");
    expect(inboxItems.items.length).toBeGreaterThanOrEqual(1);
    const shadowInbox = inboxItems.items.find((i) => i.kind === "shadow");
    expect(shadowInbox).toBeTruthy();
    expect(shadowInbox!.state).toBe("open");

    // 6. Disconnect Gmail
    const disconnectRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });
    expect(disconnectRes.statusCode).toBe(200);
    expect(disconnectRes.json().status).toBe("not_connected");

    // 7. Verify watched_inbox route is back to suggested
    const routesAfterDisconnect = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const watchedAfterDisconnect = routesAfterDisconnect.json().input_routes.find((r: any) => r.kind === "watched_inbox");
    expect(watchedAfterDisconnect.status).toBe("suggested");

    // 8. Verify watched inbox event is now rejected (route no longer active)
    routeLookup.routes[0]!.status = "suggested"; // simulate route state change
    connectionLookup.connections[0]!.status = "not_connected";

    await expect(
      watchedInboxService.processWatchedInboxEvent({
        ...watchedPayload,
        external_message_id: "<watched-lifecycle-test-2@gmail.com>",
      }),
    ).rejects.toThrow(WatchedInboxRouteNotFoundError);

    await app.close();
  });
});

// ===========================================================================
// SCENARIO 2: Connection auth tests
// ===========================================================================

describe("Gmail connect E2E: auth enforcement", () => {
  let ctx: TestAppContext;

  beforeEach(async () => {
    ctx = createTestServices();
    const workerStore = new InMemoryWorkerStore();
    await seedWorkers(workerStore);
    await seedGmailConnectionNotConnected(ctx.connectionStore);
    await seedInputRoutesWithSuggestedWatchedInbox(ctx.inputRouteStore);

    ctx.services = {
      ...ctx.services,
      workerService: new WorkerService({ store: workerStore }),
    };
  });

  it("non-admin user cannot connect (returns 403)", async () => {
    const app = await createApp(ctx);
    const user = await authenticateAsUser(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: user.toString(),
        "x-csrf-token": user.csrfToken,
      },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("non-admin user cannot disconnect (returns 403)", async () => {
    // First connect as admin
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    // Then try to disconnect as non-admin
    const user = await authenticateAsUser(app);
    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: user.toString(),
        "x-csrf-token": user.csrfToken,
      },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("CSRF token required for connect", async () => {
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: { cookie: admin.toString() },
      // No x-csrf-token header
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("CSRF token required for disconnect", async () => {
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: { cookie: admin.toString() },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("connect is idempotent (double-connect returns same result)", async () => {
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    const first = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe("connected");

    const second = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("connected");

    // Verify route is still active (not double-toggled)
    const routeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const watchedRoute = routeRes.json().input_routes.find((r: any) => r.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("active");

    await app.close();
  });

  it("disconnect is idempotent (double-disconnect returns same result)", async () => {
    // Start with connected state
    await seedGmailConnectionConnected(ctx.connectionStore);
    // Remove the not_connected one that was seeded in beforeEach — rebuild
    ctx.connectionStore = new InMemoryConnectionStore();
    await seedGmailConnectionConnected(ctx.connectionStore);
    ctx.services = {
      ...ctx.services,
      connectionService: new ConnectionService({ store: ctx.connectionStore }),
    };

    // Also update the route to active since Gmail is connected
    ctx.inputRouteStore = new InMemoryInputRouteStore();
    await seedInputRoutesWithActiveWatchedInbox(ctx.inputRouteStore);
    ctx.services = {
      ...ctx.services,
      inputRouteService: new InputRouteService({ store: ctx.inputRouteStore }),
    };

    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    const first = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().status).toBe("not_connected");

    const second = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().status).toBe("not_connected");

    // Verify route is still suggested (not double-toggled)
    const routeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const watchedRoute = routeRes.json().input_routes.find((r: any) => r.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("suggested");

    await app.close();
  });
});

// ===========================================================================
// SCENARIO 3: Route state consistency
// ===========================================================================

describe("Gmail connect E2E: route state consistency", () => {
  let ctx: TestAppContext;

  beforeEach(async () => {
    ctx = createTestServices();
    const workerStore = new InMemoryWorkerStore();
    await seedWorkers(workerStore);
    await seedGmailConnectionNotConnected(ctx.connectionStore);
    await seedInputRoutesWithSuggestedWatchedInbox(ctx.inputRouteStore);

    ctx.services = {
      ...ctx.services,
      workerService: new WorkerService({ store: workerStore }),
    };
  });

  it("after connect: watched_inbox routes for attached workers become active", async () => {
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    const routeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const routes = routeRes.json().input_routes;
    const watchedRoute = routes.find((r: any) => r.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("active");

    await app.close();
  });

  it("after disconnect: watched_inbox routes become suggested (NOT inactive)", async () => {
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    // Connect first
    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    // Then disconnect
    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    const routeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const routes = routeRes.json().input_routes;
    const watchedRoute = routes.find((r: any) => r.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("suggested");
    // Explicitly NOT "inactive"
    expect(watchedRoute.status).not.toBe("inactive");

    await app.close();
  });

  it("forward_email routes are NOT affected by Gmail connect/disconnect", async () => {
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    // Check forward_email route before
    const beforeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const forwardBefore = beforeRes.json().input_routes.find((r: any) => r.kind === "forward_email");
    expect(forwardBefore.status).toBe("active");

    // Connect Gmail
    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    // Check forward_email route after connect
    const afterConnectRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const forwardAfterConnect = afterConnectRes.json().input_routes.find((r: any) => r.kind === "forward_email");
    expect(forwardAfterConnect.status).toBe("active");

    // Disconnect Gmail
    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    // Check forward_email route after disconnect
    const afterDisconnectRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const forwardAfterDisconnect = afterDisconnectRes.json().input_routes.find((r: any) => r.kind === "forward_email");
    expect(forwardAfterDisconnect.status).toBe("active");

    await app.close();
  });

  it("chat routes are NOT affected by Gmail connect/disconnect", async () => {
    const app = await createApp(ctx);
    const admin = await authenticateAsAdmin(app);

    // Check chat route before
    const beforeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const chatBefore = beforeRes.json().input_routes.find((r: any) => r.kind === "chat");
    expect(chatBefore.status).toBe("active");

    // Connect Gmail
    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    // Check chat route after connect
    const afterConnectRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const chatAfterConnect = afterConnectRes.json().input_routes.find((r: any) => r.kind === "chat");
    expect(chatAfterConnect.status).toBe("active");

    // Disconnect Gmail
    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: admin.toString(),
        "x-csrf-token": admin.csrfToken,
      },
    });

    // Check chat route after disconnect
    const afterDisconnectRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes",
      headers: { cookie: admin.toString() },
    });
    const chatAfterDisconnect = afterDisconnectRes.json().input_routes.find((r: any) => r.kind === "chat");
    expect(chatAfterDisconnect.status).toBe("active");

    await app.close();
  });
});
