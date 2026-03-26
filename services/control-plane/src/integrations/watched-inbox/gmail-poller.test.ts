import { beforeEach, describe, expect, it } from "vitest";

import { ConnectionService } from "../../connections/service.js";
import type { ConnectionStore, StoredConnection } from "../../connections/types.js";
import type { StoredInputRoute, InputRouteStore } from "../../input-routes/types.js";
import { GmailWatchHookService } from "./gmail-hook.js";
import { GmailPollingService } from "./gmail-poller.js";
import type { WatchedInboxPayload, WatchedInboxResult } from "./types.js";

class MemoryConnectionStore implements ConnectionStore {
  readonly items: StoredConnection[] = [];

  async listAll() {
    return this.items;
  }

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((item) => item.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.id === id) ?? null;
  }

  async create(input: StoredConnection) {
    this.items.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredConnection>) {
    const existing = this.items.find((item) => item.id === id);
    if (!existing) {
      throw new Error("not found");
    }
    Object.assign(existing, input);
    return existing;
  }

  async remove(id: string) {
    const index = this.items.findIndex((item) => item.id === id);
    if (index >= 0) {
      this.items.splice(index, 1);
    }
  }
}

class MemoryInputRouteStore implements InputRouteStore {
  readonly routes: StoredInputRoute[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.routes.filter((route) => route.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.routes.find((route) => route.workspaceId === workspaceId && route.id === id) ?? null;
  }

  async create(input: StoredInputRoute) {
    this.routes.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredInputRoute>) {
    const existing = this.routes.find((route) => route.id === id);
    if (!existing) {
      throw new Error("not found");
    }
    Object.assign(existing, input);
    return existing;
  }
}

class FakeWatchedInboxProcessor {
  readonly payloads: WatchedInboxPayload[] = [];

