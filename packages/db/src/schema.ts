import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const workspaceStatusEnum = pgEnum("workspace_status", ["active", "suspended"]);
export const userKindEnum = pgEnum("user_kind", ["human", "service"]);
export const userStatusEnum = pgEnum("user_status", ["active", "disabled"]);
export const identityProviderEnum = pgEnum("identity_provider", [
  "local-password",
  "oidc",
  "service-token",
]);
export const membershipRoleEnum = pgEnum("membership_role", ["admin", "user"]);
export const agentScopeEnum = pgEnum("agent_scope", ["personal", "shared"]);
export const agentStatusEnum = pgEnum("agent_status", ["active", "archived"]);
export const agentVersionStatusEnum = pgEnum("agent_version_status", [
  "draft",
  "published",
  "superseded",
]);
export const conversationChannelEnum = pgEnum("conversation_channel", ["web"]);
export const conversationStatusEnum = pgEnum("conversation_status", ["active", "archived"]);
export const messageRoleEnum = pgEnum("message_role", ["user", "assistant"]);
export const runStatusEnum = pgEnum("run_status", [
  "queued",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
  "canceled",
]);
export const auditActorTypeEnum = pgEnum("audit_actor_type", ["user", "service", "system"]);
export const connectorTypeEnum = pgEnum("connector_type", ["local_directory"]);
export const connectorStatusEnum = pgEnum("connector_status", ["active", "disabled"]);
export const connectorSyncStatusEnum = pgEnum("connector_sync_status", [
  "queued",
  "running",
  "completed",
  "failed",
]);
export const toolRiskClassEnum = pgEnum("tool_risk_class", [
  "safe",
  "guarded",
  "approval_gated",
  "restricted",
]);
export const approvalRequestStatusEnum = pgEnum("approval_request_status", [
  "pending",
  "approved",
  "denied",
  "expired",
  "canceled",
]);
export const approvalDecisionEnum = pgEnum("approval_decision", [
  "approved",
  "denied",
  "expired",
  "canceled",
]);
export const approvalSurfaceChannelEnum = pgEnum("approval_surface_channel", ["whatsapp", "slack"]);
export const approvalSurfaceIdentityStatusEnum = pgEnum("approval_surface_identity_status", [
  "allowed",
  "disabled",
]);
export const ticketProviderEnum = pgEnum("ticket_provider", ["mock"]);
export const ticketStatusEnum = pgEnum("ticket_status", ["draft", "created", "failed"]);
export const documentAclSubjectTypeEnum = pgEnum("document_acl_subject_type", [
  "workspace",
  "user",
  "group",
]);

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  status: workspaceStatusEnum("status").notNull().default("active"),
  settingsJson: jsonb("settings_json").notNull().default({}),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  slugIdx: uniqueIndex("workspaces_slug_key").on(table.slug),
}));

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  normalizedEmail: text("normalized_email").notNull(),
  displayName: text("display_name").notNull(),
  kind: userKindEnum("kind").notNull().default("human"),
  status: userStatusEnum("status").notNull().default("active"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  normalizedEmailIdx: uniqueIndex("users_normalized_email_key").on(table.normalizedEmail),
}));

export const identities = pgTable("identities", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: identityProviderEnum("provider").notNull(),
  subject: text("subject").notNull(),
  passwordHash: text("password_hash"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  providerSubjectIdx: uniqueIndex("identities_provider_subject_key").on(
    table.provider,
    table.subject,
  ),
  userProviderIdx: uniqueIndex("identities_user_provider_key").on(table.userId, table.provider),
}));

export const memberships = pgTable("memberships", {
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  role: membershipRoleEnum("role").notNull(),
  createdAt: timestamps.createdAt,
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.userId], name: "memberships_pkey" }),
}));

export const invitations = pgTable("invitations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: membershipRoleEnum("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamps.createdAt,
}, (table) => ({
  tokenHashIdx: uniqueIndex("invitations_token_hash_key").on(table.tokenHash),
}));

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamps.createdAt,
}, (table) => ({
  tokenHashIdx: uniqueIndex("sessions_token_hash_key").on(table.tokenHash),
}));

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  scope: agentScopeEnum("scope").notNull(),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  status: agentStatusEnum("status").notNull().default("active"),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceSlugIdx: uniqueIndex("agents_workspace_slug_key").on(table.workspaceId, table.slug),
}));

