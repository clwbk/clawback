import { describe, expect, it } from "vitest";

import type { StoredConnection } from "../../connections/types.js";
import type { WatchedInboxPayload, WatchedInboxResult } from "./types.js";
import {
  GmailWatchHookProcessingError,
  GmailWatchHookService,
  parseGmailWatchHookPayload,
} from "./gmail-hook.js";

class FakeWatchedInboxProcessor {
  readonly payloads: WatchedInboxPayload[] = [];

  async processWatchedInboxEvent(payload: WatchedInboxPayload): Promise<WatchedInboxResult> {
    this.payloads.push(payload);
    const counter = this.payloads.length;
    return {
      source_event_id: `src_${counter}`,
      work_item_id: `wi_${counter}`,
      inbox_item_id: `inb_${counter}`,
      activity_event_id: `evt_${counter}`,
      worker_id: payload.worker_id,
      workspace_id: payload.workspace_id,
      deduplicated: false,
    };
  }
}

function gmailConnection(overrides?: Partial<StoredConnection>): StoredConnection {
  return {
    id: "conn_gmail_01",
    workspaceId: "ws_1",
    provider: "gmail",
    accessMode: "read_only",
    status: "connected",
    label: "Shared Gmail",
    capabilities: ["read_threads", "watch_inbox"],
    attachedWorkerIds: ["wkr_followup_01", "wkr_proposal_01"],
    configJson: {},
    createdAt: new Date("2026-03-20T12:00:00Z"),
    updatedAt: new Date("2026-03-20T12:00:00Z"),
    ...overrides,
  };
}

describe("parseGmailWatchHookPayload", () => {
  it("parses a gog/OpenClaw gmail hook payload", () => {
    const parsed = parseGmailWatchHookPayload({
      source: "gmail",
      messages: [
        {
          id: "gmail-msg-001",
          from: "client@example.com",
          subject: "Need an update",
          snippet: "Can you send the next draft?",
          body: "Can you send the next draft by Friday?",
        },
      ],
    });

    expect(parsed.messages).toHaveLength(1);
    expect(parsed.messages[0]?.id).toBe("gmail-msg-001");
  });

  it("rejects payloads without messages", () => {
    expect(() => parseGmailWatchHookPayload({ messages: [] })).toThrow(
      GmailWatchHookProcessingError,
    );
  });
});

describe("GmailWatchHookService", () => {
  it("fans out one gmail message to each attached worker with worker-scoped idempotency keys", async () => {
    const watchedInboxProcessor = new FakeWatchedInboxProcessor();
    const service = new GmailWatchHookService({ watchedInboxService: watchedInboxProcessor });

    const result = await service.processConnectionHook(gmailConnection(), {
      source: "gmail",
      messages: [
        {
          id: "gmail-msg-001",
          from: "client@example.com",
          subject: "Need an update",
          snippet: "Can you send the next draft?",
          body: "Can you send the next draft by Friday?",
        },
      ],
    });

    expect(result.processed_messages).toBe(1);
    expect(result.created_results).toHaveLength(2);
    expect(watchedInboxProcessor.payloads.map((payload) => payload.external_message_id)).toEqual([
      "gmail-msg-001:wkr_followup_01",
      "gmail-msg-001:wkr_proposal_01",
    ]);
  });

  it("rejects non-connected or non-gmail connections", async () => {
    const watchedInboxProcessor = new FakeWatchedInboxProcessor();
    const service = new GmailWatchHookService({ watchedInboxService: watchedInboxProcessor });

    await expect(service.processConnectionHook(
      gmailConnection({ status: "not_connected" }),
      { messages: [{ id: "msg_1", from: "x@example.com", subject: "Hi" }] },
    )).rejects.toThrow(GmailWatchHookProcessingError);
  });
});
