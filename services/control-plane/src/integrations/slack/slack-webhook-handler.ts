/**
 * Slack interaction webhook handler for processing interactive button callbacks.
 *
 * This handler:
 *   1. Verifies the request signature using SLACK_SIGNING_SECRET (HMAC-SHA256)
 *   2. Parses the interaction payload from the `payload` form field
 *   3. Extracts the signed approval action token from the button value
 *   4. Delegates to the frozen W1 resolve path (ReviewApprovalSurfaceService)
 *
 * It does NOT modify review authority, idempotency rules, or actor mapping semantics.
 *
 * FLAG FOR REVIEW: Signature verification implementation follows Slack's documented
 * protocol (v0:timestamp:body HMAC-SHA256). Needs security review before production.
 *
 * FLAG FOR REVIEW: Slack user -> Clawback user identity mapping uses basic lookup
 * by Slack user ID stored in approval surface identities. Needs review.
 */

import * as crypto from "node:crypto";
import type { ReviewApprovalSurfaceService } from "../../approval-surfaces/review-surface-service.js";
import type { SlackInteractionPayload } from "./types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SlackWebhookConfig = {
  /** The signing secret from the Slack app settings. */
  signingSecret: string;
};

export type SlackWebhookProcessResult = {
  processed: number;
  skipped: number;
  errors: Array<{ actionId: string; error: string }>;
};

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export class SlackWebhookHandler {
  constructor(
    private readonly config: SlackWebhookConfig,
    private readonly reviewApprovalSurfaceService: ReviewApprovalSurfaceService,
  ) {}

  // -------------------------------------------------------------------------
  // Signature verification
  // -------------------------------------------------------------------------

  /**
   * Verify a Slack request signature per:
   * https://api.slack.com/authentication/verifying-requests-from-slack
   *
   * The signature is computed as HMAC-SHA256 of "v0:{timestamp}:{rawBody}"
   * using the signing secret, then compared with the X-Slack-Signature header.
   */
  verifySignature(
    rawBody: string | Buffer,
    timestamp: string | undefined,
    signatureHeader: string | undefined,
  ): boolean {
    if (!timestamp || !signatureHeader) {
      return false;
    }

    // Reject requests older than 5 minutes to prevent replay attacks
    const requestAge = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (requestAge > 60 * 5) {
      return false;
    }

    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    const sigBasestring = `v0:${timestamp}:${bodyString}`;

    const expectedSignature = `v0=${crypto
      .createHmac("sha256", this.config.signingSecret)
      .update(sigBasestring)
      .digest("hex")}`;

    if (expectedSignature.length !== signatureHeader.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signatureHeader, "utf8"),
    );
  }

  // -------------------------------------------------------------------------
  // Webhook processing (POST)
  // -------------------------------------------------------------------------

  /**
   * Parse the Slack interaction payload from the `payload` form field.
   */
  static parsePayload(payloadString: string): SlackInteractionPayload {
    return JSON.parse(payloadString) as SlackInteractionPayload;
  }

  /**
   * Parse Slack's application/x-www-form-urlencoded interaction body.
   * Slack sends a single `payload` field whose value is JSON.
   */
  static parseFormEncodedPayload(rawBody: string | Buffer): SlackInteractionPayload {
    const bodyString = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
    const form = new URLSearchParams(bodyString);
    const payloadString = form.get("payload");
    if (!payloadString) {
      throw new Error("Slack interaction payload is missing.");
    }
    return this.parsePayload(payloadString);
  }

  /**
   * Process a Slack interaction webhook payload.
   */
  async processInteraction(
    payload: SlackInteractionPayload,
  ): Promise<SlackWebhookProcessResult> {
    const result: SlackWebhookProcessResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    // Only handle block_actions (interactive button clicks)
    if (payload.type !== "block_actions") {
      result.skipped += 1;
      return result;
    }

    if (!payload.actions || payload.actions.length === 0) {
      result.skipped += 1;
      return result;
    }

    for (const action of payload.actions) {
      const actionId = action.action_id;

      if (actionId !== "clawback_approve" && actionId !== "clawback_deny") {
        result.skipped += 1;
        continue;
      }

      const token = action.value;
      if (!token) {
        result.errors.push({
          actionId,
          error: "Button value (approval token) is missing.",
        });
        continue;
      }

      const slackUserId = payload.user.id;

      try {
        await this.resolveAction(token, slackUserId);
        result.processed += 1;
      } catch (error) {
        result.errors.push({
          actionId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return result;
  }

  // -------------------------------------------------------------------------
  // Internal: resolve an approval action
  // -------------------------------------------------------------------------

  private async resolveAction(
    approvalToken: string,
    slackUserId: string,
  ): Promise<void> {
    // Use the frozen W1 resolve path — same as WhatsApp/web
    await this.reviewApprovalSurfaceService.resolveSlackAction({
      approvalToken,
      actorIdentity: slackUserId,
      rationale: null,
      interactionId: null,
    });
  }
}
