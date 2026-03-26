import { describe, expect, it } from "vitest";

import {
  InboundEmailWebhookParseError,
  parsePostmarkInboundEmail,
} from "./provider-webhooks.js";

describe("parsePostmarkInboundEmail", () => {
  it("parses a Postmark inbound payload into the generic inbound email shape", () => {
    const parsed = parsePostmarkInboundEmail({
      From: "Sarah Example <sarah@acmecorp.com>",
      OriginalRecipient: "followup@hartwell.clawback.dev",
      Subject: "Re: Q3 Renewal Discussion",
      MessageID: "<postmark-message-001@example.com>",
      TextBody: "Following up on our renewal discussion.",
      HtmlBody: "<p>Following up on our renewal discussion.</p>",
      Attachments: [
        {
          Name: "brief.pdf",
          ContentType: "application/pdf",
          ContentLength: 2048,
        },
      ],
    });

    expect(parsed).toEqual({
      message_id: "<postmark-message-001@example.com>",
      from: "sarah@acmecorp.com",
      to: "followup@hartwell.clawback.dev",
      subject: "Re: Q3 Renewal Discussion",
      body_text: "Following up on our renewal discussion.",
      body_html: "<p>Following up on our renewal discussion.</p>",
      attachments: [
        {
          filename: "brief.pdf",
          content_type: "application/pdf",
          size: 2048,
        },
      ],
    });
  });

  it("uses To when OriginalRecipient is absent", () => {
    const parsed = parsePostmarkInboundEmail({
      From: "sender@example.com",
      To: "Follow Up <followup@hartwell.clawback.dev>",
      Subject: "Hello",
      MessageID: "<msg@example.com>",
      TextBody: "Hi",
    });

    expect(parsed.to).toBe("followup@hartwell.clawback.dev");
  });

  it("rejects missing required Postmark fields", () => {
    expect(() => parsePostmarkInboundEmail({
      From: "",
      To: "",
      Subject: "",
      MessageID: "",
    })).toThrow(InboundEmailWebhookParseError);
  });
});
