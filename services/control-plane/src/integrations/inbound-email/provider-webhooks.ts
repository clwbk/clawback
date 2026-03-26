import type { InboundEmailPayload } from "./types.js";

type PostmarkAttachment = {
  Name?: unknown;
  ContentType?: unknown;
  ContentLength?: unknown;
};

type PostmarkInboundBody = {
  From?: unknown;
  To?: unknown;
  OriginalRecipient?: unknown;
  Subject?: unknown;
  MessageID?: unknown;
  TextBody?: unknown;
  HtmlBody?: unknown;
  Attachments?: unknown;
};

export class InboundEmailWebhookParseError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 400,
  ) {
    super(message);
  }
}

export function parsePostmarkInboundEmail(body: unknown): InboundEmailPayload {
  const value = isObject(body) ? body as PostmarkInboundBody : {};

  const messageId = requireString(value.MessageID, "MessageID");
  const from = extractEmailAddress(requireString(value.From, "From"));
  const to = extractEmailAddress(
    firstNonEmptyString(value.OriginalRecipient, value.To, "OriginalRecipient or To"),
  );
  const subject = requireString(value.Subject, "Subject");
  const bodyText = optionalString(value.TextBody) ?? "";
  const bodyHtml = optionalString(value.HtmlBody) ?? null;
  const attachments = Array.isArray(value.Attachments)
    ? value.Attachments
      .filter(isObject)
      .map((attachment) => normalizeAttachment(attachment as PostmarkAttachment))
    : [];

  return {
    message_id: messageId,
    from,
    to,
    subject,
    body_text: bodyText,
    body_html: bodyHtml,
    attachments,
  };
}

function normalizeAttachment(input: PostmarkAttachment) {
  return {
    filename: optionalString(input.Name) ?? "attachment",
    content_type: optionalString(input.ContentType) ?? "application/octet-stream",
    size: typeof input.ContentLength === "number"
      ? input.ContentLength
      : typeof input.ContentLength === "string"
        ? Number.parseInt(input.ContentLength, 10) || 0
        : 0,
  };
}

function extractEmailAddress(value: string) {
  const trimmed = value.trim();
  const bracketMatch = trimmed.match(/<([^>]+)>/u);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].trim().toLowerCase();
  }

  const firstComma = trimmed.split(",")[0]?.trim();
  if (!firstComma) {
    throw new InboundEmailWebhookParseError(
      "invalid_email_address",
      `Could not parse email address from "${value}".`,
    );
  }

  return firstComma.toLowerCase();
}

function firstNonEmptyString(...values: unknown[]) {
  const label = typeof values.at(-1) === "string" ? values.at(-1) as string : "value";
  const candidates = typeof values.at(-1) === "string" ? values.slice(0, -1) : values;
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  throw new InboundEmailWebhookParseError(
    "missing_required_field",
    `Missing required field: ${label}.`,
  );
}

function requireString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InboundEmailWebhookParseError(
      "missing_required_field",
      `Missing required field: ${label}.`,
    );
  }

  return value.trim();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
