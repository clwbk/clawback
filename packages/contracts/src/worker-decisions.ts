/**
 * Worker Decision Contract — shared typed vocabulary for worker triage
 * and decision output.
 *
 * STABILITY: These types are plugin-facing API. Treat them like any other
 * contract enum (connectionProviderSchema, workerKindSchema, etc.).
 *
 * Rules:
 *   - prefer additive changes (new enum values are safe)
 *   - avoid renames (use stable machine IDs, separate from display labels)
 *   - include safe fallback values (unknown, unclear)
 *   - deprecate before removing
 *
 * @see docs/architecture/worker-decision-model.md
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Source kind — what the input IS, not how it entered
// ---------------------------------------------------------------------------

export const sourceKindSchema = z.enum([
  "inbound_email",
  "chat_message",
  "forwarded_email",
  "ticket_event",
  "webhook_event",
  "manual_upload",
  "unknown",
]);

export type SourceKind = z.infer<typeof sourceKindSchema>;

// ---------------------------------------------------------------------------
// Relationship class — who is the sender relative to this workspace
// ---------------------------------------------------------------------------

export const relationshipClassSchema = z.enum([
  "customer",
  "prospect",
  "vendor",
  "internal",
  "blocked",
  "unknown",
]);

export type RelationshipClass = z.infer<typeof relationshipClassSchema>;

// ---------------------------------------------------------------------------
// Intent class — what the sender appears to want
// ---------------------------------------------------------------------------

export const intentClassSchema = z.enum([
  "follow_up",
  "proposal",
  "support_issue",
  "billing_admin",
  "scheduling",
  "cold_outreach",
  "spam",
  "escalation",
  "unclear",
]);

export type IntentClass = z.infer<typeof intentClassSchema>;

// ---------------------------------------------------------------------------
// Decision kind — what the worker decided to do
// ---------------------------------------------------------------------------

export const decisionKindSchema = z.enum([
  "ignore",
  "shadow_draft",
  "request_review",
  "route_to_worker",
  "escalate",
]);

export type DecisionKind = z.infer<typeof decisionKindSchema>;

// ---------------------------------------------------------------------------
// Posture — when drafting, what tone/stance to take
// ---------------------------------------------------------------------------

export const postureSchema = z.enum([
  "acknowledge",
  "answer",
  "clarify",
  "defer",
  "decline",
]);

export type Posture = z.infer<typeof postureSchema>;

// ---------------------------------------------------------------------------
// Confidence band
// ---------------------------------------------------------------------------

export const confidenceBandSchema = z.enum(["low", "medium", "high"]);

export type ConfidenceBand = z.infer<typeof confidenceBandSchema>;

// ---------------------------------------------------------------------------
// Worker Decision envelope — the typed output of triage
// ---------------------------------------------------------------------------

export const workerDecisionSchema = z.object({
  /** What kind of source input triggered this decision. */
  source_kind: sourceKindSchema,

  /** Resolved relationship of the sender to the workspace. */
  relationship: relationshipClassSchema,

  /** Classified intent of the inbound message. */
  intent: intentClassSchema,

  /** What the worker decided to do. */
  decision: decisionKindSchema,

  /** When drafting, what stance to take. Null if decision is not a draft. */
  posture: postureSchema.nullable(),

  /** Machine-readable reason codes explaining the decision. */
  reasons: z.array(z.string().min(1)),

  /** How confident the classification/decision is. */
  confidence: confidenceBandSchema,

  /** Target worker ID when decision is route_to_worker. */
  route_target_worker_id: z.string().nullable().optional(),
});

export type WorkerDecision = z.infer<typeof workerDecisionSchema>;

// ---------------------------------------------------------------------------
// Triage record — the persisted form of a worker decision
// ---------------------------------------------------------------------------
// Identical to workerDecisionSchema for now. Kept as a named alias so
// persistence and read-model code can reference the "triage" concept
// without coupling directly to the runtime decision shape.

export const workerTriageRecordSchema = workerDecisionSchema;

export type WorkerTriageRecord = z.infer<typeof workerTriageRecordSchema>;
