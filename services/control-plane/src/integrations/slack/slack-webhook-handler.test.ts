import { describe, it, expect, vi } from "vitest";
import * as crypto from "node:crypto";
import { SlackWebhookHandler } from "./slack-webhook-handler.js";
import type { SlackInteractionPayload } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandler(overrides?: {
  signingSecret?: string;
  resolveResult?: unknown;
}) {
  const resolveSlackAction = vi.fn().mockResolvedValue(
    overrides?.resolveResult ?? {
      review: { id: "rev_01", status: "approved" },
      decision: null,
      alreadyResolved: false,
    },
  );

  const handler = new SlackWebhookHandler(
    {
      signingSecret: overrides?.signingSecret ?? "test-signing-secret",
    },
    { resolveSlackAction } as any,
  );

  return { handler, resolveSlackAction };
}

function generateSlackSignature(
  secret: string,
  timestamp: string,
  body: string,
): string {
  const sigBasestring = `v0:${timestamp}:${body}`;
  const signature = crypto
    .createHmac("sha256", secret)
    .update(sigBasestring)
    .digest("hex");
  return `v0=${signature}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SlackWebhookHandler", () => {
  describe("verifySignature", () => {
    it("accepts valid signature", () => {
      const { handler } = makeHandler({ signingSecret: "test-secret" });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = '{"test":"data"}';
      const signature = generateSlackSignature("test-secret", timestamp, body);

      const result = handler.verifySignature(body, timestamp, signature);
      expect(result).toBe(true);
    });

    it("rejects invalid signature", () => {
      const { handler } = makeHandler({ signingSecret: "test-secret" });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = '{"test":"data"}';

      const result = handler.verifySignature(body, timestamp, "v0=invalidsignature0000000000000000000000000000000000000000000000");
      expect(result).toBe(false);
    });

    it("rejects missing timestamp", () => {
      const { handler } = makeHandler({ signingSecret: "test-secret" });
      const result = handler.verifySignature("{}", undefined, "v0=abc");
      expect(result).toBe(false);
    });

    it("rejects missing signature header", () => {
      const { handler } = makeHandler({ signingSecret: "test-secret" });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const result = handler.verifySignature("{}", timestamp, undefined);
      expect(result).toBe(false);
    });

    it("rejects requests older than 5 minutes", () => {
      const { handler } = makeHandler({ signingSecret: "test-secret" });
      const oldTimestamp = String(Math.floor(Date.now() / 1000) - 60 * 6);
      const body = '{"test":"data"}';
      const signature = generateSlackSignature("test-secret", oldTimestamp, body);

      const result = handler.verifySignature(body, oldTimestamp, signature);
      expect(result).toBe(false);
    });

    it("works with Buffer body", () => {
      const { handler } = makeHandler({ signingSecret: "test-secret" });
      const timestamp = String(Math.floor(Date.now() / 1000));
      const body = '{"test":"data"}';
      const signature = generateSlackSignature("test-secret", timestamp, body);

      const result = handler.verifySignature(Buffer.from(body), timestamp, signature);
      expect(result).toBe(true);
    });
  });

  describe("parsePayload", () => {
    it("parses a JSON payload string", () => {
      const payload = JSON.stringify({
        type: "block_actions",
        user: { id: "U123", username: "testuser" },
        actions: [{ action_id: "clawback_approve", value: "token-here" }],
      });

      const result = SlackWebhookHandler.parsePayload(payload);
      expect(result.type).toBe("block_actions");
      expect(result.user.id).toBe("U123");
      expect(result.actions?.[0]?.value).toBe("token-here");
    });

    it("parses a form-encoded Slack interaction body", () => {
      const payload = JSON.stringify({
        type: "block_actions",
        user: { id: "U123" },
        actions: [{ action_id: "clawback_approve", value: "token-here" }],
      });

      const formBody = `payload=${encodeURIComponent(payload)}`;
      const result = SlackWebhookHandler.parseFormEncodedPayload(formBody);

      expect(result.type).toBe("block_actions");
      expect(result.user.id).toBe("U123");
      expect(result.actions?.[0]?.value).toBe("token-here");
    });
  });

  describe("processInteraction", () => {
    it("processes approve button action", async () => {
      const { handler, resolveSlackAction } = makeHandler();

      const payload: SlackInteractionPayload = {
        type: "block_actions",
        user: { id: "U01234ABC", username: "testuser", name: "Test User" },
        actions: [
          {
            type: "button",
            action_id: "clawback_approve",
            value: "signed-approval-token-here",
          },
        ],
      };

      const result = await handler.processInteraction(payload);

      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(resolveSlackAction).toHaveBeenCalledWith({
        approvalToken: "signed-approval-token-here",
        actorIdentity: "U01234ABC",
        rationale: null,
        interactionId: null,
      });
    });

    it("processes deny button action", async () => {
      const { handler, resolveSlackAction } = makeHandler();

      const payload: SlackInteractionPayload = {
        type: "block_actions",
        user: { id: "U01234ABC", username: "testuser", name: "Test User" },
        actions: [
          {
            type: "button",
            action_id: "clawback_deny",
            value: "signed-deny-token-here",
          },
        ],
      };

      const result = await handler.processInteraction(payload);

      expect(result.processed).toBe(1);
      expect(resolveSlackAction).toHaveBeenCalledWith({
        approvalToken: "signed-deny-token-here",
        actorIdentity: "U01234ABC",
        rationale: null,
        interactionId: null,
      });
    });

    it("skips non-block_actions payloads", async () => {
      const { handler, resolveSlackAction } = makeHandler();

      const payload: SlackInteractionPayload = {
        type: "message_action",
        user: { id: "U01234ABC" },
      };

      const result = await handler.processInteraction(payload);
      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
      expect(resolveSlackAction).not.toHaveBeenCalled();
    });

    it("skips unrecognized action IDs", async () => {
      const { handler, resolveSlackAction } = makeHandler();

      const payload: SlackInteractionPayload = {
        type: "block_actions",
        user: { id: "U01234ABC" },
        actions: [
          {
            type: "button",
            action_id: "some_other_action",
            value: "some-value",
          },
        ],
      };

      const result = await handler.processInteraction(payload);
      expect(result.skipped).toBe(1);
      expect(result.processed).toBe(0);
      expect(resolveSlackAction).not.toHaveBeenCalled();
    });

    it("handles errors when resolve fails", async () => {
      const resolveSlackAction = vi.fn().mockRejectedValue(
        new Error("Token expired"),
      );

      const handler = new SlackWebhookHandler(
        { signingSecret: "test" },
        { resolveSlackAction } as any,
      );

      const payload: SlackInteractionPayload = {
        type: "block_actions",
        user: { id: "U01234ABC" },
        actions: [
          {
            type: "button",
            action_id: "clawback_approve",
            value: "expired-token",
          },
        ],
      };

      const result = await handler.processInteraction(payload);

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.actionId).toBe("clawback_approve");
      expect(result.errors[0]!.error).toBe("Token expired");
    });

    it("reports error when button value is missing", async () => {
      const { handler, resolveSlackAction } = makeHandler();

      const payload: SlackInteractionPayload = {
        type: "block_actions",
        user: { id: "U01234ABC" },
        actions: [
          {
            type: "button",
            action_id: "clawback_approve",
            // value is intentionally missing
          },
        ],
      };

      const result = await handler.processInteraction(payload);

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.error).toContain("missing");
      expect(resolveSlackAction).not.toHaveBeenCalled();
    });

    it("handles empty actions array", async () => {
      const { handler } = makeHandler();

      const payload: SlackInteractionPayload = {
        type: "block_actions",
        user: { id: "U01234ABC" },
        actions: [],
      };

      const result = await handler.processInteraction(payload);
      expect(result.skipped).toBe(1);
    });
  });
});
