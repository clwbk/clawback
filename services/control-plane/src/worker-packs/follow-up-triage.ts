/**
 * Follow-Up worker decision helpers.
 *
 * The worker's product policy lives here: relationship resolution,
 * intent classification, and decision policy remain provider-independent.
 * X2 builds an explicit native execution progression on top of these
 * steps without turning them into a generic workflow engine.
 *
 * @see docs/implementation/email-triage-and-response-policy.md
 * @see docs/architecture/worker-decision-model.md
 */

import type {
  WorkerDecision,
  WorkerKind,
  RelationshipClass,
  IntentClass,
  DecisionKind,
  Posture,
  ConfidenceBand,
  SenderResolution,
} from "@clawback/contracts";

// ---------------------------------------------------------------------------
// Input shape — normalized email, provider-independent
// ---------------------------------------------------------------------------

export type TriageEmailInput = {
  from: string;
  subject: string;
  bodyText: string;
  bodyHtml?: string | null | undefined;
  threadSummary?: string | null | undefined;
  /** Pre-resolved sender context from shared contact/account memory. */
  senderResolution?: SenderResolution | null | undefined;
};

type RouteTargetKind = Exclude<WorkerKind, "follow_up">;

export type FollowUpRelationshipResolution = {
  relationship: RelationshipClass;
  resolution_reasons: string[];
};

export type FollowUpIntentClassification = {
  intent: IntentClass;
  reasons: string[];
};

export type FollowUpActionDecision = {
  decision: DecisionKind;
  posture: Posture | null;
  confidence: ConfidenceBand;
  reasons: string[];
};

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

export function resolveFollowUpRelationship(
  input: Pick<TriageEmailInput, "from" | "senderResolution">,
): FollowUpRelationshipResolution {
  const senderCtx = input.senderResolution;
  if (senderCtx && senderCtx.resolution_method !== "none") {
    return {
      relationship: senderCtx.relationship_class,
      resolution_reasons: [`resolved_via_${senderCtx.resolution_method}`],
    };
  }

  return {
    relationship: classifyRelationship(input.from.toLowerCase()),
    resolution_reasons: [],
  };
}

export function classifyFollowUpIntent(
  input: Pick<TriageEmailInput, "subject" | "bodyText">,
): FollowUpIntentClassification {
  const subject = input.subject.toLowerCase();
  const body = input.bodyText.toLowerCase();
  const combined = `${subject} ${body}`;
  return classifyIntent(subject, body, combined);
}

export function decideFollowUpAction(input: {
  relationship: RelationshipClass;
  intent: IntentClass;
  senderResolution?: SenderResolution | null | undefined;
}): FollowUpActionDecision {
  if (input.senderResolution?.do_not_auto_reply) {
    return {
      decision: "request_review",
      posture: null,
      reasons: ["do_not_auto_reply_flag_set"],
      confidence: "high",
    };
  }

  return applyPolicy(input.relationship, input.intent);
}

// ---------------------------------------------------------------------------
// Triage compatibility wrapper
// ---------------------------------------------------------------------------

export function triageInboundEmail(input: TriageEmailInput): WorkerDecision {
  const relationship = resolveFollowUpRelationship(input);
  const intent = classifyFollowUpIntent(input);
  const action = decideFollowUpAction({
    relationship: relationship.relationship,
    intent: intent.intent,
    senderResolution: input.senderResolution,
  });
  const shouldIncludeResolutionReasons = !input.senderResolution?.do_not_auto_reply;

  return {
    source_kind: "inbound_email",
    relationship: relationship.relationship,
    intent: intent.intent,
    decision: action.decision,
    posture: action.posture,
    reasons: [
      ...intent.reasons,
      ...action.reasons,
      ...(shouldIncludeResolutionReasons ? relationship.resolution_reasons : []),
    ],
    confidence: action.confidence,
  };
}

// ---------------------------------------------------------------------------
// Step 1: Relationship classification (heuristic)
// ---------------------------------------------------------------------------

function classifyRelationship(from: string): RelationshipClass {
  // Blocked senders — explicit list could come from workspace config later
  if (isLikelyNoReply(from)) {
    return "unknown";
  }

  // For now, we can't resolve customer/prospect/vendor without account
  // context. Default to "unknown" and let the intent drive the decision.
  // The relationship-memory sprint will make this smarter.
  return "unknown";
}

