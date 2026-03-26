import type { InputRouteKind, WorkerKind, WorkerTriageRecord } from "@clawback/contracts";

import type { IngressResult } from "../shared-results.js";

// ---------------------------------------------------------------------------
// Inbound email webhook payload (simplified for V1)
// ---------------------------------------------------------------------------

export type InboundEmailPayload = {
  /** Email message-id header (for idempotency). */
  message_id: string;
  /** Sender address. */
  from: string;
  /** Recipient address (encodes workspace + worker). */
  to: string;
  /** Subject line. */
  subject: string;
  /** Plain-text body. */
  body_text: string;
  /** HTML body (optional). */
  body_html?: string | null;
  /** Attachment metadata (optional). */
  attachments?: Array<{
    filename: string;
    content_type: string;
    size: number;
  }>;
};

// ---------------------------------------------------------------------------
// Source event stored shape
// ---------------------------------------------------------------------------

export type StoredSourceEvent = {
  id: string;
  workspaceId: string;
  workerId: string;
  inputRouteId: string | null;
  kind: "forwarded_email" | "watched_inbox" | "chat_input" | "upload" | "schedule" | "webhook";
  externalMessageId: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  attachmentsJson: unknown[];
  rawPayloadJson: Record<string, unknown>;
  triageJson?: WorkerTriageRecord | null;
  createdAt: Date;
};

export type CreateSourceEventInput = {
  workerId: string;
  inputRouteId?: string | null;
  kind: StoredSourceEvent["kind"];
  externalMessageId?: string | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  attachments?: unknown[];
  rawPayload?: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

export interface SourceEventStore {
  findByExternalMessageId(workspaceId: string, externalMessageId: string): Promise<StoredSourceEvent | null>;
  create(input: StoredSourceEvent): Promise<StoredSourceEvent>;
}

// ---------------------------------------------------------------------------
// Input route lookup (for address-based routing)
// ---------------------------------------------------------------------------

export type InputRouteWithWorker = {
  id: string;
  workspaceId: string;
  workerId: string;
  kind: InputRouteKind;
  address: string;
};

export interface InputRouteLookup {
  findByAddress(address: string): Promise<InputRouteWithWorker | null>;
}

// ---------------------------------------------------------------------------
// Worker lookup
// ---------------------------------------------------------------------------

export type WorkerSummary = {
  id: string;
  workspaceId: string;
  slug: string;
  name: string;
  kind: WorkerKind;
  assigneeIds: string[];
  reviewerIds: string[];
};

export interface WorkerLookup {
  findById(workspaceId: string, id: string): Promise<WorkerSummary | null>;
}

// ---------------------------------------------------------------------------
// Service contract
// ---------------------------------------------------------------------------

export interface InboundEmailServiceContract {
  processInboundEmail(payload: InboundEmailPayload): Promise<InboundEmailResult>;
}

export type InboundEmailResult = IngressResult<{
  work_item_id: string;
  inbox_item_id: string;
  review_id: string;
}>;
