import nodemailer, { type Transporter } from "nodemailer";

export type ReviewedEmailSendInput = {
  workspaceId: string;
  reviewId: string;
  workItemId: string;
  to: string;
  subject: string;
  body: string;
  idempotencyKey?: string;
};

export type ReviewedEmailSendResult = {
  providerMessageId: string | null;
};

export interface ReviewedEmailSender {
  sendReviewedEmail(input: ReviewedEmailSendInput): Promise<ReviewedEmailSendResult>;
}

type SmtpRelayEmailSenderOptions = {
  env?: NodeJS.ProcessEnv;
  transport?: Transporter;
};

export class SmtpRelayConfigurationError extends Error {
  readonly code = "smtp_relay_not_configured";
  readonly statusCode = 503;

  constructor(message = "SMTP relay is not configured.") {
    super(message);
  }
}

export class SmtpRelayEmailSender implements ReviewedEmailSender {
  private readonly env: NodeJS.ProcessEnv;
  private readonly transport: Transporter;
  private readonly sentResults = new Map<string, ReviewedEmailSendResult>();

  constructor(options: SmtpRelayEmailSenderOptions = {}) {
    this.env = options.env ?? process.env;
    this.transport = options.transport ?? this.createTransport();
  }

  async sendReviewedEmail(input: ReviewedEmailSendInput): Promise<ReviewedEmailSendResult> {
    const idempotencyKey = input.idempotencyKey ?? `${input.workItemId}:${input.reviewId}`;
    const cached = this.sentResults.get(idempotencyKey);
    if (cached) {
      return cached;
    }

    const fromAddress = this.env.CLAWBACK_SMTP_FROM_ADDRESS;
    if (!fromAddress) {
      throw new SmtpRelayConfigurationError(
        "CLAWBACK_SMTP_FROM_ADDRESS must be configured for reviewed sends.",
      );
    }

    const fromName = this.env.CLAWBACK_SMTP_FROM_NAME?.trim();
    const replyTo = this.env.CLAWBACK_SMTP_REPLY_TO?.trim() || undefined;
    const from = fromName ? `${fromName} <${fromAddress}>` : fromAddress;

    const info = await this.transport.sendMail({
      from,
      replyTo,
      to: input.to,
      subject: input.subject,
      text: input.body,
      headers: {
        "x-clawback-review-id": input.reviewId,
        "x-clawback-work-item-id": input.workItemId,
        "x-clawback-workspace-id": input.workspaceId,
      },
    });

    const result: ReviewedEmailSendResult = {
      providerMessageId: info.messageId ?? null,
    };
    this.sentResults.set(idempotencyKey, result);
    return result;
  }

  private createTransport() {
    const host = this.env.CLAWBACK_SMTP_HOST;
    const port = Number(this.env.CLAWBACK_SMTP_PORT ?? "587");
    const user = this.env.CLAWBACK_SMTP_USERNAME;
    const pass = this.env.CLAWBACK_SMTP_PASSWORD;
    const secure = this.env.CLAWBACK_SMTP_SECURE === "true";

    if (!host || Number.isNaN(port)) {
      throw new SmtpRelayConfigurationError(
        "CLAWBACK_SMTP_HOST and CLAWBACK_SMTP_PORT must be configured for reviewed sends.",
      );
    }

    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass
        ? {
            user,
            pass,
          }
        : undefined,
    });
  }
}
