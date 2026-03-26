/**
 * WhatsApp webhook handler for processing inbound callbacks from WhatsApp Cloud API.
 *
 * This handler:
 *   1. Verifies webhook registration (GET /api/webhooks/whatsapp)
 *   2. Processes inbound interactive button responses (POST /api/webhooks/whatsapp)
 *   3. Extracts approval tokens from button reply IDs
 *   4. Delegates to the frozen W1 resolve path (ReviewApprovalSurfaceService)
 *
 * It does NOT modify review authority, idempotency rules, or actor mapping semantics.
 */

import * as crypto from "node:crypto";
import type { ReviewApprovalSurfaceService } from "../../approval-surfaces/review-surface-service.js";
import type { WhatsAppWebhookPayload } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type WhatsAppWebhookConfig = {
  /** The verify token used during webhook registration. */
  verifyToken: string;
  /** The app secret for signature verification. */
  appSecret?: string | undefined;
};

export type WebhookProcessResult = {
  processed: number;
  skipped: number;
  errors: Array<{ messageId: string; error: string }>;
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class WhatsAppWebhookHandler {
  constructor(
    private readonly config: WhatsAppWebhookConfig,
    private readonly reviewApprovalSurfaceService: ReviewApprovalSurfaceService,
  ) {}

  // -------------------------------------------------------------------------
  // Webhook verification (GET)
  // -------------------------------------------------------------------------

  verifyWebhook(query: {
    "hub.mode"?: string | undefined;
    "hub.verify_token"?: string | undefined;
    "hub.challenge"?: string | undefined;
  }): { status: number; body: string } {
    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (mode === "subscribe" && token === this.config.verifyToken) {
      return { status: 200, body: challenge ?? "" };
    }

    return { status: 403, body: "Forbidden" };
  }

  // -------------------------------------------------------------------------
  // Signature verification
  // -------------------------------------------------------------------------

  verifySignature(
    rawBody: string | Buffer,
    signatureHeader: string | undefined,
  ): boolean {
    if (!this.config.appSecret) {
      // If no app secret is configured, skip signature verification
      // but log a warning. In production this should always be set.
      return true;
    }

    if (!signatureHeader) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha256", this.config.appSecret)
      .update(rawBody)
      .digest("hex");

    const providedSignature = signatureHeader.replace("sha256=", "");

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "hex"),
      Buffer.from(providedSignature, "hex"),
    );
  }

  // -------------------------------------------------------------------------
  // Webhook processing (POST)
  // -------------------------------------------------------------------------

  async processWebhook(
    payload: WhatsAppWebhookPayload,
  ): Promise<WebhookProcessResult> {
    const result: WebhookProcessResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    if (payload.object !== "whatsapp_business_account") {
      result.skipped += 1;
      return result;
    }

    if (!payload.entry) {
      return result;
    }

    for (const entry of payload.entry) {
      if (!entry.changes) continue;

      for (const change of entry.changes) {
        if (change.field !== "messages") continue;
        if (!change.value.messages) continue;

        for (const message of change.value.messages) {
          // Only process interactive button replies
          if (
            message.type !== "interactive" ||
            !message.interactive?.button_reply
          ) {
            result.skipped += 1;
            continue;
          }

          const buttonId = message.interactive.button_reply.id;
          const fromPhone = message.from;
          const messageId = message.id;

          try {
            await this.processButtonReply(buttonId, fromPhone, messageId);
            result.processed += 1;
          } catch (error) {
            result.errors.push({
              messageId,
              error:
                error instanceof Error ? error.message : "Unknown error",
            });
          }
        }
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Internal: process a button reply
  // -------------------------------------------------------------------------

  private async processButtonReply(
    buttonId: string,
    fromPhone: string,
    messageId: string,
  ): Promise<void> {
    // Button IDs are formatted as "approve:{token}" or "deny:{token}"
    const colonIndex = buttonId.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid button reply ID format: ${buttonId}`);
    }

    const action = buttonId.substring(0, colonIndex);
    const token = buttonId.substring(colonIndex + 1);

    if (action !== "approve" && action !== "deny") {
      throw new Error(`Unknown button action: ${action}`);
    }

    // Normalize phone number — strip leading + if present
    const normalizedPhone = fromPhone.replace(/^\+/, "");

    // Use the frozen W1 resolve path
    await this.reviewApprovalSurfaceService.resolveWhatsAppAction({
      approvalToken: token,
      actorIdentity: normalizedPhone,
      rationale: null,
      interactionId: messageId,
    });
  }
}
