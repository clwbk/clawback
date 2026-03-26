/**
 * Hartwell V1 typed fixture set.
 *
 * These fixtures represent the "Hartwell & Associates" demo SMB workspace
 * with two team members (Dave the owner, Emma the associate) and four workers.
 *
 * Every object here must parse cleanly against its corresponding Zod schema.
 */

import type { z } from "zod";

import type { ActionCapabilityRecord } from "../actions.js";
import type { ConnectionRecord } from "../connections.js";
import type { connectorRecordSchema } from "../connectors.js";
import type { InboxItemRecord } from "../inbox.js";
import type { InputRouteRecord } from "../input-routes.js";
import type { ReviewRecord } from "../reviews.js";
import type { ActivityEventRecord } from "../today.js";
import type { WorkItemRecord } from "../work-items.js";
import type { WorkerRecord } from "../workers.js";

type ConnectorRecord = z.infer<typeof connectorRecordSchema>;

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const WS = "ws_hartwell_01";
const DAVE = "usr_dave_01";
const EMMA = "usr_emma_01";

const W_FOLLOWUP = "wkr_followup_01";
const W_PROPOSAL = "wkr_proposal_01";
const W_INCIDENT = "wkr_incident_01";
const W_BUGFIX = "wkr_bugfix_01";

const ROUTE_CHAT = "rte_chat_01";
const ROUTE_EMAIL = "rte_fwd_email_01";
const ROUTE_INBOX = "rte_watched_01";

const CONN_GMAIL = "conn_gmail_01";
const CONN_SMTP = "conn_smtp_01";
const CONN_CALENDAR = "conn_cal_01";

const ACT_SEND_EMAIL = "act_send_01";
const ACT_SAVE_WORK = "act_save_01";

const ROUTE_INCIDENT_CHAT = "rte_incident_chat_01";
const ROUTE_BUGFIX_CHAT = "rte_bugfix_chat_01";
const ACT_INCIDENT_TICKET = "act_incident_ticket_01";
const ACT_INCIDENT_SAVE = "act_incident_save_01";
const ACT_BUGFIX_TICKET = "act_bugfix_ticket_01";
const ACT_BUGFIX_SAVE = "act_bugfix_save_01";

const CTR_DOCS = "ctr_docs_01";

const WI_DRAFT = "wi_draft_01";
const WI_SENT = "wi_sent_01";
const WI_PROPOSAL = "wi_proposal_01";

const REV_01 = "rev_01";

const INBOX_REVIEW = "inb_review_01";
const INBOX_SHADOW = "inb_shadow_01";
const INBOX_SETUP = "inb_setup_01";

const EVT_01 = "evt_act_01";
const EVT_02 = "evt_act_02";
const EVT_03 = "evt_act_03";

// ---------------------------------------------------------------------------
// Timestamps
// ---------------------------------------------------------------------------

const NOW = "2026-03-18T10:00:00+00:00";
const HOUR_AGO = "2026-03-18T09:00:00+00:00";
const TWO_HOURS_AGO = "2026-03-18T08:00:00+00:00";
const YESTERDAY = "2026-03-17T10:00:00+00:00";

// ---------------------------------------------------------------------------
// Viewer payloads (session-shaped, not a contract schema but used by UI)
// ---------------------------------------------------------------------------

export const daveViewer = {
  user: { id: DAVE, email: "dave@hartwell.com", display_name: "Dave Hartwell" },
  workspace: { id: WS, slug: "hartwell", name: "Hartwell & Associates" },
  membership: { role: "admin" as const },
} as const;

export const emmaViewer = {
  user: { id: EMMA, email: "emma@hartwell.com", display_name: "Emma Chen" },
  workspace: { id: WS, slug: "hartwell", name: "Hartwell & Associates" },
  membership: { role: "user" as const },
} as const;

// ---------------------------------------------------------------------------
// Workers
// ---------------------------------------------------------------------------

const workerBase = {
  workspace_id: WS,
  scope: "shared" as const,
  status: "active" as const,
  created_at: YESTERDAY,
  updated_at: NOW,
} as const;