function isLikelyNoReply(from: string): boolean {
  return (
    from.includes("noreply") ||
    from.includes("no-reply") ||
    from.includes("donotreply") ||
    from.includes("do-not-reply") ||
    from.includes("mailer-daemon")
  );
}

// ---------------------------------------------------------------------------
// Step 2: Intent classification (heuristic)
// ---------------------------------------------------------------------------

const SPAM_SIGNALS = [
  "unsubscribe",
  "opt out",
  "opt-out",
  "click here to",
  "limited time offer",
  "act now",
  "congratulations you",
  "you have been selected",
  "earn money",
  "make money",
  "million dollars",
  "nigerian",
  "cryptocurrency opportunity",
  "bitcoin opportunity",
];

const COLD_OUTREACH_SIGNALS = [
  "i came across your",
  "i noticed your company",
  "i wanted to reach out",
  "would love to connect",
  "quick question for you",
  "are you the right person",
  "who handles",
  "we help companies like",
  "i'd love to show you",
  "free demo",
  "free trial",
  "schedule a call",
  "15 minutes of your time",
  "saw your linkedin",
];

const ESCALATION_SIGNALS = [
  "legal",
  "lawsuit",
  "attorney",
  "lawyer",
  "sue ",
  "court order",
  "cease and desist",
  "complaint",
  "extremely disappointed",
  "unacceptable",
  "cancel",
  "cancellation",
  "refund",
  "chargeback",
  "security breach",
  "data breach",
  "unauthorized access",
  "urgent",
];

const BILLING_SIGNALS = [
  "invoice",
  "payment",
  "billing",
  "receipt",
  "charge",
  "subscription",
  "renewal",
  "pricing",
  "quote",
  "estimate",
];

const SCHEDULING_SIGNALS = [
  "meeting",
  "calendar",
  "schedule",
  "availability",
  "reschedule",
  "appointment",
  "call time",
  "slot",
];

const INCIDENT_SIGNALS = [
  "incident",
  "outage",
  "down",
  "degraded",
  "unavailable",
  "offline",
  "service disruption",
  "production issue",
  "cannot access",
  "can't access",
  "locked out",
  "systemwide",
  "system-wide",
  "sev-1",
  "sev1",
  "severity 1",
  "blocking our team",
];

function classifyIntent(
  subject: string,
  body: string,
  combined: string,
): { intent: IntentClass; reasons: string[] } {
  const reasons: string[] = [];

  // Check spam first
  if (hasSignals(combined, SPAM_SIGNALS, 2)) {
    reasons.push("spam_keywords_detected");
    return { intent: "spam", reasons };
  }

  // Check cold outreach
  if (hasSignals(combined, COLD_OUTREACH_SIGNALS, 2)) {
    reasons.push("cold_outreach_keywords_detected");
    return { intent: "cold_outreach", reasons };
  }

  // Check escalation
  if (hasSignals(combined, ESCALATION_SIGNALS, 1)) {
    reasons.push("escalation_keywords_detected");
    return { intent: "escalation", reasons };
  }

  // Check billing/admin
  if (hasSignals(combined, BILLING_SIGNALS, 2)) {
    reasons.push("billing_admin_keywords_detected");
    return { intent: "billing_admin", reasons };
  }

  // Check scheduling
  if (hasSignals(combined, SCHEDULING_SIGNALS, 2)) {
    reasons.push("scheduling_keywords_detected");
    return { intent: "scheduling", reasons };
  }

  // Check if it looks like a proposal request
  if (
    combined.includes("proposal") ||
    combined.includes("rfp") ||
    combined.includes("request for proposal") ||
    combined.includes("scope of work") ||
    combined.includes("sow")
  ) {
    reasons.push("proposal_keywords_detected");
    return { intent: "proposal", reasons };
  }

  // Check if it looks like a support issue
  if (
    combined.includes("bug") ||
    combined.includes("error") ||
    combined.includes("broken") ||
    combined.includes("not working") ||
    combined.includes("issue with") ||
    combined.includes("problem with") ||
    looksIncidentLike(combined)
  ) {
    reasons.push("support_keywords_detected");
    return { intent: "support_issue", reasons };
  }

  // Default: if it looks like a reply or ongoing thread, likely follow-up
  if (
    subject.startsWith("re:") ||
    subject.startsWith("fwd:") ||
    combined.includes("following up") ||
    combined.includes("follow up") ||
    combined.includes("checking in") ||
    combined.includes("wanted to touch base") ||
    combined.includes("any update") ||
    combined.includes("status update")
  ) {
    reasons.push("follow_up_thread_detected");
    return { intent: "follow_up", reasons };
  }

  // If we can't tell, be honest
  reasons.push("no_clear_intent_signals");
  return { intent: "unclear", reasons };
}

