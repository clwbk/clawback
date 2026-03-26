import { beforeEach, describe, expect, it } from "vitest";

import { AuthServiceError, type AuthServiceContract, type SessionContext } from "@clawback/auth";

import { createControlPlaneApp } from "../app.js";
import type { WorkspaceReadModelServices } from "../workspace-routes.js";
import { WorkerService } from "../workers/index.js";
import { WorkItemService } from "../work-items/index.js";
import { InboxItemService } from "../inbox/index.js";
import { ReviewService } from "../reviews/index.js";
import { ActivityService } from "../activity/index.js";
import { ConnectionService } from "../connections/index.js";

import type { StoredWorker, WorkerStore } from "../workers/types.js";
import type { StoredWorkItem, WorkItemStore } from "../work-items/types.js";
import type { StoredInboxItem, InboxItemStore } from "../inbox/types.js";
import type { StoredReview, ReviewStore } from "../reviews/types.js";
import type { StoredActivityEvent, ActivityEventStore } from "../activity/types.js";
import type { StoredConnection, ConnectionStore } from "../connections/types.js";

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
  async list(workspaceId: string) { return this.items.filter((w) => w.workspaceId === workspaceId); }
  async findById(workspaceId: string, id: string) { return this.items.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null; }
  async findBySlug(workspaceId: string, slug: string) { return this.items.find((w) => w.workspaceId === workspaceId && w.slug === slug) ?? null; }
  async create(input: StoredWorker) { this.items.push(input); return input; }
  async update(id: string, input: Partial<StoredWorker>) {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) { this.items = this.items.filter((w) => w.id !== id); }
}

class InMemoryWorkItemStore implements WorkItemStore {
  private items: StoredWorkItem[] = [];
  async listByWorkspace(workspaceId: string) { return this.items.filter((w) => w.workspaceId === workspaceId); }
  async listByWorker(workerId: string) { return this.items.filter((w) => w.workerId === workerId); }
  async findById(workspaceId: string, id: string) { return this.items.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null; }
  async create(input: StoredWorkItem) { this.items.push(input); return input; }
  async update(id: string, input: Partial<StoredWorkItem>) {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) { this.items = this.items.filter((w) => w.id !== id); }
}

class InMemoryInboxItemStore implements InboxItemStore {
  private items: StoredInboxItem[] = [];
  async listByWorkspace(workspaceId: string) { return this.items.filter((i) => i.workspaceId === workspaceId); }
  async listOpen(workspaceId: string) { return this.items.filter((i) => i.workspaceId === workspaceId && i.state === "open"); }
  async findById(workspaceId: string, id: string) { return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null; }
  async findByReviewId(workspaceId: string, reviewId: string) { return this.items.find((i) => i.workspaceId === workspaceId && i.reviewId === reviewId) ?? null; }
  async create(input: StoredInboxItem) { this.items.push(input); return input; }
  async update(id: string, input: Partial<StoredInboxItem>) {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) { this.items = this.items.filter((i) => i.id !== id); }
}

class InMemoryReviewStore implements ReviewStore {
  private items: StoredReview[] = [];
  async listByWorkspace(workspaceId: string) { return this.items.filter((r) => r.workspaceId === workspaceId); }
  async listPending(workspaceId: string) { return this.items.filter((r) => r.workspaceId === workspaceId && r.status === "pending"); }
  async findById(workspaceId: string, id: string) { return this.items.find((r) => r.workspaceId === workspaceId && r.id === id) ?? null; }
  async create(input: StoredReview) { this.items.push(input); return input; }
  async update(id: string, input: Partial<StoredReview>) {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) { this.items = this.items.filter((r) => r.id !== id); }
}

class InMemoryActivityEventStore implements ActivityEventStore {
  private items: StoredActivityEvent[] = [];
  async listByWorkspace(workspaceId: string, limit?: number) {
    const filtered = this.items
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? filtered.slice(0, limit) : filtered;
  }
  async findByReviewResult(workspaceId: string, reviewId: string, resultKind: string) {
    return this.items.find(
      (e) => e.workspaceId === workspaceId && e.reviewId === reviewId && e.resultKind === resultKind,
    ) ?? null;
  }
  async create(input: StoredActivityEvent) { this.items.push(input); return input; }
}

class InMemoryConnectionStore implements ConnectionStore {
  private items: StoredConnection[] = [];
  async listAll() { return [...this.items]; }
  async listByWorkspace(workspaceId: string) { return this.items.filter((c) => c.workspaceId === workspaceId); }
  async findById(workspaceId: string, id: string) { return this.items.find((c) => c.workspaceId === workspaceId && c.id === id) ?? null; }
  async create(input: StoredConnection) { this.items.push(input); return input; }
  async update(id: string, input: Partial<StoredConnection>) {
    const idx = this.items.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) { this.items = this.items.filter((c) => c.id !== id); }
}

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-18T10:00:00Z");