export const agentVersions = pgTable("agent_versions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  status: agentVersionStatusEnum("status").notNull(),
  personaJson: jsonb("persona_json").notNull().default({}),
  instructionsMarkdown: text("instructions_markdown").notNull().default(""),
  modelRoutingJson: jsonb("model_routing_json").notNull().default({}),
  toolPolicyJson: jsonb("tool_policy_json").notNull().default({}),
  connectorPolicyJson: jsonb("connector_policy_json").notNull().default({}),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamps.createdAt,
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => ({
  agentVersionIdx: uniqueIndex("agent_versions_agent_version_number_key").on(
    table.agentId,
    table.versionNumber,
  ),
  oneDraftPerAgentIdx: uniqueIndex("agent_versions_one_draft_per_agent_key")
    .on(table.agentId)
    .where(sql`${table.status} = 'draft'`),
  onePublishedPerAgentIdx: uniqueIndex("agent_versions_one_published_per_agent_key")
    .on(table.agentId)
    .where(sql`${table.status} = 'published'`),
}));

export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "restrict" }),
  agentVersionId: text("agent_version_id")
    .notNull()
    .references(() => agentVersions.id, { onDelete: "restrict" }),
  channel: conversationChannelEnum("channel").notNull().default("web"),
  startedBy: text("started_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: conversationStatusEnum("status").notNull().default("active"),
  title: text("title"),
  lastMessageAt: timestamp("last_message_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  runId: text("run_id"),
  sequence: integer("sequence").notNull(),
  role: messageRoleEnum("role").notNull(),
  authorUserId: text("author_user_id").references(() => users.id, { onDelete: "set null" }),
  contentJson: jsonb("content_json").notNull(),
  citationsJson: jsonb("citations_json"),
  tokenUsageJson: jsonb("token_usage_json"),
  createdAt: timestamps.createdAt,
}, (table) => ({
  conversationSequenceIdx: uniqueIndex("messages_conversation_sequence_key").on(
    table.conversationId,
    table.sequence,
  ),
}));

export const connectors = pgTable("connectors", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  type: connectorTypeEnum("type").notNull(),
  name: text("name").notNull(),
  status: connectorStatusEnum("status").notNull().default("active"),
  configJson: jsonb("config_json").notNull().default({}),
  createdBy: text("created_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceNameIdx: uniqueIndex("connectors_workspace_name_key").on(table.workspaceId, table.name),
}));

export const connectorSyncJobs = pgTable("connector_sync_jobs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectorId: text("connector_id")
    .notNull()
    .references(() => connectors.id, { onDelete: "cascade" }),
  status: connectorSyncStatusEnum("status").notNull().default("queued"),
  requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  errorSummary: text("error_summary"),
  statsJson: jsonb("stats_json"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

export const documents = pgTable("documents", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectorId: text("connector_id")
    .notNull()
    .references(() => connectors.id, { onDelete: "cascade" }),
  externalId: text("external_id").notNull(),
  pathOrUri: text("path_or_uri").notNull(),
  title: text("title"),
  mimeType: text("mime_type"),
  currentVersionId: text("current_version_id"),
  aclHash: text("acl_hash"),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  connectorExternalIdx: uniqueIndex("documents_connector_external_id_key").on(
    table.connectorId,
    table.externalId,
  ),
  workspaceConnectorIdx: index("documents_workspace_connector_idx").on(
    table.workspaceId,
    table.connectorId,
  ),
  workspaceConnectorCurrentVersionIdx: index("documents_workspace_connector_current_version_idx").on(
    table.workspaceId,
    table.connectorId,
    table.currentVersionId,
  ),
}));

export const documentVersions = pgTable("document_versions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectorId: text("connector_id")
    .notNull()
    .references(() => connectors.id, { onDelete: "cascade" }),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  contentHash: text("content_hash").notNull(),
  contentText: text("content_text").notNull(),
  sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
  byteSize: integer("byte_size").notNull().default(0),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamps.createdAt,
}, (table) => ({
  documentHashIdx: uniqueIndex("document_versions_document_hash_key").on(
    table.documentId,
    table.contentHash,
  ),
}));

export const documentChunks = pgTable("document_chunks", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  connectorId: text("connector_id")
    .notNull()
    .references(() => connectors.id, { onDelete: "cascade" }),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  documentVersionId: text("document_version_id")
    .notNull()
    .references(() => documentVersions.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull(),
  contentText: text("content_text").notNull(),
  tokenCount: integer("token_count").notNull().default(0),
  metadataJson: jsonb("metadata_json").notNull().default({}),
  createdAt: timestamps.createdAt,
}, (table) => ({
  versionChunkIdx: uniqueIndex("document_chunks_version_chunk_index_key").on(
    table.documentVersionId,
    table.chunkIndex,
  ),
  workspaceConnectorIdx: index("document_chunks_workspace_connector_idx").on(
    table.workspaceId,
    table.connectorId,
  ),
  workspaceConnectorDocumentVersionIdx: index("document_chunks_workspace_connector_document_version_idx").on(
    table.workspaceId,
    table.connectorId,
    table.documentId,
    table.documentVersionId,
  ),
}));