  async processWatchedInboxEvent(payload: WatchedInboxPayload): Promise<WatchedInboxResult> {
    this.payloads.push(payload);
    return {
      source_event_id: `src_${this.payloads.length}`,
      work_item_id: `wi_${this.payloads.length}`,
      inbox_item_id: `inb_${this.payloads.length}`,
      activity_event_id: `evt_${this.payloads.length}`,
      worker_id: payload.worker_id,
      workspace_id: payload.workspace_id,
      deduplicated: false,
    };
  }
}

function buildConnection(configJson: Record<string, unknown>): StoredConnection {
  return {
    id: "conn_gmail_01",
    workspaceId: "ws_1",
    provider: "gmail",
    accessMode: "read_only",
    status: "connected",
    label: "Gmail — otto@example.com",
    capabilities: ["read_threads", "watch_inbox"],
    attachedWorkerIds: ["wkr_followup_01"],
    configJson,
    createdAt: new Date("2026-03-22T12:00:00Z"),
    updatedAt: new Date("2026-03-22T12:00:00Z"),
  };
}

function buildFetchStub(resolver: (url: string, init?: RequestInit) => Response | Promise<Response>): typeof fetch {
  return (async (input: string | URL | { url: string }, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return await resolver(url, init);
  }) as typeof fetch;
}

describe("GmailPollingService", () => {
  let connectionStore: MemoryConnectionStore;
  let routeStore: MemoryInputRouteStore;
  let connectionService: ConnectionService;
  let watchedInboxProcessor: FakeWatchedInboxProcessor;
  let gmailWatchHookService: GmailWatchHookService;

  beforeEach(() => {
    connectionStore = new MemoryConnectionStore();
    routeStore = new MemoryInputRouteStore();
    connectionService = new ConnectionService({ store: connectionStore });
    watchedInboxProcessor = new FakeWatchedInboxProcessor();
    gmailWatchHookService = new GmailWatchHookService({
      watchedInboxService: watchedInboxProcessor,
    });

    routeStore.routes.push({
      id: "rte_watch_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "watched_inbox",
      status: "active",
      label: "Watched inbox",
      description: null,
      address: null,
      capabilityNote: null,
      createdAt: new Date("2026-03-22T12:00:00Z"),
      updatedAt: new Date("2026-03-22T12:00:00Z"),
    });
  });

  it("bootstraps the first Gmail poll without backfilling older mail", async () => {
    connectionStore.items.push(buildConnection({
      authMethod: "oauth",
      scopeKind: "shared_mailbox",
      mailboxAddresses: ["otto@example.com"],
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      serviceAccountEmail: "",
      serviceAccountPrivateKey: "",
      targetMailbox: "",
      oauthAppClientId: "",
      oauthAppClientSecret: "",
      validatedEmail: "otto@example.com",
      lastValidatedAt: "2026-03-22T12:00:00Z",
      lastError: null,
      watchStatus: "idle",
      watchLastCheckedAt: null,
      watchLastSuccessAt: null,
      watchLastMessageAt: null,
      watchLastError: null,
      watchCheckpointHistoryId: null,
    }));

    const service = new GmailPollingService({
      connectionService,
      inputRouteStore: routeStore,
      gmailWatchHookService,
      enabled: false,
      fetchImpl: buildFetchStub((url) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "token-1" }), { status: 200 });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
          return new Response(JSON.stringify({
            emailAddress: "otto@example.com",
            historyId: "200",
          }), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await service.pollConnection("ws_1", "conn_gmail_01");

    expect(result.bootstrapped).toBe(true);
    expect(result.processed_messages).toBe(0);
    expect(result.created_results).toBe(0);
    expect(watchedInboxProcessor.payloads).toHaveLength(0);
    expect((connectionStore.items[0]?.configJson as Record<string, unknown>).watchCheckpointHistoryId).toBe("200");
  });

  it("processes newly added inbox messages into the watched-inbox flow", async () => {
    connectionStore.items.push(buildConnection({
      authMethod: "oauth",
      scopeKind: "shared_mailbox",
      mailboxAddresses: ["otto@example.com"],
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      serviceAccountEmail: "",
      serviceAccountPrivateKey: "",
      targetMailbox: "",
      oauthAppClientId: "",
      oauthAppClientSecret: "",
      validatedEmail: "otto@example.com",
      lastValidatedAt: "2026-03-22T12:00:00Z",
      lastError: null,
      watchStatus: "bootstrapping",
      watchLastCheckedAt: "2026-03-22T12:00:00Z",
      watchLastSuccessAt: "2026-03-22T12:00:00Z",
      watchLastMessageAt: null,
      watchLastError: null,
      watchCheckpointHistoryId: "200",
    }));

    const service = new GmailPollingService({
      connectionService,
      inputRouteStore: routeStore,
      gmailWatchHookService,
      enabled: false,
      fetchImpl: buildFetchStub((url) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "token-1" }), { status: 200 });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
          return new Response(JSON.stringify({
            emailAddress: "otto@example.com",
            historyId: "205",
          }), { status: 200 });
        }
        if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/history?")) {
          return new Response(JSON.stringify({
            historyId: "205",
            history: [
              {
                messagesAdded: [
                  { message: { id: "msg_1" } },
                ],
              },
            ],
          }), { status: 200 });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_1?format=full") {
          return new Response(JSON.stringify({
            id: "msg_1",
            snippet: "Can we move this forward?",
            internalDate: "1765000000000",
            labelIds: ["INBOX", "CATEGORY_PERSONAL"],
            payload: {
              mimeType: "multipart/alternative",
              headers: [
                { name: "From", value: "Sarah Client <sarah@example.com>" },
                { name: "Subject", value: "Renewal next steps" },
              ],
              parts: [
                {
                  mimeType: "text/plain",
                  body: {
                    data: Buffer.from("Can we move this forward by Friday?", "utf8")
                      .toString("base64")
                      .replace(/\+/g, "-")
                      .replace(/\//g, "_")
                      .replace(/=+$/g, ""),
                  },
                },
              ],
            },
          }), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await service.pollConnection("ws_1", "conn_gmail_01");

    expect(result.bootstrapped).toBe(false);
    expect(result.processed_messages).toBe(1);
    expect(result.created_results).toBe(1);
    expect(watchedInboxProcessor.payloads).toHaveLength(1);
    expect(watchedInboxProcessor.payloads[0]?.subject).toBe("Renewal next steps");
    expect(watchedInboxProcessor.payloads[0]?.from).toContain("sarah@example.com");
    expect((connectionStore.items[0]?.configJson as Record<string, unknown>).watchCheckpointHistoryId).toBe("205");
  });

  it("processes a message when Gmail later adds the INBOX label", async () => {
    connectionStore.items.push(buildConnection({
      authMethod: "oauth",
      scopeKind: "shared_mailbox",
      mailboxAddresses: ["otto@example.com"],
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      serviceAccountEmail: "",
      serviceAccountPrivateKey: "",
      targetMailbox: "",
      oauthAppClientId: "",
      oauthAppClientSecret: "",
      validatedEmail: "otto@example.com",
      lastValidatedAt: "2026-03-22T12:00:00Z",
      lastError: null,
      watchStatus: "polling",
      watchLastCheckedAt: "2026-03-22T12:00:00Z",
      watchLastSuccessAt: "2026-03-22T12:00:00Z",
      watchLastMessageAt: null,
      watchLastError: null,
      watchCheckpointHistoryId: "205",
    }));

    const service = new GmailPollingService({
      connectionService,
      inputRouteStore: routeStore,
      gmailWatchHookService,
      enabled: false,
      fetchImpl: buildFetchStub((url) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "token-1" }), { status: 200 });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
          return new Response(JSON.stringify({
            emailAddress: "otto@example.com",
            historyId: "206",
          }), { status: 200 });
        }
        if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/history?")) {
          return new Response(JSON.stringify({
            historyId: "206",
            history: [
              {
                labelsAdded: [
                  { message: { id: "msg_spam" }, labelIds: ["INBOX"] },
                ],
              },
            ],
          }), { status: 200 });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/messages/msg_spam?format=full") {
          return new Response(JSON.stringify({
            id: "msg_spam",
            snippet: "This was rescued from spam.",
            internalDate: "1765000000000",
            labelIds: ["INBOX", "UNREAD"],
            payload: {
              mimeType: "text/plain",
              headers: [
                { name: "From", value: "friend@example.com" },
                { name: "Subject", value: "Moved into inbox" },
              ],
              body: {
                data: Buffer.from("This was rescued from spam.", "utf8")
                  .toString("base64")
                  .replace(/\+/g, "-")
                  .replace(/\//g, "_")
                  .replace(/=+$/g, ""),
              },
            },
          }), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await service.pollConnection("ws_1", "conn_gmail_01");

    expect(result.processed_messages).toBe(1);
    expect(result.created_results).toBe(1);
    expect(watchedInboxProcessor.payloads).toHaveLength(1);
    expect(watchedInboxProcessor.payloads[0]?.subject).toBe("Moved into inbox");
  });

  it("resets an expired Gmail history checkpoint instead of failing the operator flow", async () => {
    connectionStore.items.push(buildConnection({
      authMethod: "oauth",
      scopeKind: "shared_mailbox",
      mailboxAddresses: ["otto@example.com"],
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      serviceAccountEmail: "",
      serviceAccountPrivateKey: "",
      targetMailbox: "",
      oauthAppClientId: "",
      oauthAppClientSecret: "",
      validatedEmail: "otto@example.com",
      lastValidatedAt: "2026-03-22T12:00:00Z",
      lastError: null,
      watchStatus: "polling",
      watchLastCheckedAt: "2026-03-22T12:00:00Z",
      watchLastSuccessAt: "2026-03-22T12:00:00Z",
      watchLastMessageAt: null,
      watchLastError: null,
      watchCheckpointHistoryId: "100",
    }));

    const service = new GmailPollingService({
      connectionService,
      inputRouteStore: routeStore,
      gmailWatchHookService,
      enabled: false,
      fetchImpl: buildFetchStub((url) => {
        if (url === "https://oauth2.googleapis.com/token") {
          return new Response(JSON.stringify({ access_token: "token-1" }), { status: 200 });
        }
        if (url === "https://gmail.googleapis.com/gmail/v1/users/me/profile") {
          return new Response(JSON.stringify({
            emailAddress: "otto@example.com",
            historyId: "500",
          }), { status: 200 });
        }
        if (url.startsWith("https://gmail.googleapis.com/gmail/v1/users/me/history?")) {
          return new Response(JSON.stringify({
            error: { message: "Requested entity was not found." },
          }), { status: 404 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      }),
    });

    const result = await service.pollConnection("ws_1", "conn_gmail_01");

    expect(result.bootstrapped).toBe(true);
    expect(result.processed_messages).toBe(0);
    expect((connectionStore.items[0]?.configJson as Record<string, unknown>).watchCheckpointHistoryId).toBe("500");
  });
});