function seedReview(store: InMemoryReviewStore) {
  return store.create({
    id: "rev_01",
    workspaceId: "ws_1",
    actionKind: "send_email",
    status: "pending",
    workerId: "wkr_01",
    workItemId: null,
    reviewerIds: ["usr_admin"],
    assigneeIds: ["usr_admin"],
    sourceRouteKind: "forward_email",
    actionDestination: "sarah@acme.com",
    requestedAt: NOW,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("API boundaries: authentication required", () => {
  let fakeAuthService: FakeAuthService;
  let services: WorkspaceReadModelServices;
  let reviewStore: InMemoryReviewStore;

  beforeEach(() => {
    fakeAuthService = new FakeAuthService();
    reviewStore = new InMemoryReviewStore();

    services = {
      workerService: new WorkerService({ store: new InMemoryWorkerStore() }),
      workItemService: new WorkItemService({ store: new InMemoryWorkItemStore() }),
      inboxItemService: new InboxItemService({ store: new InMemoryInboxItemStore() }),
      reviewService: new ReviewService({ store: reviewStore }),
      activityService: new ActivityService({ store: new InMemoryActivityEventStore() }),
      connectionService: new ConnectionService({ store: new InMemoryConnectionStore() }),
    };
  });

  async function createApp() {
    return createControlPlaneApp({
      authService: fakeAuthService,
      workspaceReadModelServices: services,
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

  // -----------------------------------------------------------------------
  // All workspace routes return 401 without auth
  // -----------------------------------------------------------------------

  const workspaceRoutes = [
    { method: "GET" as const, url: "/api/workspace/today" },
    { method: "GET" as const, url: "/api/workspace/workers" },
    { method: "GET" as const, url: "/api/workspace/workers/wkr_01" },
    { method: "GET" as const, url: "/api/workspace/inbox" },
    { method: "GET" as const, url: "/api/workspace/work" },
    { method: "GET" as const, url: "/api/workspace/work/wi_01" },
    { method: "GET" as const, url: "/api/workspace/connections" },
    { method: "GET" as const, url: "/api/workspace/activity" },
    { method: "GET" as const, url: "/api/workspace/reviews/rev_01" },
  ];

  for (const route of workspaceRoutes) {
    it(`${route.method} ${route.url} returns 401 without auth`, async () => {
      const app = await createApp();

      const res = await app.inject({
        method: route.method,
        url: route.url,
      });

      expect(res.statusCode).toBe(401);
      await app.close();
    });
  }

  // -----------------------------------------------------------------------
  // POST review resolve returns 401 without auth
  // -----------------------------------------------------------------------

  it("POST /api/workspace/reviews/:id/resolve returns 403 without auth (CSRF fires first)", async () => {
    const app = await createApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      payload: { decision: "approved" },
    });

    // CSRF protection fires before auth middleware for POST routes,
    // so we get 403 instead of 401. This is still a valid rejection.
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  // -----------------------------------------------------------------------
  // Review resolve rejects invalid decision values
  // -----------------------------------------------------------------------

  it("review resolve rejects invalid decision value", async () => {
    const app = await createApp();
    const auth = await authenticate(app);
    await seedReview(reviewStore);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: { decision: "maybe" },
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe("invalid_decision");
    await app.close();
  });

  it("review resolve accepts 'approved' decision shape and then enforces domain state", async () => {
    const app = await createApp();
    const auth = await authenticate(app);
    await seedReview(reviewStore);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("review_execution_invalid_state");
    await app.close();
  });

  it("review resolve accepts 'denied' decision", async () => {
    const app = await createApp();
    const auth = await authenticate(app);
    await seedReview(reviewStore);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: auth.cookie,
        "x-csrf-token": auth.csrfToken,
      },
      payload: { decision: "denied" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("denied");
    await app.close();
  });

  // -----------------------------------------------------------------------
  // Workspace scoping
  // -----------------------------------------------------------------------

  it("workspace routes scope to the authenticated workspace", async () => {
    const app = await createApp();
    const auth = await authenticate(app);

    // Workers list should be scoped — empty because nothing seeded for ws_1
    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/workers",
      headers: { cookie: auth.cookie },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().workers).toHaveLength(0);
    await app.close();
  });

  it("review for wrong workspace returns 404", async () => {
    const app = await createApp();
    const auth = await authenticate(app);

    // Create a review in a different workspace
    await reviewStore.create({
      id: "rev_other_ws",
      workspaceId: "ws_other", // NOT ws_1
      actionKind: "send_email",
      status: "pending",
      workerId: "wkr_01",
      workItemId: null,
      reviewerIds: [],
      assigneeIds: [],
      sourceRouteKind: "forward_email",
      actionDestination: "test@test.com",
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_other_ws",
      headers: { cookie: auth.cookie },
    });

    // Should not be able to access review from another workspace
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