export const documentAclBindings = pgTable("document_acl_bindings", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  subjectType: documentAclSubjectTypeEnum("subject_type").notNull(),
  subjectId: text("subject_id"),
  createdAt: timestamps.createdAt,
}, (table) => ({
  docSubjectIdx: uniqueIndex("document_acl_bindings_document_subject_key").on(
    table.documentId,
    table.subjectType,
    table.subjectId,
  ),
}));

export const runs = pgTable("runs", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "restrict" }),
  agentVersionId: text("agent_version_id")
    .notNull()
    .references(() => agentVersions.id, { onDelete: "restrict" }),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  inputMessageId: text("input_message_id").notNull(),
  initiatedBy: text("initiated_by")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  channel: conversationChannelEnum("channel").notNull().default("web"),
  status: runStatusEnum("status").notNull().default("queued"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  currentStep: text("current_step"),
  summary: text("summary"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

export const runSnapshots = pgTable("run_snapshots", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  snapshotVersion: integer("snapshot_version").notNull().default(1),
  agentSnapshotJson: jsonb("agent_snapshot_json").notNull(),
  toolPolicyJson: jsonb("tool_policy_json").notNull(),
  connectorScopeJson: jsonb("connector_scope_json").notNull(),
  modelProfileJson: jsonb("model_profile_json").notNull(),
  actorSummaryJson: jsonb("actor_summary_json").notNull(),
  approvalPolicyJson: jsonb("approval_policy_json").notNull(),
  conversationBindingJson: jsonb("conversation_binding_json").notNull(),
  inputMessageJson: jsonb("input_message_json").notNull(),
  createdAt: timestamps.createdAt,
}, (table) => ({
  runIdIdx: uniqueIndex("run_snapshots_run_id_key").on(table.runId),
}));

export const runEvents = pgTable("run_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull(),
  sequence: integer("sequence").notNull(),
  actorType: auditActorTypeEnum("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamps.createdAt,
}, (table) => ({
  runSequenceIdx: uniqueIndex("run_events_run_sequence_key").on(table.runId, table.sequence),
}));

export const approvalRequests = pgTable("approval_requests", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  toolInvocationId: text("tool_invocation_id").notNull(),
  toolName: text("tool_name").notNull(),
  actionType: text("action_type").notNull(),
  riskClass: toolRiskClassEnum("risk_class").notNull(),
  status: approvalRequestStatusEnum("status").notNull().default("pending"),
  requestedBy: text("requested_by").references(() => users.id, { onDelete: "set null" }),
  approverScopeJson: jsonb("approver_scope_json").notNull().default({}),
  requestPayloadJson: jsonb("request_payload_json").notNull().default({}),
  decisionDueAt: timestamp("decision_due_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  runToolInvocationIdx: uniqueIndex("approval_requests_run_tool_invocation_key").on(
    table.runId,
    table.toolInvocationId,
  ),
}));

export const approvalDecisions = pgTable("approval_decisions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  approvalRequestId: text("approval_request_id")
    .notNull()
    .references(() => approvalRequests.id, { onDelete: "cascade" }),
  runId: text("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  decision: approvalDecisionEnum("decision").notNull(),
  decidedBy: text("decided_by").references(() => users.id, { onDelete: "set null" }),
  rationale: text("rationale"),
  payloadJson: jsonb("payload_json").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamps.createdAt,
}, (table) => ({
  approvalRequestIdx: uniqueIndex("approval_decisions_approval_request_id_key").on(
    table.approvalRequestId,
  ),
}));

export const ticketRecords = pgTable("ticket_records", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  runId: text("run_id").references(() => runs.id, { onDelete: "set null" }),
  approvalRequestId: text("approval_request_id").references(() => approvalRequests.id, {
    onDelete: "set null",
  }),
  provider: ticketProviderEnum("provider").notNull().default("mock"),
  status: ticketStatusEnum("status").notNull().default("draft"),
  externalRef: text("external_ref"),
  title: text("title").notNull(),
  summary: text("summary").notNull(),
  bodyJson: jsonb("body_json").notNull().default({}),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
});