export const followUpWorker: WorkerRecord = {
  ...workerBase,
  id: W_FOLLOWUP,
  slug: "client-follow-up",
  name: "Client Follow-Up",
  kind: "follow_up",
  summary: "Monitors client threads and drafts follow-up emails.",
  member_ids: [DAVE, EMMA],
  assignee_ids: [EMMA],
  reviewer_ids: [DAVE],
  input_route_ids: [ROUTE_CHAT, ROUTE_EMAIL, ROUTE_INBOX],
  connection_ids: [CONN_GMAIL, CONN_SMTP, CONN_CALENDAR],
  action_ids: [ACT_SEND_EMAIL, ACT_SAVE_WORK],
};

export const proposalWorker: WorkerRecord = {
  ...workerBase,
  id: W_PROPOSAL,
  slug: "proposal",
  name: "Proposal",
  kind: "proposal",
  summary: "Generates proposal drafts from client briefs.",
  member_ids: [DAVE],
  assignee_ids: [DAVE],
  reviewer_ids: [DAVE],
  input_route_ids: [],
  connection_ids: [],
  action_ids: [],
};

export const incidentWorker: WorkerRecord = {
  ...workerBase,
  id: W_INCIDENT,
  slug: "incident",
  name: "Incident",
  kind: "incident",
  summary: "Triages incidents, coordinates response, and tracks resolution.",
  member_ids: [DAVE, EMMA],
  assignee_ids: [DAVE],
  reviewer_ids: [DAVE],
  input_route_ids: [ROUTE_INCIDENT_CHAT],
  connection_ids: [],
  action_ids: [ACT_INCIDENT_TICKET, ACT_INCIDENT_SAVE],
};

export const bugfixWorker: WorkerRecord = {
  ...workerBase,
  id: W_BUGFIX,
  slug: "bugfix",
  name: "Bugfix",
  kind: "bugfix",
  summary: "Investigates bug reports, documents findings, and tracks fixes.",
  member_ids: [EMMA],
  assignee_ids: [EMMA],
  reviewer_ids: [DAVE],
  input_route_ids: [ROUTE_BUGFIX_CHAT],
  connection_ids: [],
  action_ids: [ACT_BUGFIX_TICKET, ACT_BUGFIX_SAVE],
};

export const workers: WorkerRecord[] = [
  followUpWorker,
  proposalWorker,
  incidentWorker,
  bugfixWorker,
];

// ---------------------------------------------------------------------------
// Input routes (for follow-up worker)
// ---------------------------------------------------------------------------

