import { describe, it, expect } from "vitest";
import type { SenderResolution } from "@clawback/contracts";

import {
  triageInboundEmail,
  getFollowUpRouteTargetKindPreferences,
  type TriageEmailInput,
} from "./follow-up-triage.js";

function email(overrides: Partial<TriageEmailInput> = {}): TriageEmailInput {
  return {
    from: "client@acmecorp.com",
    subject: "Re: Project update",
    bodyText: "Hi, just checking in on the project status. Any updates?",
    ...overrides,
  };
}

function senderResolution(
  overrides: Partial<SenderResolution> = {},
): SenderResolution {
  return {
    contact_id: "cot_test_01",
    account_id: "acc_test_01",
    relationship_class: "customer",
    owner_user_id: "usr_test_01",
    handling_note: null,
    do_not_auto_reply: false,
    resolution_method: "exact_contact",
    ...overrides,
  };
}

describe("triageInboundEmail", () => {
  // -----------------------------------------------------------------------
  // Happy path: follow-up → shadow_draft
  // -----------------------------------------------------------------------

  it("classifies a follow-up reply as shadow_draft", () => {
    const result = triageInboundEmail(email({
      subject: "Re: Q3 renewal discussion",
      bodyText: "Hi, following up on our earlier conversation. Any update on the timeline?",
    }));

    expect(result.source_kind).toBe("inbound_email");
    expect(result.intent).toBe("follow_up");
    expect(result.decision).toBe("shadow_draft");
    expect(result.posture).toBe("answer");
    expect(result.confidence).toBe("high");
  });

  // -----------------------------------------------------------------------
  // Spam → ignore
  // -----------------------------------------------------------------------

  it("classifies obvious spam as ignore", () => {
    const result = triageInboundEmail(email({
      from: "promo@spam-mailer.com",
      subject: "Congratulations you have been selected!",
      bodyText: "Limited time offer! Act now to earn money from home. Click here to unsubscribe.",
    }));

    expect(result.intent).toBe("spam");
    expect(result.decision).toBe("ignore");
    expect(result.confidence).toBe("high");
  });

  // -----------------------------------------------------------------------
  // Cold outreach → ignore
  // -----------------------------------------------------------------------

  it("classifies cold outreach as ignore", () => {
    const result = triageInboundEmail(email({
      from: "sales@vendor.io",
      subject: "Quick question for you",
      bodyText: "I came across your company and would love to connect. We help companies like yours scale faster. Can I get 15 minutes of your time?",
    }));

    expect(result.intent).toBe("cold_outreach");
    expect(result.decision).toBe("ignore");
  });

  // -----------------------------------------------------------------------
  // Escalation → escalate
  // -----------------------------------------------------------------------

  it("classifies legal threats as escalation", () => {
    const result = triageInboundEmail(email({
      subject: "Formal complaint",
      bodyText: "This is unacceptable. We are consulting our attorney regarding this matter.",
    }));

    expect(result.intent).toBe("escalation");
    expect(result.decision).toBe("escalate");
  });

  // -----------------------------------------------------------------------
  // Billing → request_review
  // -----------------------------------------------------------------------

  it("classifies billing questions as request_review", () => {
    const result = triageInboundEmail(email({
      subject: "Invoice #1234 question",
      bodyText: "Hi, I have a question about the billing on our latest invoice. The payment amount doesn't match our subscription pricing.",
    }));

    expect(result.intent).toBe("billing_admin");
    expect(result.decision).toBe("request_review");
  });

  // -----------------------------------------------------------------------
  // Support issue → request_review
  // -----------------------------------------------------------------------

  it("classifies support issues as request_review", () => {
    const result = triageInboundEmail(email({
      subject: "Bug in the dashboard",
      bodyText: "The export feature is broken and not working since yesterday's update.",
    }));

    expect(result.intent).toBe("support_issue");
    expect(result.decision).toBe("request_review");
  });

  it("routes known customer support issues to a specialist worker", () => {
    const input = email({
      subject: "Bug in the dashboard",
      bodyText: "The export feature is broken and not working since yesterday's update.",
      senderResolution: senderResolution({
        relationship_class: "customer",
      }),
    });

    const result = triageInboundEmail(input);

    expect(result.intent).toBe("support_issue");
    expect(result.decision).toBe("route_to_worker");
    expect(getFollowUpRouteTargetKindPreferences(input, result)).toEqual(["bugfix", "incident"]);
  });

  it("prefers the Incident worker for outage-like support issues", () => {
    const input = email({
      subject: "Production outage",
      bodyText: "The app is down and unavailable for the whole team. This is blocking our team.",
      senderResolution: senderResolution({
        relationship_class: "customer",
      }),
    });

    const result = triageInboundEmail(input);

    expect(result.intent).toBe("support_issue");
    expect(result.decision).toBe("route_to_worker");
    expect(getFollowUpRouteTargetKindPreferences(input, result)).toEqual(["incident", "bugfix"]);
  });

  // -----------------------------------------------------------------------
  // Proposal → shadow_draft with acknowledge posture
  // -----------------------------------------------------------------------

  it("classifies proposal requests as shadow_draft", () => {
    const result = triageInboundEmail(email({
      subject: "Request for proposal - consulting engagement",
      bodyText: "We'd like to discuss a potential consulting engagement. Can you share a proposal?",
    }));

    expect(result.intent).toBe("proposal");
    expect(result.decision).toBe("shadow_draft");
    expect(result.posture).toBe("acknowledge");
  });

  it("routes known prospect proposals to the Proposal worker", () => {
    const input = email({
      subject: "Request for proposal - consulting engagement",
      bodyText: "We'd like to discuss a potential consulting engagement. Can you share a proposal?",
      senderResolution: senderResolution({
        relationship_class: "prospect",
      }),
    });

    const result = triageInboundEmail(input);

    expect(result.intent).toBe("proposal");
    expect(result.decision).toBe("route_to_worker");
    expect(getFollowUpRouteTargetKindPreferences(input, result)).toEqual(["proposal"]);
  });

  // -----------------------------------------------------------------------
  // Scheduling → shadow_draft
  // -----------------------------------------------------------------------

  it("classifies scheduling as shadow_draft", () => {
    const result = triageInboundEmail(email({
      subject: "Meeting reschedule",
      bodyText: "Can we reschedule our Thursday meeting? My calendar has a conflict. What's your availability next week?",
    }));

    expect(result.intent).toBe("scheduling");
    expect(result.decision).toBe("shadow_draft");
    expect(result.posture).toBe("acknowledge");
  });

  // -----------------------------------------------------------------------
  // Unclear → request_review (conservative)
  // -----------------------------------------------------------------------

  it("classifies unclear messages conservatively as request_review", () => {
    const result = triageInboundEmail(email({
      subject: "Hello",
      bodyText: "Hi there, I wanted to reach out.",
    }));

    expect(result.intent).toBe("unclear");
    expect(result.decision).toBe("request_review");
    expect(result.confidence).toBe("low");
  });

  // -----------------------------------------------------------------------
  // All decisions include reasons
  // -----------------------------------------------------------------------

  it("always includes reasons in the decision", () => {
    const result = triageInboundEmail(email());
    expect(result.reasons.length).toBeGreaterThan(0);
    expect(result.reasons.every((r) => typeof r === "string" && r.length > 0)).toBe(true);
  });

  // -----------------------------------------------------------------------
  // No-reply senders
  // -----------------------------------------------------------------------

  it("handles noreply senders", () => {
    const result = triageInboundEmail(email({
      from: "noreply@service.com",
      subject: "Your order has shipped",
      bodyText: "Your order #12345 has shipped and will arrive in 3-5 business days.",
    }));

    expect(result.relationship).toBe("unknown");
  });
});