// ---------------------------------------------------------------------------
// V1 Product Tables
// ---------------------------------------------------------------------------

export const workerKindEnum = pgEnum("worker_kind", [
  "follow_up",
  "proposal",
  "incident",
  "bugfix",
]);

export const workerScopeEnum = pgEnum("worker_scope", ["personal", "shared"]);

export const workerStatusEnum = pgEnum("worker_status", ["draft", "active", "paused"]);

export const workers = pgTable("workers", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  kind: workerKindEnum("kind").notNull(),
  scope: workerScopeEnum("scope").notNull(),
  status: workerStatusEnum("status").notNull().default("draft"),
  summary: text("summary"),
  memberIds: jsonb("member_ids").notNull().default([]),
  assigneeIds: jsonb("assignee_ids").notNull().default([]),
  reviewerIds: jsonb("reviewer_ids").notNull().default([]),
  inputRouteIds: jsonb("input_route_ids").notNull().default([]),
  connectionIds: jsonb("connection_ids").notNull().default([]),
  actionIds: jsonb("action_ids").notNull().default([]),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceSlugIdx: uniqueIndex("workers_workspace_slug_key").on(table.workspaceId, table.slug),
  workspaceIdx: index("workers_workspace_idx").on(table.workspaceId),
}));

export const inputRouteKindEnum = pgEnum("input_route_kind", [
  "chat",
  "forward_email",
  "watched_inbox",
  "upload",
  "schedule",
  "webhook",
]);

export const inputRouteStatusEnum = pgEnum("input_route_status", ["inactive", "active", "suggested"]);

export const inputRoutes = pgTable("input_routes", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "cascade" }),
  kind: inputRouteKindEnum("kind").notNull(),
  status: inputRouteStatusEnum("status").notNull().default("inactive"),
  label: text("label").notNull(),
  description: text("description"),
  address: text("address"),
  capabilityNote: text("capability_note"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workerIdx: index("input_routes_worker_idx").on(table.workerId),
  workspaceIdx: index("input_routes_workspace_idx").on(table.workspaceId),
}));

export const connectionProviderEnum = pgEnum("connection_provider", [
  "gmail",
  "n8n",
  "smtp_relay",
  "calendar",
  "drive",
  "github",
  "ticketing",
  "notion",
  "slack",
  "whatsapp",
]);

export const connectionAccessModeEnum = pgEnum("connection_access_mode", ["read_only", "write_capable"]);

export const connectionStatusEnum = pgEnum("connection_status", [
  "not_connected",
  "suggested",
  "connected",
  "error",
]);

export const connections = pgTable("connections", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  provider: connectionProviderEnum("provider").notNull(),
  accessMode: connectionAccessModeEnum("access_mode").notNull(),
  status: connectionStatusEnum("status").notNull().default("not_connected"),
  label: text("label").notNull(),
  capabilities: jsonb("capabilities").notNull().default([]),
  attachedWorkerIds: jsonb("attached_worker_ids").notNull().default([]),
  configJson: jsonb("config_json").notNull().default({}),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceIdx: index("connections_workspace_idx").on(table.workspaceId),
}));

export const actionCapabilityKindEnum = pgEnum("action_capability_kind", [
  "send_email",
  "run_external_workflow",
  "save_work",
  "create_ticket",
  "open_pr",
]);

export const boundaryModeEnum = pgEnum("boundary_mode", ["auto", "ask_me", "never"]);

export const actionCapabilities = pgTable("action_capabilities", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "cascade" }),
  kind: actionCapabilityKindEnum("kind").notNull(),
  boundaryMode: boundaryModeEnum("boundary_mode").notNull().default("ask_me"),
  reviewerIds: jsonb("reviewer_ids").notNull().default([]),
  destinationConnectionId: text("destination_connection_id"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workerIdx: index("action_capabilities_worker_idx").on(table.workerId),
  workspaceIdx: index("action_capabilities_workspace_idx").on(table.workspaceId),
}));

export const workItemKindEnum = pgEnum("work_item_kind", [
  "email_draft",
  "sent_update",
  "proposal_draft",
  "ticket_draft",
  "created_ticket",
  "pr_draft",
  "action_plan",
  "meeting_recap",
]);

export const workItemStatusEnum = pgEnum("work_item_status", [
  "draft",
  "pending_review",
  "approved",
  "completed",
  "sent",
  "created",
  "failed",
]);

