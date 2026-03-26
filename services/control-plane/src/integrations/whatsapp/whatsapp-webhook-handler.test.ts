import { describe, it, expect, vi } from "vitest";
import { WhatsAppWebhookHandler } from "./whatsapp-webhook-handler.js";
import type { WhatsAppWebhookPayload } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHandler(overrides?: {
  verifyToken?: string;
  appSecret?: string;
  resolveResult?: unknown;
}) {
  const resolveWhatsAppAction = vi.fn().mockResolvedValue(
    overrides?.resolveResult ?? {
      review: { id: "rev_01", status: "approved" },
      decision: null,
      alreadyResolved: false,
    },
  );

  const handler = new WhatsAppWebhookHandler(
    {
      verifyToken: overrides?.verifyToken ?? "test-verify-token",
      appSecret: overrides?.appSecret,
    },
    { resolveWhatsAppAction } as any,
  );

  return { handler, resolveWhatsAppAction };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WhatsAppWebhookHandler", () => {
  describe("verifyWebhook", () => {
    it("accepts valid verification request", () => {
      const { handler } = makeHandler();
      const result = handler.verifyWebhook({
        "hub.mode": "subscribe",
        "hub.verify_token": "test-verify-token",
        "hub.challenge": "challenge-123",
      });

      expect(result.status).toBe(200);
      expect(result.body).toBe("challenge-123");
    });

    it("rejects wrong verify token", () => {
      const { handler } = makeHandler();
      const result = handler.verifyWebhook({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-123",
      });

      expect(result.status).toBe(403);
    });

    it("rejects non-subscribe mode", () => {
      const { handler } = makeHandler();
      const result = handler.verifyWebhook({
        "hub.mode": "unsubscribe",
        "hub.verify_token": "test-verify-token",
        "hub.challenge": "challenge-123",
      });

      expect(result.status).toBe(403);
    });
  });

  describe("verifySignature", () => {
    it("returns true when no app secret is configured", () => {
      const { handler } = makeHandler();
      const result = handler.verifySignature("{}", undefined);
      expect(result).toBe(true);
    });

    it("returns false when signature is missing but app secret is set", () => {
      const { handler } = makeHandler({ appSecret: "test-secret" });
      const result = handler.verifySignature("{}", undefined);
      expect(result).toBe(false);
    });
  });

  describe("processWebhook", () => {
    it("processes interactive button reply", async () => {
      const { handler, resolveWhatsAppAction } = makeHandler();

      const payload: WhatsAppWebhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "entry-1",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "15551234567",
                      id: "msg_001",
                      timestamp: "1234567890",
                      type: "interactive",
                      interactive: {
                        type: "button_reply",
                        button_reply: {
                          id: "approve:signed-token-here",
                          title: "Approve",
                        },
                      },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const result = await handler.processWebhook(payload);

      expect(result.processed).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.errors).toHaveLength(0);

      expect(resolveWhatsAppAction).toHaveBeenCalledWith({
        approvalToken: "signed-token-here",
        actorIdentity: "15551234567",
        rationale: null,
        interactionId: "msg_001",
      });
    });

    it("skips non-interactive messages", async () => {
      const { handler, resolveWhatsAppAction } = makeHandler();

      const payload: WhatsAppWebhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "entry-1",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "15551234567",
                      id: "msg_002",
                      timestamp: "1234567890",
                      type: "text",
                      text: { body: "hello" },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const result = await handler.processWebhook(payload);

      expect(result.processed).toBe(0);
      expect(result.skipped).toBe(1);
      expect(resolveWhatsAppAction).not.toHaveBeenCalled();
    });

    it("skips non-whatsapp objects", async () => {
      const { handler } = makeHandler();

      const payload: WhatsAppWebhookPayload = {
        object: "page",
      };

      const result = await handler.processWebhook(payload);
      expect(result.skipped).toBe(1);
    });

    it("handles deny button reply", async () => {
      const { handler, resolveWhatsAppAction } = makeHandler();

      const payload: WhatsAppWebhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "entry-1",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "+15551234567",
                      id: "msg_003",
                      timestamp: "1234567890",
                      type: "interactive",
                      interactive: {
                        type: "button_reply",
                        button_reply: {
                          id: "deny:deny-token-here",
                          title: "Deny",
                        },
                      },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const result = await handler.processWebhook(payload);

      expect(result.processed).toBe(1);
      // Phone number should be normalized (strip leading +)
      expect(resolveWhatsAppAction).toHaveBeenCalledWith({
        approvalToken: "deny-token-here",
        actorIdentity: "15551234567",
        rationale: null,
        interactionId: "msg_003",
      });
    });

    it("records errors when resolve fails", async () => {
      const resolveWhatsAppAction = vi.fn().mockRejectedValue(
        new Error("Token expired"),
      );

      const handler = new WhatsAppWebhookHandler(
        { verifyToken: "test" },
        { resolveWhatsAppAction } as any,
      );

      const payload: WhatsAppWebhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "entry-1",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  messages: [
                    {
                      from: "15551234567",
                      id: "msg_004",
                      timestamp: "1234567890",
                      type: "interactive",
                      interactive: {
                        type: "button_reply",
                        button_reply: {
                          id: "approve:expired-token",
                          title: "Approve",
                        },
                      },
                    },
                  ],
                },
                field: "messages",
              },
            ],
          },
        ],
      };

      const result = await handler.processWebhook(payload);

      expect(result.processed).toBe(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.messageId).toBe("msg_004");
      expect(result.errors[0]!.error).toBe("Token expired");
    });
  });
});