export const followUpRoutes: InputRouteRecord[] = [
  {
    id: ROUTE_CHAT,
    workspace_id: WS,
    worker_id: W_FOLLOWUP,
    kind: "chat",
    status: "active",
    label: "Chat",
    description: "Direct conversation with the worker.",
    address: null,
    capability_note: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
  {
    id: ROUTE_EMAIL,
    workspace_id: WS,
    worker_id: W_FOLLOWUP,
    kind: "forward_email",
    status: "active",
    label: "Forward Email",
    description: "Forward client emails for follow-up drafting.",
    address: "followup@hartwell.clawback.dev",
    capability_note: "Parses forwarded threads and extracts action items.",
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
  {
    id: ROUTE_INBOX,
    workspace_id: WS,
    worker_id: W_FOLLOWUP,
    kind: "watched_inbox",
    status: "suggested",
    label: "Watched Inbox",
    description: "Monitors dave@hartwell.com for client threads.",
    address: "dave@hartwell.com",
    capability_note: "Read-only monitoring via Gmail connection.",
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Input routes (for incident worker)
// ---------------------------------------------------------------------------

export const incidentRoutes: InputRouteRecord[] = [
  {
    id: ROUTE_INCIDENT_CHAT,
    workspace_id: WS,
    worker_id: W_INCIDENT,
    kind: "chat",
    status: "active",
    label: "Chat",
    description: "Report and discuss incidents directly.",
    address: null,
    capability_note: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Input routes (for bugfix worker)
// ---------------------------------------------------------------------------

export const bugfixRoutes: InputRouteRecord[] = [
  {
    id: ROUTE_BUGFIX_CHAT,
    workspace_id: WS,
    worker_id: W_BUGFIX,
    kind: "chat",
    status: "active",
    label: "Chat",
    description: "Report and discuss bugs directly.",
    address: null,
    capability_note: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Connections (for follow-up worker)
// ---------------------------------------------------------------------------

export const followUpConnections: ConnectionRecord[] = [
  {
    id: CONN_GMAIL,
    workspace_id: WS,
    provider: "gmail",
    access_mode: "read_only",
    status: "not_connected",
    label: "Dave's Gmail (read-only)",
    capabilities: ["read_threads", "watch_inbox"],
    attached_worker_ids: [],
    created_at: YESTERDAY,
    updated_at: NOW,
  },
  {
    id: CONN_SMTP,
    workspace_id: WS,
    provider: "smtp_relay",
    access_mode: "write_capable",
    status: "not_connected",
    label: "Shared Mail Relay",
    capabilities: ["send_email"],
    attached_worker_ids: [W_FOLLOWUP],
    created_at: YESTERDAY,
    updated_at: NOW,
  },
  {
    id: CONN_CALENDAR,
    workspace_id: WS,
    provider: "calendar",
    access_mode: "read_only",
    status: "connected",
    label: "Team Calendar",
    capabilities: ["read_events"],
    attached_worker_ids: [W_FOLLOWUP],
    created_at: YESTERDAY,
    updated_at: NOW,
  },
];

// ---------------------------------------------------------------------------
// Action capabilities (for follow-up worker)
// ---------------------------------------------------------------------------

export const followUpActions: ActionCapabilityRecord[] = [
  {
    id: ACT_SEND_EMAIL,
    workspace_id: WS,
    worker_id: W_FOLLOWUP,
    kind: "send_email",
    boundary_mode: "ask_me",
    reviewer_ids: [DAVE],
    destination_connection_id: CONN_SMTP,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
  {
    id: ACT_SAVE_WORK,
    workspace_id: WS,
    worker_id: W_FOLLOWUP,
    kind: "save_work",
    boundary_mode: "auto",
    reviewer_ids: [],
    destination_connection_id: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Action capabilities (for incident worker)
// ---------------------------------------------------------------------------

export const incidentActions: ActionCapabilityRecord[] = [
  {
    id: ACT_INCIDENT_TICKET,
    workspace_id: WS,
    worker_id: W_INCIDENT,
    kind: "create_ticket",
    boundary_mode: "ask_me",
    reviewer_ids: [DAVE],
    destination_connection_id: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
  {
    id: ACT_INCIDENT_SAVE,
    workspace_id: WS,
    worker_id: W_INCIDENT,
    kind: "save_work",
    boundary_mode: "auto",
    reviewer_ids: [],
    destination_connection_id: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Action capabilities (for bugfix worker)
// ---------------------------------------------------------------------------

export const bugfixActions: ActionCapabilityRecord[] = [
  {
    id: ACT_BUGFIX_TICKET,
    workspace_id: WS,
    worker_id: W_BUGFIX,
    kind: "create_ticket",
    boundary_mode: "ask_me",
    reviewer_ids: [DAVE],
    destination_connection_id: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
  {
    id: ACT_BUGFIX_SAVE,
    workspace_id: WS,
    worker_id: W_BUGFIX,
    kind: "save_work",
    boundary_mode: "auto",
    reviewer_ids: [],
    destination_connection_id: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Work items
// ---------------------------------------------------------------------------

export const workItems: WorkItemRecord[] = [
  {
    id: WI_DRAFT,
    workspace_id: WS,
    worker_id: W_FOLLOWUP,
    kind: "email_draft",
    status: "pending_review",
    title: "Follow-up: Acme Corp renewal discussion",
    summary: "Draft reply to Sarah at Acme regarding Q3 renewal terms.",
    assignee_ids: [EMMA],
    reviewer_ids: [DAVE],
    source_route_kind: "watched_inbox",
    source_event_id: "evt_src_01",
    review_id: REV_01,
    run_id: "run_fu_01",
    draft_to: "sarah@acmecorp.com",
    draft_subject: "Re: Acme Corp renewal discussion",
    draft_body:
      "Hi Sarah,\n\nThanks for the update about \"Acme Corp renewal discussion\". I reviewed your note and drafted a follow-up.\n\nBest,\nClawback team",
    execution_status: "not_requested",
    execution_error: null,
    triage_json: null,
    created_at: HOUR_AGO,
    updated_at: NOW,
  },
  {
    id: WI_SENT,
    workspace_id: WS,
    worker_id: W_FOLLOWUP,
    kind: "sent_update",
    status: "sent",
    title: "Status update: Widget Inc onboarding",
    summary: "Sent weekly onboarding progress update to Widget Inc team.",
    assignee_ids: [EMMA],
    reviewer_ids: [],
    source_route_kind: "schedule",
    source_event_id: null,
    review_id: null,
    run_id: "run_fu_02",
    draft_to: "team@widgetinc.com",
    draft_subject: "Widget Inc onboarding status update",
    draft_body:
      "Hi team,\n\nHere is the weekly onboarding update for Widget Inc.\n\nBest,\nClawback team",
    execution_status: "completed",
    execution_error: null,
    triage_json: null,
    created_at: TWO_HOURS_AGO,
    updated_at: TWO_HOURS_AGO,
  },
  {
    id: WI_PROPOSAL,
    workspace_id: WS,
    worker_id: W_PROPOSAL,
    kind: "proposal_draft",
    status: "draft",
    title: "Proposal: Globex consulting engagement",
    summary: "Initial draft for Globex Corp consulting scope and pricing.",
    assignee_ids: [DAVE],
    reviewer_ids: [DAVE],
    source_route_kind: "chat",
    source_event_id: null,
    review_id: null,
    run_id: "run_prop_01",
    draft_to: null,
    draft_subject: null,
    draft_body: null,
    execution_status: "not_requested",
    execution_error: null,
    triage_json: null,
    created_at: YESTERDAY,
    updated_at: HOUR_AGO,
  },
];

// ---------------------------------------------------------------------------
// Inbox items
// ---------------------------------------------------------------------------

export const inboxItems: InboxItemRecord[] = [
  {
    id: INBOX_REVIEW,
    workspace_id: WS,
    kind: "review",
    title: "Review email draft: Acme Corp renewal",
    summary: "The Follow-Up worker drafted a reply for Dave to review before sending.",
    assignee_ids: [DAVE],
    worker_id: W_FOLLOWUP,
    work_item_id: WI_DRAFT,
    review_id: REV_01,
    route_kind: "watched_inbox",
    state: "open",
    triage_json: null,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: INBOX_SHADOW,
    workspace_id: WS,
    kind: "shadow",
    title: "Shadow mode: Proposal worker processed a brief",
    summary: "The Proposal worker ran against Globex brief. No action was taken (shadow mode).",
    assignee_ids: [DAVE],
    worker_id: W_PROPOSAL,
    work_item_id: WI_PROPOSAL,
    review_id: null,
    route_kind: "chat",
    state: "open",
    triage_json: null,
    created_at: HOUR_AGO,
    updated_at: HOUR_AGO,
  },
  {
    id: INBOX_SETUP,
    workspace_id: WS,
    kind: "setup",
    title: "Connect Gmail to enable proactive follow-ups",
    summary: "The Follow-Up worker can monitor your inbox if you connect Gmail with read access.",
    assignee_ids: [EMMA],
    worker_id: W_FOLLOWUP,
    work_item_id: null,
    review_id: null,
    route_kind: null,
    state: "open",
    triage_json: null,
    created_at: YESTERDAY,
    updated_at: YESTERDAY,
  },
];

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export const reviewDetail: ReviewRecord = {
  id: REV_01,
  workspace_id: WS,
  action_kind: "send_email",
  status: "pending",
  worker_id: W_FOLLOWUP,
  work_item_id: WI_DRAFT,
  reviewer_ids: [DAVE],
  assignee_ids: [EMMA],
  source_route_kind: "watched_inbox",
  action_destination: "sarah@acmecorp.com",
  requested_at: NOW,
  resolved_at: null,
  created_at: NOW,
  updated_at: NOW,
};

// ---------------------------------------------------------------------------
// Activity events
// ---------------------------------------------------------------------------

export const activityEvents: ActivityEventRecord[] = [
  {
    id: EVT_01,
    timestamp: NOW,
    worker_id: W_FOLLOWUP,
    route_kind: "watched_inbox",
    result_kind: "review_requested",
    title: "Review requested for Acme Corp follow-up email",
    summary: "Dave needs to approve the draft before it sends.",
    assignee_ids: [DAVE],
    run_id: "run_fu_01",
    work_item_id: WI_DRAFT,
    review_id: REV_01,
  },
  {
    id: EVT_02,
    timestamp: HOUR_AGO,
    worker_id: W_FOLLOWUP,
    route_kind: "forward_email",
    result_kind: "work_item_created",
    title: "Email draft created: Acme Corp renewal",
    summary: null,
    assignee_ids: [EMMA],
    run_id: "run_fu_01",
    work_item_id: WI_DRAFT,
    review_id: null,
  },
  {
    id: EVT_03,
    timestamp: TWO_HOURS_AGO,
    worker_id: W_FOLLOWUP,
    route_kind: "chat",
    result_kind: "work_item_sent",
    title: "Follow-Up worker finished processing Widget Inc update",
    summary: "Sent status update successfully.",
    assignee_ids: [EMMA],
    run_id: "run_fu_02",
    work_item_id: WI_SENT,
    review_id: null,
  },
];

// ---------------------------------------------------------------------------
// Connectors (document indexing)
// ---------------------------------------------------------------------------

export const docsConnector: ConnectorRecord = {
  id: CTR_DOCS,
  workspace_id: WS,
  type: "local_directory",
  name: "Company Docs",
  status: "active",
  config: {
    root_path: "./docs",
    recursive: true,
    include_extensions: [".md", ".mdx", ".txt", ".json", ".yaml", ".yml"],
  },
  created_by: DAVE,
  created_at: YESTERDAY,
  updated_at: NOW,
};

export const connectors: ConnectorRecord[] = [docsConnector];

// ---------------------------------------------------------------------------
// Today responses (Dave and Emma views)
// ---------------------------------------------------------------------------

import type { TodayResponse } from "../today.js";

export const daveTodayResponse: TodayResponse = {
  viewer: { user_id: DAVE, display_name: "Dave Hartwell", role: "admin" },
  stats: { inbox_waiting: 3, team_items_today: 6, workers_active: 4, connections_active: 1 },
  for_you: [inboxItems[0]!, inboxItems[2]!],
  team: [workItems[0]!, workItems[1]!, workItems[2]!],
  worker_snapshots: [
    { id: W_FOLLOWUP, name: "Client Follow-Up", kind: "follow_up", open_inbox_count: 2, recent_work_count: 3 },
    { id: W_PROPOSAL, name: "Proposal", kind: "proposal", open_inbox_count: 1, recent_work_count: 1 },
    { id: W_INCIDENT, name: "Incident", kind: "incident", open_inbox_count: 0, recent_work_count: 0 },
    { id: W_BUGFIX, name: "Bugfix", kind: "bugfix", open_inbox_count: 0, recent_work_count: 0 },
  ],
  recent_work: workItems,
};

export const emmaTodayResponse: TodayResponse = {
  viewer: { user_id: EMMA, display_name: "Emma Chen", role: "user" },
  stats: { inbox_waiting: 1, team_items_today: 6, workers_active: 4, connections_active: 1 },
  for_you: [inboxItems[1]!],
  team: [workItems[0]!, workItems[1]!, workItems[2]!],
  worker_snapshots: [
    { id: W_FOLLOWUP, name: "Client Follow-Up", kind: "follow_up", open_inbox_count: 2, recent_work_count: 3 },
    { id: W_PROPOSAL, name: "Proposal", kind: "proposal", open_inbox_count: 1, recent_work_count: 1 },
  ],
  recent_work: workItems,
};