export const workItemExecutionStatusEnum = pgEnum("work_item_execution_status", [
  "not_requested",
  "queued",
  "executing",
  "completed",
  "failed",
]);

export const workItems = pgTable("work_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "cascade" }),
  kind: workItemKindEnum("kind").notNull(),
  status: workItemStatusEnum("status").notNull().default("draft"),
  title: text("title").notNull(),
  summary: text("summary"),
  draftTo: text("draft_to"),
  draftSubject: text("draft_subject"),
  draftBody: text("draft_body"),
  executionStatus: workItemExecutionStatusEnum("execution_status").notNull().default("not_requested"),
  executionError: text("execution_error"),
  assigneeIds: jsonb("assignee_ids").notNull().default([]),
  reviewerIds: jsonb("reviewer_ids").notNull().default([]),
  sourceRouteKind: inputRouteKindEnum("source_route_kind"),
  sourceEventId: text("source_event_id"),
  sourceInboxItemId: text("source_inbox_item_id"),
  reviewId: text("review_id"),
  runId: text("run_id"),
  triageJson: jsonb("triage_json"),
  executionStateJson: jsonb("execution_state_json"),
  executionOutcomeJson: jsonb("execution_outcome_json"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceIdx: index("work_items_workspace_idx").on(table.workspaceId),
  workerIdx: index("work_items_worker_idx").on(table.workerId),
  workspaceStatusIdx: index("work_items_workspace_status_idx").on(table.workspaceId, table.status),
  sourceInboxItemIdx: uniqueIndex("work_items_source_inbox_item_id_key").on(table.sourceInboxItemId),
}));

export const inboxItemKindEnum = pgEnum("inbox_item_kind", [
  "review",
  "shadow",
  "setup",
  "boundary",
]);

export const inboxItemStateEnum = pgEnum("inbox_item_state", ["open", "resolved", "dismissed"]);

export const inboxItems = pgTable("inbox_items", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  kind: inboxItemKindEnum("kind").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  assigneeIds: jsonb("assignee_ids").notNull().default([]),
  workerId: text("worker_id"),
  workItemId: text("work_item_id"),
  reviewId: text("review_id"),
  routeKind: inputRouteKindEnum("route_kind"),
  state: inboxItemStateEnum("state").notNull().default("open"),
  triageJson: jsonb("triage_json"),
  executionStateJson: jsonb("execution_state_json"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceIdx: index("inbox_items_workspace_idx").on(table.workspaceId),
  workspaceStateIdx: index("inbox_items_workspace_state_idx").on(table.workspaceId, table.state),
}));

export const reviewActionKindEnum = pgEnum("review_action_kind", [
  "send_email",
  "run_external_workflow",
  "save_work",
  "create_ticket",
  "open_pr",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "pending",
  "approved",
  "denied",
  "expired",
  "failed",
  "completed",
]);
export const reviewDecisionEnum = pgEnum("review_decision", ["approved", "denied"]);

export const reviews = pgTable("reviews", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actionKind: reviewActionKindEnum("action_kind").notNull(),
  status: reviewStatusEnum("review_status").notNull().default("pending"),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "cascade" }),
  workItemId: text("work_item_id"),
  reviewerIds: jsonb("reviewer_ids").notNull().default([]),
  assigneeIds: jsonb("assignee_ids").notNull().default([]),
  sourceRouteKind: inputRouteKindEnum("source_route_kind"),
  actionDestination: text("action_destination"),
  requestPayloadJson: jsonb("request_payload_json"),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceIdx: index("reviews_workspace_idx").on(table.workspaceId),
  workspaceStatusIdx: index("reviews_workspace_status_idx").on(table.workspaceId, table.status),
  workerIdx: index("reviews_worker_idx").on(table.workerId),
}));

export const reviewDecisionSurfaceEnum = pgEnum("review_decision_surface", ["web", "whatsapp", "slack"]);

export const reviewDecisions = pgTable("review_decisions", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  reviewId: text("review_id")
    .notNull()
    .references(() => reviews.id, { onDelete: "cascade" }),
  decision: reviewDecisionEnum("decision").notNull(),
  surface: reviewDecisionSurfaceEnum("surface").notNull(),
  decidedByUserId: text("decided_by_user_id").references(() => users.id, { onDelete: "set null" }),
  actorExternalId: text("actor_external_id"),
  rationale: text("rationale"),
  payloadJson: jsonb("payload_json").notNull().default({}),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamps.createdAt,
}, (table) => ({
  workspaceIdx: index("review_decisions_workspace_idx").on(table.workspaceId),
  reviewIdx: uniqueIndex("review_decisions_review_id_key").on(table.reviewId),
}));

