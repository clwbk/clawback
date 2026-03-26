import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SlackTransportService } from "./slack-transport-service.js";

// ---------------------------------------------------------------------------
// Mock fetch
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn().mockImplementation(handler);
  return globalThis.fetch as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SlackTransportService", () => {
  describe("testConnection", () => {
    it("returns ok with bot and team names on success", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ ok: true, user: "clawback-bot", team: "Test Workspace" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const transport = new SlackTransportService({
        botToken: "xoxb-test-token",
        defaultChannel: "C01234ABC",
      });

      const result = await transport.testConnection();
      expect(result.ok).toBe(true);
      expect(result.botName).toBe("clawback-bot");
      expect(result.teamName).toBe("Test Workspace");
    });

    it("returns error when auth.test fails", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ ok: false, error: "invalid_auth" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );

      const transport = new SlackTransportService({
        botToken: "xoxb-bad-token",
        defaultChannel: "C01234ABC",
      });

      const result = await transport.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("invalid_auth");
    });

    it("returns error on HTTP failure", async () => {
      mockFetch(async () => new Response("Server Error", { status: 500 }));

      const transport = new SlackTransportService({
        botToken: "xoxb-test-token",
        defaultChannel: "C01234ABC",
      });

      const result = await transport.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("500");
    });

    it("returns error on network failure", async () => {
      mockFetch(async () => {
        throw new Error("Network error");
      });

      const transport = new SlackTransportService({
        botToken: "xoxb-test-token",
        defaultChannel: "C01234ABC",
      });

      const result = await transport.testConnection();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Network error");
    });
  });

  describe("sendApprovalPrompt", () => {
    it("sends Block Kit message with Approve/Deny buttons", async () => {
      const fetchMock = mockFetch(async (url) => {
        if (url.includes("auth.test")) {
          return new Response(JSON.stringify({ ok: true, user: "bot", team: "ws" }));
        }
        return new Response(JSON.stringify({ ok: true, channel: "C01234ABC", ts: "1234.5678" }));
      });

      const transport = new SlackTransportService({
        botToken: "xoxb-test-token",
        defaultChannel: "C01234ABC",
      });

      const review = {
        id: "rev_01",
        workspace_id: "ws_01",
        worker_id: "wkr_01",
        action_kind: "send_email" as const,
        action_destination: "client@example.com",
        status: "pending" as const,
        reviewer_ids: ["usr_01"],
        assignee_ids: [],
        source_route_kind: "watched_inbox" as const,
        work_item_id: null,
        requested_at: "2025-01-15T12:00:00Z",
        resolved_at: null,
        created_at: "2025-01-15T12:00:00Z",
        updated_at: "2025-01-15T12:00:00Z",
      };

      const recipients = [
        {
          userId: "usr_01",
          displayName: "Test User",
          actorIdentity: "U01234ABC",
          approveToken: "approve-token-123",
          denyToken: "deny-token-456",
        },
      ];

      const result = await transport.sendApprovalPrompt(review, recipients);

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify the chat.postMessage call
      const postMessageCall = (fetchMock as any).mock.calls.find(
        (call: any[]) => call[0].includes("chat.postMessage"),
      );
      expect(postMessageCall).toBeDefined();

      const sentBody = JSON.parse(postMessageCall[1].body);
      expect(sentBody.channel).toBe("C01234ABC");
      expect(sentBody.blocks).toBeDefined();

      // Verify action buttons exist
      const actionsBlock = sentBody.blocks.find((b: any) => b.type === "actions");
      expect(actionsBlock).toBeDefined();
      expect(actionsBlock.elements).toHaveLength(2);

      const approveButton = actionsBlock.elements.find(
        (e: any) => e.action_id === "clawback_approve",
      );
      expect(approveButton).toBeDefined();
      expect(approveButton.value).toBe("approve-token-123");

      const denyButton = actionsBlock.elements.find(
        (e: any) => e.action_id === "clawback_deny",
      );
      expect(denyButton).toBeDefined();
      expect(denyButton.value).toBe("deny-token-456");
    });

    it("records errors for failed sends", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ ok: false, error: "channel_not_found" })),
      );

      const transport = new SlackTransportService({
        botToken: "xoxb-test-token",
        defaultChannel: "C01234ABC",
      });

      const review = {
        id: "rev_01",
        workspace_id: "ws_01",
        worker_id: "wkr_01",
        action_kind: "send_email" as const,
        action_destination: null,
        status: "pending" as const,
        reviewer_ids: [],
        assignee_ids: [],
        source_route_kind: "watched_inbox" as const,
        work_item_id: null,
        requested_at: "2025-01-15T12:00:00Z",
        resolved_at: null,
        created_at: "2025-01-15T12:00:00Z",
        updated_at: "2025-01-15T12:00:00Z",
      };

      const recipients = [
        {
          userId: "usr_01",
          displayName: "Test User",
          actorIdentity: "U01234ABC",
          approveToken: "token-a",
          denyToken: "token-d",
        },
      ];

      const result = await transport.sendApprovalPrompt(review, recipients);

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain("channel_not_found");
    });
  });

  describe("sendTestMessage", () => {
    it("sends a test message to the default channel", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ ok: true, channel: "C01234ABC", ts: "1234.5678" })),
      );

      const transport = new SlackTransportService({
        botToken: "xoxb-test-token",
        defaultChannel: "C01234ABC",
      });

      const result = await transport.sendTestMessage();
      expect(result.ok).toBe(true);
    });

    it("returns error on failure", async () => {
      mockFetch(async () =>
        new Response(JSON.stringify({ ok: false, error: "not_in_channel" })),
      );

      const transport = new SlackTransportService({
        botToken: "xoxb-test-token",
        defaultChannel: "C01234ABC",
      });

      const result = await transport.sendTestMessage();
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not_in_channel");
    });
  });
});