function hasSignals(text: string, signals: string[], threshold: number): boolean {
  let count = 0;
  for (const signal of signals) {
    if (text.includes(signal)) {
      count++;
      if (count >= threshold) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Step 3: Policy table — relationship × intent → decision
// ---------------------------------------------------------------------------
// Based on docs/implementation/email-triage-and-response-policy.md

type PolicyResult = {
  decision: DecisionKind;
  posture: Posture | null;
  confidence: ConfidenceBand;
  reasons: string[];
};

function applyPolicy(
  relationship: RelationshipClass,
  intent: IntentClass,
): PolicyResult {
  // Hard rules regardless of relationship
  if (intent === "spam") {
    return {
      decision: "ignore",
      posture: null,
      confidence: "high",
      reasons: ["spam_auto_ignored"],
    };
  }

  if (intent === "cold_outreach") {
    return {
      decision: "ignore",
      posture: null,
      confidence: "medium",
      reasons: ["cold_outreach_default_ignore"],
    };
  }

  if (intent === "escalation") {
    return {
      decision: "escalate",
      posture: null,
      confidence: "medium",
      reasons: ["escalation_detected_requires_human"],
    };
  }

  // Billing/admin always needs human review
  if (intent === "billing_admin") {
    return {
      decision: "request_review",
      posture: null,
      confidence: "medium",
      reasons: ["billing_admin_requires_review"],
    };
  }

  // Support issues should be escalated or reviewed, not auto-drafted
  if (intent === "support_issue") {
    if (relationship === "customer" || relationship === "internal") {
      return {
        decision: "route_to_worker",
        posture: null,
        confidence: "medium",
        reasons: ["support_issue_requires_specialist_worker"],
      };
    }

    return {
      decision: "request_review",
      posture: null,
      confidence: "medium",
      reasons: ["support_issue_requires_review"],
    };
  }

  // Proposal requests — route if possible, otherwise shadow draft
  if (intent === "proposal") {
    if (relationship === "customer" || relationship === "prospect") {
      return {
        decision: "route_to_worker",
        posture: null,
        confidence: "medium",
        reasons: ["proposal_requires_specialist_worker"],
      };
    }

    return {
      decision: "shadow_draft",
      posture: "acknowledge",
      confidence: "medium",
      reasons: ["proposal_request_acknowledged"],
    };
  }

  // Follow-up — the happy path
  if (intent === "follow_up") {
    return {
      decision: "shadow_draft",
      posture: "answer",
      confidence: "high",
      reasons: ["follow_up_happy_path"],
    };
  }

  // Scheduling — safe to draft
  if (intent === "scheduling") {
    return {
      decision: "shadow_draft",
      posture: "acknowledge",
      confidence: "medium",
      reasons: ["scheduling_safe_to_draft"],
    };
  }

  // Unclear intent — conservative
  return {
    decision: "request_review",
    posture: null,
    confidence: "low",
    reasons: ["unclear_intent_conservative_path"],
  };
}

export function getFollowUpRouteTargetKindPreferences(
  input: Pick<TriageEmailInput, "subject" | "bodyText">,
  decision: Pick<WorkerDecision, "decision" | "intent">,
): RouteTargetKind[] {
  if (decision.decision !== "route_to_worker") {
    return [];
  }

  if (decision.intent === "proposal") {
    return ["proposal"];
  }

  if (decision.intent === "support_issue") {
    const combined = `${input.subject} ${input.bodyText}`.toLowerCase();
    if (looksIncidentLike(combined)) {
      return ["incident", "bugfix"];
    }

    return ["bugfix", "incident"];
  }

  return [];
}

function looksIncidentLike(text: string): boolean {
  return INCIDENT_SIGNALS.some((signal) => text.includes(signal));
}