export const approvalSurfaceIdentities = pgTable("approval_surface_identities", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  channel: approvalSurfaceChannelEnum("channel").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  externalIdentity: text("external_identity").notNull(),
  label: text("label").notNull(),
  status: approvalSurfaceIdentityStatusEnum("status").notNull().default("allowed"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceIdx: index("approval_surface_identities_workspace_idx").on(table.workspaceId),
  workspaceChannelUserIdx: uniqueIndex("approval_surface_identities_workspace_channel_user_key").on(
    table.workspaceId,
    table.channel,
    table.userId,
  ),
  workspaceChannelIdentityIdx: uniqueIndex("approval_surface_identities_workspace_channel_identity_key").on(
    table.workspaceId,
    table.channel,
    table.externalIdentity,
  ),
}));

export const activityEvents = pgTable("activity_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  workerId: text("worker_id"),
  routeKind: inputRouteKindEnum("route_kind"),
  resultKind: text("result_kind").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  assigneeIds: jsonb("assignee_ids").notNull().default([]),
  runId: text("run_id"),
  workItemId: text("work_item_id"),
  reviewId: text("review_id"),
  createdAt: timestamps.createdAt,
}, (table) => ({
  workspaceIdx: index("activity_events_workspace_idx").on(table.workspaceId),
  workspaceTimestampIdx: index("activity_events_workspace_timestamp_idx").on(table.workspaceId, table.timestamp),
}));

// ---------------------------------------------------------------------------
// Source Events (T8 — inbound email and other source event tracking)
// ---------------------------------------------------------------------------

export const sourceEventKindEnum = pgEnum("source_event_kind", [
  "forwarded_email",
  "watched_inbox",
  "chat_input",
  "upload",
  "schedule",
  "webhook",
]);

export const sourceEvents = pgTable("source_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id, { onDelete: "cascade" }),
  inputRouteId: text("input_route_id"),
  kind: sourceEventKindEnum("kind").notNull(),
  externalMessageId: text("external_message_id"),
  fromAddress: text("from_address"),
  toAddress: text("to_address"),
  subject: text("subject"),
  bodyText: text("body_text"),
  bodyHtml: text("body_html"),
  attachmentsJson: jsonb("attachments_json").notNull().default([]),
  rawPayloadJson: jsonb("raw_payload_json").notNull().default({}),
  triageJson: jsonb("triage_json"),
  createdAt: timestamps.createdAt,
}, (table) => ({
  workspaceIdx: index("source_events_workspace_idx").on(table.workspaceId),
  workerIdx: index("source_events_worker_idx").on(table.workerId),
  externalMessageIdx: uniqueIndex("source_events_external_message_id_key")
    .on(table.workspaceId, table.externalMessageId),
}));

// ---------------------------------------------------------------------------
// Relationship Memory Tables (R1)
// ---------------------------------------------------------------------------

export const relationshipClassEnum = pgEnum("relationship_class", [
  "customer",
  "prospect",
  "vendor",
  "internal",
  "blocked",
  "unknown",
]);

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  primaryDomain: text("primary_domain"),
  relationshipClass: relationshipClassEnum("relationship_class"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  handlingNote: text("handling_note"),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceIdx: index("accounts_workspace_idx").on(table.workspaceId),
  workspaceDomainIdx: index("accounts_workspace_domain_idx").on(table.workspaceId, table.primaryDomain),
}));

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  primaryEmail: text("primary_email").notNull(),
  displayName: text("display_name").notNull(),
  accountId: text("account_id").references(() => accounts.id, { onDelete: "set null" }),
  relationshipClass: relationshipClassEnum("relationship_class"),
  ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
  handlingNote: text("handling_note"),
  doNotAutoReply: boolean("do_not_auto_reply").notNull().default(false),
  createdAt: timestamps.createdAt,
  updatedAt: timestamps.updatedAt,
}, (table) => ({
  workspaceEmailIdx: uniqueIndex("contacts_workspace_email_key").on(table.workspaceId, table.primaryEmail),
  workspaceIdx: index("contacts_workspace_idx").on(table.workspaceId),
}));

export const auditEvents = pgTable("audit_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  actorType: auditActorTypeEnum("actor_type").notNull(),
  actorId: text("actor_id").notNull(),
  eventType: text("event_type").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  summary: text("summary").notNull(),
  payloadJson: jsonb("payload_json").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: timestamps.createdAt,
});
