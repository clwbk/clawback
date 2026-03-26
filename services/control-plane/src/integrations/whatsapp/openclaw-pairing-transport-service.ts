import type { WhatsAppApprovalActionRecipient } from "../../approval-surfaces/review-surface-service.js";
import type { ReviewRecordView } from "../../reviews/types.js";
import type { OpenClawGatewayService } from "./openclaw-gateway-service.js";
import type { SendApprovalPromptResult } from "./whatsapp-transport-service.js";

type OpenClawPairingTransportServiceOptions = {
  gatewayService: OpenClawGatewayService;
  accountId?: string | null;
  consoleOrigin?: string | null;
};

export class OpenClawPairingTransportService {
  constructor(private readonly options: OpenClawPairingTransportServiceOptions) {}

  async sendApprovalPrompt(
    review: ReviewRecordView,
    recipients: WhatsAppApprovalActionRecipient[],
  ): Promise<SendApprovalPromptResult> {
    const result: SendApprovalPromptResult = {
      sent: 0,
      failed: 0,
      errors: [],
    };

    for (const recipient of recipients) {
      try {
        await this.options.gatewayService.sendWhatsAppMessage({
          to: recipient.actorIdentity,
          message: this.formatApprovalMessage(review),
          idempotencyKey: `${review.id}:${recipient.userId}:notify`,
          ...(this.options.accountId ? { accountId: this.options.accountId } : {}),
        });
        result.sent += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          recipient: recipient.actorIdentity,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return result;
  }

  private formatApprovalMessage(review: ReviewRecordView) {
    const lines = [
      "Clawback review required",
      "",
      this.formatReviewSubject(review),
      `Review ID: ${review.id}`,
      `Action: ${review.action_kind.replace(/_/g, " ")}`,
    ];

    const reviewUrl = this.buildReviewUrl(review.id);
    if (reviewUrl) {
      lines.push("", `Open review: ${reviewUrl}`);
    }

    lines.push(
      "",
      "OpenClaw pairing mode currently delivers approval prompts to WhatsApp.",
      "Complete the final approve or deny action in Clawback.",
    );

    return lines.join("\n");
  }

  private formatReviewSubject(review: ReviewRecordView) {
    const destination = review.action_destination ?? "unknown destination";
    const kind = review.action_kind.replace(/_/g, " ");
    return `${kind} to ${destination}`;
  }

  private buildReviewUrl(reviewId: string) {
    if (!this.options.consoleOrigin) {
      return null;
    }

    try {
      const url = new URL("/workspace/inbox", this.options.consoleOrigin);
      url.searchParams.set("review", reviewId);
      return url.toString();
    } catch {
      return null;
    }
  }
}
