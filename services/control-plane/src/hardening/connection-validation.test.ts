import { beforeEach, describe, expect, it } from "vitest";

import {
  WatchedInboxService,
  WatchedInboxRouteNotFoundError,
  WatchedInboxWorkerNotFoundError,
  GmailConnectionNotReadyError,
} from "../integrations/watched-inbox/service.js";
import type {
  WatchedInboxPayload,
  WatchedInboxRouteLookup,
  InputRouteForWatchedInbox,
  ConnectionLookup,
  ConnectionForValidation,
  SourceEventStore,
  StoredSourceEvent,
  WorkerLookup,
  WorkerSummary,
} from "../integrations/watched-inbox/types.js";

import { ConnectionService } from "../connections/service.js";
import type { StoredConnection, ConnectionStore } from "../connections/types.js";

// ---------------------------------------------------------------------------
// In-memory test doubles
// ---------------------------------------------------------------------------

class MemorySourceEventStore implements SourceEventStore {
  events: StoredSourceEvent[] = [];
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

function makePayload(overrides?: Partial<WatchedInboxPayload>): WatchedInboxPayload {
  return {
    external_message_id: "gmail-hist-001",
    worker_id: WORKER_ID,
    workspace_id: WS,
    from: "sarah@acme.com",
    subject: "Re: Q3 renewal",
    body_text: "Following up on renewal...",
    ...overrides,
  };
}

function makeValidWorker(): WorkerSummary {
  return {
    id: WORKER_ID,
    workspaceId: WS,
    slug: "follow-up",
    name: "Follow-Up",
    kind: "follow_up",
    assigneeIds: ["usr_dave"],
    reviewerIds: ["usr_dave"],
  };
}

function makeActiveRoute(): InputRouteForWatchedInbox {
  return {
    id: "rte_watch",
    workspaceId: WS,
    workerId: WORKER_ID,
    kind: "watched_inbox",
    status: "active",
  };
}

function makeConnectedGmail(): ConnectionForValidation {
  return {
    id: "conn_gmail",
    provider: "gmail",
    accessMode: "read_only",
    status: "connected",
  };
}

// Stub services that just track calls
function makeFakeDownstream() {
  return {
    workItemService: {
      create: async () => ({ id: "wi_stub" }),
    },
    inboxItemService: {
      create: async () => ({ id: "inb_stub" }),
    },
    activityService: {
      append: async () => ({ id: "evt_stub" }),
    },
  };
}

// ---------------------------------------------------------------------------
// Watched inbox connection validation
// ---------------------------------------------------------------------------

describe("Connection validation: watched inbox rejects when no Gmail connection exists", () => {
  it("throws GmailConnectionNotReadyError when no connection at all", async () => {
    const workerLookup = new MemoryWorkerLookup();
    workerLookup.workers.push(makeValidWorker());
    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push(makeActiveRoute());
    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connection = null; // no connection

    const service = new WatchedInboxService({
      sourceEventStore: new MemorySourceEventStore(),
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      ...makeFakeDownstream(),
      now: () => NOW,
    });

    await expect(service.processWatchedInboxEvent(makePayload())).rejects.toThrow(
      GmailConnectionNotReadyError,
    );
  });
});

describe("Connection validation: watched inbox rejects when Gmail is not connected", () => {
  it("throws GmailConnectionNotReadyError when status is not_connected", async () => {
    const workerLookup = new MemoryWorkerLookup();
    workerLookup.workers.push(makeValidWorker());
    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push(makeActiveRoute());
    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connection = {
      ...makeConnectedGmail(),
      status: "not_connected",
    };

    const service = new WatchedInboxService({
      sourceEventStore: new MemorySourceEventStore(),
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      ...makeFakeDownstream(),
      now: () => NOW,
    });

    await expect(service.processWatchedInboxEvent(makePayload())).rejects.toThrow(
      GmailConnectionNotReadyError,
    );
  });

  it("throws GmailConnectionNotReadyError when status is error", async () => {
    const workerLookup = new MemoryWorkerLookup();
    workerLookup.workers.push(makeValidWorker());
    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push(makeActiveRoute());
    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connection = {
      ...makeConnectedGmail(),
      status: "error",
    };

    const service = new WatchedInboxService({
      sourceEventStore: new MemorySourceEventStore(),
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      ...makeFakeDownstream(),
      now: () => NOW,
    });

    await expect(service.processWatchedInboxEvent(makePayload())).rejects.toThrow(
      GmailConnectionNotReadyError,
    );
  });
});

describe("Connection validation: watched inbox rejects when no active route", () => {
  it("throws WatchedInboxRouteNotFoundError when no route exists", async () => {
    const workerLookup = new MemoryWorkerLookup();
    workerLookup.workers.push(makeValidWorker());
    const routeLookup = new MemoryWatchedInboxRouteLookup();
    // No routes at all
    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connection = makeConnectedGmail();

    const service = new WatchedInboxService({
      sourceEventStore: new MemorySourceEventStore(),
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      ...makeFakeDownstream(),
      now: () => NOW,
    });

    await expect(service.processWatchedInboxEvent(makePayload())).rejects.toThrow(
      WatchedInboxRouteNotFoundError,
    );
  });

  it("throws WatchedInboxRouteNotFoundError when route is inactive", async () => {
    const workerLookup = new MemoryWorkerLookup();
    workerLookup.workers.push(makeValidWorker());
    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push({ ...makeActiveRoute(), status: "inactive" });
    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connection = makeConnectedGmail();

    const service = new WatchedInboxService({
      sourceEventStore: new MemorySourceEventStore(),
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      ...makeFakeDownstream(),
      now: () => NOW,
    });

    await expect(service.processWatchedInboxEvent(makePayload())).rejects.toThrow(
      WatchedInboxRouteNotFoundError,
    );
  });

  it("throws WatchedInboxWorkerNotFoundError when worker is missing", async () => {
    const workerLookup = new MemoryWorkerLookup();
    // No worker registered
    const routeLookup = new MemoryWatchedInboxRouteLookup();
    routeLookup.routes.push(makeActiveRoute());
    const connectionLookup = new MemoryConnectionLookup();
    connectionLookup.connection = makeConnectedGmail();

    const service = new WatchedInboxService({
      sourceEventStore: new MemorySourceEventStore(),
      watchedInboxRouteLookup: routeLookup,
      connectionLookup,
      workerLookup,
      ...makeFakeDownstream(),
      now: () => NOW,
    });

    await expect(service.processWatchedInboxEvent(makePayload())).rejects.toThrow(
      WatchedInboxWorkerNotFoundError,
    );
  });
});

// ---------------------------------------------------------------------------
// Connection status transitions
// ---------------------------------------------------------------------------

describe("Connection state transitions: not_connected → connected → not_connected", () => {
  let connectionService: ConnectionService;

  beforeEach(async () => {
    const store = new MemoryConnectionStore();
    connectionService = new ConnectionService({ store, now: () => NOW });

    await connectionService.create(WS, {
      provider: "gmail",
      accessMode: "read_only",
      label: "Gmail (read-only)",
      capabilities: ["read_threads"],
    });
  });

  it("creates connection in not_connected state", async () => {
    const { connections } = await connectionService.list(WS);
    expect(connections).toHaveLength(1);
    expect(connections[0]!.status).toBe("not_connected");
  });

  it("transitions not_connected → connected", async () => {
    const { connections } = await connectionService.list(WS);
    const id = connections[0]!.id;

    const updated = await connectionService.update(WS, id, { status: "connected" });
    expect(updated.status).toBe("connected");
  });

  it("transitions connected → not_connected", async () => {
    const { connections } = await connectionService.list(WS);
    const id = connections[0]!.id;

    await connectionService.update(WS, id, { status: "connected" });
    const disconnected = await connectionService.update(WS, id, { status: "not_connected" });
    expect(disconnected.status).toBe("not_connected");
  });

  it("transitions connected → error", async () => {
    const { connections } = await connectionService.list(WS);
    const id = connections[0]!.id;

    await connectionService.update(WS, id, { status: "connected" });
    const errored = await connectionService.update(WS, id, { status: "error" });
    expect(errored.status).toBe("error");
  });

  it("full lifecycle: not_connected → connected → error → not_connected → connected", async () => {
    const { connections } = await connectionService.list(WS);
    const id = connections[0]!.id;

    await connectionService.update(WS, id, { status: "connected" });
    await connectionService.update(WS, id, { status: "error" });
    await connectionService.update(WS, id, { status: "not_connected" });
    const final = await connectionService.update(WS, id, { status: "connected" });
    expect(final.status).toBe("connected");
  });
});
