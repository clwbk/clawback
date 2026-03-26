import type { InputRouteKind, WorkerKind } from "@clawback/contracts";
import type { WorkerPackRouteTargetWorker } from "../../worker-packs/index.js";

import type { IngressResult } from "../shared-results.js";

// ---------------------------------------------------------------------------
// Watched inbox event payload (simulated for V1 via API endpoint)
// ---------------------------------------------------------------------------

export type WatchedInboxPayload = {
  /** Unique ID for idempotency (e.g., Gmail history ID or synthetic). */
  external_message_id: string;
  /** The worker that should process this event. */
  worker_id: string;
  /** The workspace this event belongs to. */
  workspace_id: string;
  /** Sender address. */
  from: string;
  /** Subject line. */
  subject: string;
  /** Plain-text body. */
  body_text: string;
  /** HTML body (optional). */
  body_html?: string | null;
  /** Thread context or summary (optional). */
  thread_summary?: string | null;
};

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export type WatchedInboxResult = IngressResult<{
  work_item_id: string;
  inbox_item_id: string;
  activity_event_id: string;
}>;

// ---------------------------------------------------------------------------
// Dependency interfaces (reuse types from inbound-email where possible)
// ---------------------------------------------------------------------------

export type { SourceEventStore, StoredSourceEvent, WorkerLookup, WorkerSummary } from "../inbound-email/types.js";

export type InputRouteForWatchedInbox = {
  id: string;
  workspaceId: string;
  workerId: string;
  kind: InputRouteKind;
  status: "active" | "inactive" | "suggested";
};

export interface WatchedInboxRouteLookup {
  findWatchedInboxRoute(workspaceId: string, workerId: string): Promise<InputRouteForWatchedInbox | null>;
}

export interface RouteTargetLookup {
  listActiveByKind(workspaceId: string, kind: WorkerKind): Promise<WorkerPackRouteTargetWorker[]>;
}

export type ConnectionForValidation = {
  id: string;
  provider: string;
  accessMode: string;
  status: string;
};

export interface ConnectionLookup {
  findGmailReadOnly(workspaceId: string): Promise<ConnectionForValidation | null>;
}
