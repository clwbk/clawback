import {
  getActionResponseSchema,
  listActionsResponseSchema,
  agentListResponseSchema,
  artifactListResponseSchema,
  getArtifactResponseSchema,
  authenticatedSessionResponseSchema,
  todayResponseSchema,
  workerListResponseSchema,
  getWorkerResponseSchema as getWorkspaceWorkerResponseSchema,
  workItemListResponseSchema,
  getWorkItemResponseSchema as getWorkspaceWorkItemResponseSchema,
  inboxListResponseSchema,
  connectionListResponseSchema as workspaceConnectionListResponseSchema,
  getConnectionResponseSchema as getWorkspaceConnectionResponseSchema,
  activityListResponseSchema,
  getReviewResponseSchema as getWorkspaceReviewResponseSchema,
  inputRouteListResponseSchema,
  actionCapabilityListResponseSchema,
  workspacePeopleListResponseSchema,
  gmailPilotSetupResponseSchema,
  gmailPilotPollResponseSchema,
  gmailPilotScopeKindSchema,
  actionCapabilityRecordSchema,
  connectorListResponseSchema,
  connectorSyncJobListResponseSchema,
  createConnectorResponseSchema,
  conversationDetailResponseSchema,
  conversationListResponseSchema,
  createAgentResponseSchema,
  createConversationResponseSchema,
  createRunResponseSchema,
  getApprovalResponseSchema,
  getAgentDraftResponseSchema,
  getAgentResponseSchema,
  getRunResponseSchema,
  listApprovalsResponseSchema,
  publishAgentResponseSchema,
  requestConnectorSyncResponseSchema,
  resolveApprovalRequestSchema,
  ticketListResponseSchema,
  runtimeControlStatusResponseSchema,
  runtimeReadinessResponseSchema,
  runtimeRestartResponseSchema,
  runEventListResponseSchema,
  setupStatusResponseSchema,
  sseEnvelopeSchema,
  registryResponseSchema,
  workerPackListResponseSchema,
  workerPackInstallResultSchema,
  approvalSurfaceIdentityListResponseSchema,
  approvalSurfaceIdentityRecordSchema,
  contactListResponseSchema,
  contactRecordSchema,
  accountListResponseSchema,
  accountRecordSchema,
  confirmRouteSuggestionResponseSchema,
} from "@clawback/contracts";
import type {
  RegistryResponse,
  RegistryConnectionProvider,
  RegistryWorkerPack,
  RegistrySetupStep,
  WorkerPackListResponse,
  WorkerPackInstallResult,
} from "@clawback/contracts";
import { z } from "zod";

type Schema<T> = {
  parse(value: unknown): T;
};

export class ControlPlaneRequestError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "ControlPlaneRequestError";
  }
}

export type AuthenticatedSession = z.infer<
  typeof authenticatedSessionResponseSchema
>;
export type TodayResponse = z.infer<typeof todayResponseSchema>;
export type WorkspaceWorkerListResponse = z.infer<
  typeof workerListResponseSchema
>;
export type WorkspaceWorkerRecord =
  WorkspaceWorkerListResponse["workers"][number];
export type WorkspaceWorkerDetail = z.infer<
  typeof getWorkspaceWorkerResponseSchema
>;
const workerDemoForwardEmailResponseSchema = z.object({
  scenario: z.literal("forward_email_sample"),
  worker_id: z.string().min(1),
  route_id: z.string().min(1),
  subject: z.string().min(1),
  deduplicated: z.boolean(),
  source_event_id: z.string().min(1),
  work_item_id: z.string().min(1),
  inbox_item_id: z.string().min(1),
  review_id: z.string().min(1),
});
export type WorkerDemoForwardEmailResult = z.infer<
  typeof workerDemoForwardEmailResponseSchema
>;
export type WorkspaceWorkItemListResponse = z.infer<
  typeof workItemListResponseSchema
>;
export type WorkspaceWorkItemRecord =
  WorkspaceWorkItemListResponse["work_items"][number];
export type WorkspaceWorkItemDetail = z.infer<
  typeof getWorkspaceWorkItemResponseSchema
>;
export type WorkspaceInboxListResponse = z.infer<
  typeof inboxListResponseSchema
>;
export type WorkspaceInboxItemRecord =
  WorkspaceInboxListResponse["items"][number];
export type WorkspaceConnectionListResponse = z.infer<
  typeof workspaceConnectionListResponseSchema
>;
export type WorkspaceConnectionRecord =
  WorkspaceConnectionListResponse["connections"][number];
export type WorkspaceConnectionDetail = z.infer<
  typeof getWorkspaceConnectionResponseSchema
>;
export type WorkspaceActivityListResponse = z.infer<
  typeof activityListResponseSchema
>;
export type WorkspaceActivityRecord =
  WorkspaceActivityListResponse["events"][number];
export type WorkspaceReviewDetail = z.infer<
  typeof getWorkspaceReviewResponseSchema
>;
export type WorkspaceInputRouteListResponse = z.infer<
  typeof inputRouteListResponseSchema
>;
export type WorkspaceInputRouteRecord =
  WorkspaceInputRouteListResponse["input_routes"][number];
export type WorkspaceActionCapabilityListResponse = z.infer<
  typeof actionCapabilityListResponseSchema
>;
export type WorkspaceActionCapabilityRecord =
  WorkspaceActionCapabilityListResponse["action_capabilities"][number];
export type WorkspacePeopleListResponse = z.infer<
  typeof workspacePeopleListResponseSchema
>;
export type WorkspacePersonRecord =
  WorkspacePeopleListResponse["people"][number];
export type ApprovalSurfaceIdentityListResponse = z.infer<
  typeof approvalSurfaceIdentityListResponseSchema
>;
export type ApprovalSurfaceIdentityRecord = z.infer<
  typeof approvalSurfaceIdentityRecordSchema
>;
export type GmailPilotSetupResponse = z.infer<
  typeof gmailPilotSetupResponseSchema
>;
export type GmailPilotSetupSummary = GmailPilotSetupResponse["setup"];
export type GmailPilotPollResponse = z.infer<
  typeof gmailPilotPollResponseSchema
>;
export type GmailPilotPollResult = GmailPilotPollResponse["poll"];
export type GmailPilotScopeKind = z.infer<typeof gmailPilotScopeKindSchema>;
export type SetupStatus = z.infer<typeof setupStatusResponseSchema>;
export type AgentListResponse = z.infer<typeof agentListResponseSchema>;
export type AgentRecord = AgentListResponse["agents"][number];
export type AgentDetail = z.infer<typeof getAgentResponseSchema>;
export type AgentDraftDetail = z.infer<typeof getAgentDraftResponseSchema>;
export type PublishAgentResult = z.infer<typeof publishAgentResponseSchema>;
export type ConversationListResponse = z.infer<
  typeof conversationListResponseSchema
>;
export type ConversationRecord =
  ConversationListResponse["conversations"][number];
export type ConversationDetail = z.infer<
  typeof conversationDetailResponseSchema
>;
export type RetrievalCitation = NonNullable<
  ConversationDetail["messages"][number]["citations"]
>[number];
export type RunRecord = z.infer<typeof getRunResponseSchema>;
export type RunEventListResponse = z.infer<typeof runEventListResponseSchema>;
export type RunEventRecord = RunEventListResponse["events"][number];
export type SseEnvelope = z.infer<typeof sseEnvelopeSchema>;
export type ApprovalListResponse = z.infer<typeof listApprovalsResponseSchema>;
export type ApprovalRecord = ApprovalListResponse["approvals"][number];
export type ApprovalDetail = z.infer<typeof getApprovalResponseSchema>;
export type ApprovalDecisionRecord = ApprovalDetail["decisions"][number];
export type ConnectorListResponse = z.infer<typeof connectorListResponseSchema>;
export type ConnectorRecord = ConnectorListResponse["connectors"][number];
export type ConnectorSyncJobListResponse = z.infer<
  typeof connectorSyncJobListResponseSchema
>;
export type ConnectorSyncJobRecord =
  ConnectorSyncJobListResponse["sync_jobs"][number];
export type ArtifactListResponse = z.infer<typeof artifactListResponseSchema>;
export type ArtifactRecord = ArtifactListResponse["artifacts"][number];
export type ArtifactDetail = z.infer<typeof getArtifactResponseSchema>;
export type ActionListResponse = z.infer<typeof listActionsResponseSchema>;
export type ActionRecord = ActionListResponse["actions"][number];
export type ActionDetail = z.infer<typeof getActionResponseSchema>;
export type TicketListResponse = z.infer<typeof ticketListResponseSchema>;
export type TicketRecord = TicketListResponse["tickets"][number];
export type RuntimeControlStatus = z.infer<
  typeof runtimeControlStatusResponseSchema
>;
export type RuntimeRestartResult = z.infer<typeof runtimeRestartResponseSchema>;
export type ContactListResponse = z.infer<typeof contactListResponseSchema>;
export type ContactRecord = z.infer<typeof contactRecordSchema>;
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;
export type AccountRecord = z.infer<typeof accountRecordSchema>;
export type ConfirmRouteSuggestionResponse = z.infer<
  typeof confirmRouteSuggestionResponseSchema
>;

export function getControlPlaneUrl(path: string) {
  // Server components need an absolute URL because there's no browser origin.
  // Route through the console's own catch-all API proxy (/api/[...path]/route.ts).
  if (typeof window === "undefined") {
    const port = process.env.CONSOLE_PORT ?? process.env.PORT ?? "3000";
    return `http://127.0.0.1:${port}${path}`;
  }
  return path;
}

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
  };

  throw new ControlPlaneRequestError(
    body.error ?? `Request failed with status ${response.status}.`,
    response.status,
    body.code ?? null,
  );
}

async function requestJson<T>(
  path: string,
  schema: Schema<T>,
  options: {
    method?: string;
    csrfToken?: string | null;
    body?: unknown;
  } = {},
) {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }

  if (options.csrfToken) {
    headers.set("x-csrf-token", options.csrfToken);
  }

  // Forward cookies when running server-side (server components / route handlers).
  // Browser fetch with credentials: "include" handles this automatically, but
  // server-side fetch does not have access to the user's cookies unless we
  // explicitly forward them via next/headers.
  if (typeof window === "undefined") {
    try {
      // Dynamic import to avoid bundling next/headers in client code.
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      const cookieHeader = cookieStore
        .getAll()
        .map((c) => `${c.name}=${c.value}`)
        .join("; ");
      if (cookieHeader) {
        headers.set("cookie", cookieHeader);
      }
    } catch {
      // next/headers may not be available in all contexts (e.g., tests).
    }
  }

  const requestInit: RequestInit = {
    method: options.method ?? "GET",
    credentials: "include",
    headers,
    cache: "no-store",
  };

  if (options.body !== undefined) {
    requestInit.body = JSON.stringify(options.body);
  }

  const response = await fetch(getControlPlaneUrl(path), requestInit);

  if (!response.ok) {
    await readError(response);
  }

  return schema.parse(await response.json());
}

async function requestNoContent(
  path: string,
  options: {
    method: string;
    csrfToken?: string | null;
  },
) {
  const headers = new Headers();

  if (options.csrfToken) {
    headers.set("x-csrf-token", options.csrfToken);
  }

  const response = await fetch(getControlPlaneUrl(path), {
    method: options.method,
    credentials: "include",
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    await readError(response);
  }
}

export async function getSetupStatus() {
  return await requestJson("/api/setup/status", setupStatusResponseSchema);
}

export async function getSession() {
  return await requestJson(
    "/api/auth/session",
    authenticatedSessionResponseSchema,
  );
}

export async function logout(csrfToken: string) {
  await requestNoContent("/api/auth/logout", {
    method: "POST",
    csrfToken,
  });
}

export async function listAgents() {
  return await requestJson("/api/agents", agentListResponseSchema);
}

export async function createAgent(input: {
  name: string;
  scope: "personal" | "shared";
  csrfToken: string;
}) {
  return await requestJson("/api/agents", createAgentResponseSchema, {
    method: "POST",
    csrfToken: input.csrfToken,
    body: {
      name: input.name,
      scope: input.scope,
    },
  });
}

export async function getAgent(agentId: string) {
  return await requestJson(`/api/agents/${agentId}`, getAgentResponseSchema);
}

export async function updateAgent(input: {
  agentId: string;
  csrfToken: string;
  body: {
    name?: string;
    status?: "active" | "archived";
  };
}) {
  return await requestJson(
    `/api/agents/${input.agentId}`,
    getAgentResponseSchema,
    {
      method: "PATCH",
      csrfToken: input.csrfToken,
      body: input.body,
    },
  );
}

export async function getAgentDraft(agentId: string) {
  return await requestJson(
    `/api/agents/${agentId}/draft`,
    getAgentDraftResponseSchema,
  );
}

export async function updateAgentDraft(input: {
  agentId: string;
  csrfToken: string;
  body: {
    instructions_markdown?: string;
    model_routing?: {
      provider: string;
      model: string;
    };
    tool_policy?: {
      mode: "allow_list";
      allowed_tools: string[];
      tool_rules: Record<
        string,
        {
          risk_class: "safe" | "guarded" | "approval_gated" | "restricted";
          approval: "never" | "workspace_admin";
        }
      >;
    };
    connector_policy?: {
      enabled: boolean;
      connector_ids: string[];
    };
  };
}) {
  return await requestJson(
    `/api/agents/${input.agentId}/draft`,
    getAgentDraftResponseSchema,
    {
      method: "PATCH",
      csrfToken: input.csrfToken,
      body: input.body,
    },
  );
}

export async function publishAgent(input: {
  agentId: string;
  expectedDraftVersionId: string;
  csrfToken: string;
}) {
  return await requestJson(
    `/api/agents/${input.agentId}/publish`,
    publishAgentResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        expected_draft_version_id: input.expectedDraftVersionId,
      },
    },
  );
}

export async function listConversations(agentId?: string) {
  const query = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
  return await requestJson(
    `/api/conversations${query}`,
    conversationListResponseSchema,
  );
}

export async function createConversation(input: {
  agentId: string;
  csrfToken: string;
}) {
  return await requestJson(
    "/api/conversations",
    createConversationResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        agent_id: input.agentId,
      },
    },
  );
}

export async function getConversation(conversationId: string) {
  return await requestJson(
    `/api/conversations/${conversationId}`,
    conversationDetailResponseSchema,
  );
}

export async function createRun(input: {
  conversationId: string;
  text: string;
  csrfToken: string;
}) {
  return await requestJson("/api/runs", createRunResponseSchema, {
    method: "POST",
    csrfToken: input.csrfToken,
    body: {
      conversation_id: input.conversationId,
      input: {
        type: "text",
        text: input.text,
      },
    },
  });
}

export async function getRun(runId: string) {
  return await requestJson(`/api/runs/${runId}`, getRunResponseSchema);
}

export async function listApprovals() {
  return await requestJson("/api/approvals", listApprovalsResponseSchema);
}

export async function getApproval(approvalId: string) {
  return await requestJson(
    `/api/approvals/${approvalId}`,
    getApprovalResponseSchema,
  );
}

export async function resolveApproval(input: {
  approvalId: string;
  decision: "approved" | "denied";
  rationale?: string | null;
  csrfToken: string;
}) {
  return await requestJson(
    `/api/approvals/${input.approvalId}/resolve`,
    getApprovalResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: resolveApprovalRequestSchema.parse({
        decision: input.decision,
        rationale: input.rationale ?? null,
      }),
    },
  );
}

export async function listMockTickets() {
  return await requestJson("/api/admin/mock-tickets", ticketListResponseSchema);
}

export async function listArtifacts() {
  return await requestJson("/api/artifacts", artifactListResponseSchema);
}

export async function getArtifact(artifactId: string) {
  return await requestJson(
    `/api/artifacts/${artifactId}`,
    getArtifactResponseSchema,
  );
}

export async function listActions() {
  return await requestJson("/api/actions", listActionsResponseSchema);
}

export async function getAction(actionId: string) {
  return await requestJson(`/api/actions/${actionId}`, getActionResponseSchema);
}

export async function listConnectors() {
  return await requestJson("/api/connectors", connectorListResponseSchema);
}

export async function createConnector(input: {
  name: string;
  rootPath: string;
  csrfToken: string;
}) {
  return await requestJson("/api/connectors", createConnectorResponseSchema, {
    method: "POST",
    csrfToken: input.csrfToken,
    body: {
      name: input.name,
      type: "local_directory",
      config: {
        root_path: input.rootPath,
        recursive: true,
        include_extensions: [
          ".md",
          ".mdx",
          ".txt",
          ".text",
          ".json",
          ".yaml",
          ".yml",
          ".csv",
          ".html",
        ],
      },
    },
  });
}

export async function listConnectorSyncJobs(connectorId: string) {
  return await requestJson(
    `/api/connectors/${connectorId}/sync-jobs`,
    connectorSyncJobListResponseSchema,
  );
}

export async function requestConnectorSync(input: {
  connectorId: string;
  csrfToken: string;
}) {
  return await requestJson(
    `/api/connectors/${input.connectorId}/sync`,
    requestConnectorSyncResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export async function getRuntimeControlStatus() {
  return await requestJson(
    "/api/admin/runtime-control",
    runtimeControlStatusResponseSchema,
  );
}

export async function getRuntimeReadinessStatus() {
  return await requestJson(
    "/api/admin/runtime-readiness",
    runtimeReadinessResponseSchema,
  );
}

export async function restartOpenClawRuntime(input: { csrfToken: string }) {
  return await requestJson(
    "/api/admin/runtime-control/restart",
    runtimeRestartResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export async function getRuntimeWorkerControlStatus() {
  return await requestJson(
    "/api/admin/runtime-control/worker",
    runtimeControlStatusResponseSchema,
  );
}

export async function restartRuntimeWorker(input: { csrfToken: string }) {
  return await requestJson(
    "/api/admin/runtime-control/worker/restart",
    runtimeRestartResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export async function getRunEvents(runId: string) {
  return await requestJson(
    `/api/runs/${runId}/events`,
    runEventListResponseSchema,
  );
}

export async function getWorkspaceToday() {
  return await requestJson("/api/workspace/today", todayResponseSchema);
}

export async function listWorkspaceWorkers() {
  return await requestJson("/api/workspace/workers", workerListResponseSchema);
}

export async function getWorkspaceWorker(workerId: string) {
  return await requestJson(
    `/api/workspace/workers/${workerId}`,
    getWorkspaceWorkerResponseSchema,
  );
}

export async function runWorkerDemoForwardEmail(input: {
  workerId: string;
  csrfToken: string | null;
}) {
  return await requestJson(
    `/api/workspace/workers/${input.workerId}/demo/forward-email`,
    workerDemoForwardEmailResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export async function listWorkspaceInbox(input?: {
  assigneeId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input?.assigneeId) {
    params.set("assignee", input.assigneeId);
  }
  const query = params.toString();
  const path = query ? `/api/workspace/inbox?${query}` : "/api/workspace/inbox";
  return await requestJson(path, inboxListResponseSchema);
}

export async function listWorkspaceWork(input?: {
  kind?: string | null;
  workerId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input?.kind) {
    params.set("kind", input.kind);
  }
  if (input?.workerId) {
    params.set("worker_id", input.workerId);
  }
  const query = params.toString();
  const path = query ? `/api/workspace/work?${query}` : "/api/workspace/work";
  return await requestJson(path, workItemListResponseSchema);
}

export async function getWorkspaceWorkItem(workItemId: string) {
  return await requestJson(
    `/api/workspace/work/${workItemId}`,
    getWorkspaceWorkItemResponseSchema,
  );
}

export async function listWorkspaceConnections() {
  return await requestJson(
    "/api/workspace/connections",
    workspaceConnectionListResponseSchema,
  );
}

export async function bootstrapWorkspaceConnection(input: {
  provider: string;
  accessMode: string;
  csrfToken: string;
}) {
  return await requestJson(
    "/api/workspace/connections/bootstrap",
    getWorkspaceConnectionResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        provider: input.provider,
        access_mode: input.accessMode,
      },
    },
  );
}

export async function connectWorkspaceConnection(
  connectionId: string,
  input: {
    csrfToken?: string | null;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/connect`,
    getWorkspaceConnectionResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
    },
  );
}

export async function disconnectWorkspaceConnection(
  connectionId: string,
  input: {
    csrfToken?: string | null;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/disconnect`,
    getWorkspaceConnectionResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
    },
  );
}

export async function getWorkspaceGmailPilotSetup(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/gmail-setup`,
    gmailPilotSetupResponseSchema,
  );
}

export type GmailOAuthCredentialsResponse = {
  configured: boolean;
  client_id: string | null;
};

const gmailOAuthCredentialsSchema = {
  parse: (v: unknown) => v as GmailOAuthCredentialsResponse,
};

export async function getGmailOAuthCredentials(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/gmail-oauth-credentials`,
    gmailOAuthCredentialsSchema,
  );
}

export async function saveGmailOAuthCredentials(input: {
  connectionId: string;
  csrfToken: string;
  clientId: string;
  clientSecret: string;
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/gmail-oauth-credentials`,
    gmailOAuthCredentialsSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        client_id: input.clientId,
        client_secret: input.clientSecret,
      },
    },
  );
}

export async function saveWorkspaceGmailPilotSetup(input: {
  connectionId: string;
  csrfToken: string;
  scopeKind: GmailPilotScopeKind;
  mailboxAddresses: string[];
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/gmail-setup`,
    gmailPilotSetupResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        scope_kind: input.scopeKind,
        mailbox_addresses: input.mailboxAddresses,
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
      },
    },
  );
}

export async function saveWorkspaceGmailServiceAccountSetup(input: {
  connectionId: string;
  csrfToken: string;
  serviceAccountJson: string;
  targetMailbox: string;
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/gmail-service-account-setup`,
    gmailPilotSetupResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        service_account_json: input.serviceAccountJson,
        target_mailbox: input.targetMailbox,
      },
    },
  );
}

export async function pollWorkspaceGmailInbox(input: {
  connectionId: string;
  csrfToken: string;
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/gmail-poll`,
    gmailPilotPollResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export type SmtpStatusResponse = {
  connection_id: string;
  status: string;
  env_configured: boolean;
  host_present: boolean;
  port_present: boolean;
  username_present: boolean;
  password_present: boolean;
  from_address_present: boolean;
  from_address: string | null;
  host: string | null;
  port: number | null;
};

const smtpStatusSchema = {
  parse: (v: unknown) => v as SmtpStatusResponse,
};

export async function getSmtpStatus(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/smtp-status`,
    smtpStatusSchema,
  );
}

export async function configureSmtp(
  connectionId: string,
  input: {
    csrfToken?: string | null;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/smtp-configure`,
    getWorkspaceConnectionResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
    },
  );
}

// ---------------------------------------------------------------------------
// n8n API client functions
// ---------------------------------------------------------------------------

export type N8nStatusResponse = {
  status: string;
  base_url: string | null;
  has_auth_token: boolean;
  webhook_path_prefix: string;
  configured_at: string | null;
  configured: boolean;
};

const n8nStatusSchema = {
  parse: (v: unknown) => v as N8nStatusResponse,
};

export async function getN8nStatus(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/n8n-status`,
    n8nStatusSchema,
  );
}

export async function configureN8n(
  connectionId: string,
  input: {
    baseUrl: string;
    authToken: string;
    webhookPathPrefix?: string | undefined;
    csrfToken?: string | null | undefined;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/n8n-configure`,
    getWorkspaceConnectionResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
      body: {
        base_url: input.baseUrl,
        auth_token: input.authToken,
        ...(input.webhookPathPrefix
          ? { webhook_path_prefix: input.webhookPathPrefix }
          : {}),
      },
    },
  );
}

export type N8nVerifyResponse = {
  reachable: boolean;
  authenticated: boolean;
  status_code?: number;
  error: string | null;
};

const n8nVerifySchema = {
  parse: (v: unknown) => v as N8nVerifyResponse,
};

export async function verifyN8n(
  connectionId: string,
  input: {
    csrfToken?: string | null | undefined;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/n8n-verify`,
    n8nVerifySchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
    },
  );
}

// ---------------------------------------------------------------------------
// Drive API client functions
// ---------------------------------------------------------------------------

export type DriveSetupSummary = {
  connection_id: string;
  status: string;
  configured: boolean;
  validated_email: string | null;
  last_validated_at: string | null;
  last_probe_at: string | null;
  last_error: string | null;
  client_id_present: boolean;
  client_secret_present: boolean;
  refresh_token_present: boolean;
  oauth_app_configured: boolean;
  operational_status: {
    state: string;
    summary: string;
    lastProbeAt: string | null;
    blockingIssueCodes: string[];
  };
};

export type DriveSetupResponse = {
  setup: DriveSetupSummary;
};

export type DriveOAuthCredentialsResponse = {
  configured: boolean;
  client_id: string | null;
};

const driveSetupResponseSchema = {
  parse: (v: unknown) => v as DriveSetupResponse,
};

const driveOAuthCredentialsSchema = {
  parse: (v: unknown) => v as DriveOAuthCredentialsResponse,
};

export async function getDriveStatus(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/drive-status`,
    driveSetupResponseSchema,
  );
}

export async function getDriveOAuthCredentials(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/drive-oauth-credentials`,
    driveOAuthCredentialsSchema,
  );
}

export async function saveDriveOAuthCredentials(input: {
  connectionId: string;
  csrfToken: string;
  clientId: string;
  clientSecret: string;
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/drive-oauth-credentials`,
    driveOAuthCredentialsSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        client_id: input.clientId,
        client_secret: input.clientSecret,
      },
    },
  );
}

export async function saveDriveSetup(input: {
  connectionId: string;
  csrfToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/drive-setup`,
    driveSetupResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        client_id: input.clientId,
        client_secret: input.clientSecret,
        refresh_token: input.refreshToken,
      },
    },
  );
}

export async function completeDriveOAuthCallback(input: {
  connectionId: string;
  csrfToken: string;
  code: string;
  redirectUri: string;
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/drive-oauth-callback`,
    driveSetupResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        code: input.code,
        redirect_uri: input.redirectUri,
      },
    },
  );
}

export async function probeDriveConnection(
  connectionId: string,
  input: {
    csrfToken?: string | null;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/drive-probe`,
    {
      parse: (v: unknown) =>
        v as {
          probe: { ok: boolean; summary: string };
          status: { state: string; summary: string };
          recovery_hints: Array<{
            code: string;
            label: string;
            description: string;
          }>;
        },
    },
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
    },
  );
}

// ---------------------------------------------------------------------------
// GitHub connection helpers
// ---------------------------------------------------------------------------

export type GitHubOperationalStatus = {
  state: "setup_required" | "configured" | "ready" | "degraded" | "error";
  summary: string;
  lastProbeAt: string | null;
  blockingIssueCodes: string[];
};

export type GitHubProbeResult = {
  ok: boolean;
  checkedAt: string;
  summary: string;
  issues: Array<{
    severity: string;
    code: string;
    summary: string;
    detail?: string;
  }>;
  user?: { login: string; name: string | null };
  scopes?: string[];
};

export type GitHubRecoveryHint = {
  code: string;
  label: string;
  description: string;
  docsHref?: string;
  target?: { surface: string; focus?: string };
};

export type GitHubStatusResponse = {
  connection_id: string;
  connection_status: string;
  operational: GitHubOperationalStatus;
  probe: GitHubProbeResult | null;
  recovery_hints: GitHubRecoveryHint[];
};

const githubStatusSchema = {
  parse: (v: unknown) => v as GitHubStatusResponse,
};

export async function getGitHubStatus(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/github-status`,
    githubStatusSchema,
  );
}

export async function setupGitHub(
  connectionId: string,
  input: {
    personalAccessToken: string;
    org?: string;
    repos?: string[];
    csrfToken: string;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/github-setup`,
    githubStatusSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        personal_access_token: input.personalAccessToken,
        org: input.org,
        repos: input.repos,
      },
    },
  );
}

export async function probeGitHub(
  connectionId: string,
  input: {
    csrfToken: string;
  },
) {
  const probeSchema = { parse: (v: unknown) => v as GitHubProbeResult };
  return await requestJson(
    `/api/workspace/connections/${connectionId}/github-probe`,
    probeSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export async function updateConnectionAttachedWorkers(input: {
  connectionId: string;
  csrfToken: string;
  attachedWorkerIds: string[];
}) {
  return await requestJson(
    `/api/workspace/connections/${input.connectionId}/attached-workers`,
    getWorkspaceConnectionResponseSchema,
    {
      method: "PATCH",
      csrfToken: input.csrfToken,
      body: {
        attached_worker_ids: input.attachedWorkerIds,
      },
    },
  );
}

export async function listWorkspaceInputRoutes(input?: {
  workerId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input?.workerId) {
    params.set("worker_id", input.workerId);
  }
  const query = params.toString();
  const path = query
    ? `/api/workspace/input-routes?${query}`
    : "/api/workspace/input-routes";
  return await requestJson(path, inputRouteListResponseSchema);
}

export async function listWorkspaceActionCapabilities(input?: {
  workerId?: string | null;
}) {
  const params = new URLSearchParams();
  if (input?.workerId) {
    params.set("worker_id", input.workerId);
  }
  const query = params.toString();
  const path = query
    ? `/api/workspace/action-capabilities?${query}`
    : "/api/workspace/action-capabilities";
  return await requestJson(path, actionCapabilityListResponseSchema);
}

export async function listWorkspaceActivity() {
  return await requestJson(
    "/api/workspace/activity",
    activityListResponseSchema,
  );
}

export async function getWorkspaceReview(reviewId: string) {
  return await requestJson(
    `/api/workspace/reviews/${reviewId}`,
    getWorkspaceReviewResponseSchema,
  );
}

export async function listWorkspacePeople() {
  return await requestJson(
    "/api/workspace/people",
    workspacePeopleListResponseSchema,
  );
}

export async function listApprovalSurfaceIdentities() {
  return await requestJson(
    "/api/workspace/approval-surfaces/identities",
    approvalSurfaceIdentityListResponseSchema,
  );
}

export async function createApprovalSurfaceIdentity(input: {
  channel: "whatsapp" | "slack";
  userId: string;
  externalIdentity: string;
  label?: string;
  csrfToken: string;
}) {
  return await requestJson(
    "/api/workspace/approval-surfaces/identities",
    approvalSurfaceIdentityRecordSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        channel: input.channel,
        user_id: input.userId,
        external_identity: input.externalIdentity,
        ...(input.label ? { label: input.label } : {}),
      },
    },
  );
}

export async function updateApprovalSurfaceIdentity(input: {
  identityId: string;
  externalIdentity?: string;
  label?: string;
  status?: "allowed" | "disabled";
  csrfToken: string;
}) {
  return await requestJson(
    `/api/workspace/approval-surfaces/identities/${input.identityId}`,
    approvalSurfaceIdentityRecordSchema,
    {
      method: "PATCH",
      csrfToken: input.csrfToken,
      body: {
        ...(input.externalIdentity !== undefined
          ? { external_identity: input.externalIdentity }
          : {}),
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Registry (shared contracts from @clawback/contracts)
// ---------------------------------------------------------------------------

export type {
  RegistrySetupStep,
  RegistryConnectionProvider,
  RegistryWorkerPack,
  RegistryResponse,
};
export type { WorkerPackListResponse, WorkerPackInstallResult };

export async function listRegistry() {
  return await requestJson("/api/workspace/registry", registryResponseSchema);
}

export async function listWorkerPacks() {
  return await requestJson(
    "/api/workspace/worker-packs",
    workerPackListResponseSchema,
  );
}

export async function installWorkerPack(input: {
  packId: string;
  name?: string;
  csrfToken: string;
}) {
  return await requestJson(
    "/api/workspace/workers/install",
    workerPackInstallResultSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        pack_id: input.packId,
        ...(input.name ? { name: input.name } : {}),
      },
    },
  );
}

export async function updateWorkspaceWorker(input: {
  workerId: string;
  csrfToken: string;
  body: {
    name?: string;
    status?: "draft" | "active" | "paused";
    member_ids?: string[];
    assignee_ids?: string[];
    reviewer_ids?: string[];
  };
}) {
  return await requestJson(
    `/api/workspace/workers/${input.workerId}`,
    getWorkspaceWorkerResponseSchema,
    {
      method: "PATCH",
      csrfToken: input.csrfToken,
      body: input.body,
    },
  );
}

export async function updateWorkspaceActionCapability(input: {
  actionCapabilityId: string;
  csrfToken: string;
  body: {
    boundary_mode: "auto" | "ask_me" | "never";
  };
}) {
  return await requestJson(
    `/api/workspace/action-capabilities/${input.actionCapabilityId}`,
    actionCapabilityRecordSchema,
    {
      method: "PATCH",
      csrfToken: input.csrfToken,
      body: input.body,
    },
  );
}

export async function resolveReview(
  reviewId: string,
  input: {
    decision: "approved" | "denied";
    rationale?: string | null;
    csrfToken?: string | null;
  },
) {
  return await requestJson(
    `/api/workspace/reviews/${reviewId}/resolve`,
    getWorkspaceReviewResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
      body: {
        decision: input.decision,
        rationale: input.rationale ?? undefined,
      },
    },
  );
}

export async function retryWorkspaceSend(
  workItemId: string,
  input: {
    csrfToken?: string | null;
  },
) {
  return await requestJson(
    `/api/workspace/work/${workItemId}/retry-send`,
    getWorkspaceReviewResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
    },
  );
}

export async function confirmWorkspaceRouteSuggestion(
  inboxItemId: string,
  input: {
    csrfToken?: string | null;
  },
) {
  return await requestJson(
    `/api/workspace/inbox/${inboxItemId}/confirm-route`,
    confirmRouteSuggestionResponseSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken ?? null,
      body: {},
    },
  );
}

export function createRunEventSource(runId: string) {
  return new EventSource(getControlPlaneUrl(`/api/runs/${runId}/stream`), {
    withCredentials: true,
  });
}

export function parseSseEnvelope(raw: string) {
  return sseEnvelopeSchema.parse(JSON.parse(raw));
}

// ---------------------------------------------------------------------------
// WhatsApp approval surface
// ---------------------------------------------------------------------------

export type WhatsAppOperationalStatus = {
  state: string;
  summary: string;
  lastProbeAt: string | null;
  blockingIssueCodes: string[];
};

export type WhatsAppProbeResult = {
  ok: boolean;
  checkedAt: string;
  summary: string;
  issues: Array<{ severity: string; code: string; summary: string }>;
  displayName?: string | null;
};

export type WhatsAppRecoveryHint = {
  code: string;
  label: string;
  description: string;
  docsHref?: string;
  target?: { surface: string; focus?: string };
};

export type WhatsAppStatusResponse = {
  connection_id: string;
  connection_status: string;
  transport_mode: WhatsAppTransportMode;
  pairing_status: "unpaired" | "paired" | "error" | null;
  paired_identity_ref: string | null;
  operational: WhatsAppOperationalStatus;
  probe: WhatsAppProbeResult | null;
  recovery_hints: WhatsAppRecoveryHint[];
};

const whatsappStatusSchema = {
  parse: (v: unknown) => v as WhatsAppStatusResponse,
};

export async function getWhatsAppStatus(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/whatsapp-status`,
    whatsappStatusSchema,
  );
}

export async function setupWhatsApp(
  connectionId: string,
  input: {
    phoneNumberId: string;
    accessToken: string;
    verifyToken: string;
    csrfToken: string;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/whatsapp-setup`,
    whatsappStatusSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        phone_number_id: input.phoneNumberId,
        access_token: input.accessToken,
        verify_token: input.verifyToken,
      },
    },
  );
}

export async function probeWhatsApp(
  connectionId: string,
  input: {
    csrfToken: string;
  },
) {
  const probeSchema = { parse: (v: unknown) => v as WhatsAppProbeResult };
  return await requestJson(
    `/api/workspace/connections/${connectionId}/whatsapp-probe`,
    probeSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export type WhatsAppTransportMode = "openclaw_pairing" | "meta_cloud_api";
export type WhatsAppPairingStartResponse = {
  pairing: {
    qr_data_url: string | null;
    message: string;
    account_id: string | null;
  };
  status: WhatsAppStatusResponse;
};

export type WhatsAppPairingWaitResponse = {
  pairing: {
    connected: boolean;
    message: string;
    account_id: string | null;
  };
  status: WhatsAppStatusResponse;
};

export async function setWhatsAppTransportMode(
  connectionId: string,
  input: {
    transportMode: WhatsAppTransportMode;
    csrfToken: string;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/whatsapp-transport-mode`,
    whatsappStatusSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        transport_mode: input.transportMode,
      },
    },
  );
}

export async function startWhatsAppPairing(
  connectionId: string,
  input: {
    csrfToken: string;
    force?: boolean;
    timeoutMs?: number;
  },
) {
  const pairingSchema = {
    parse: (v: unknown) => v as WhatsAppPairingStartResponse,
  };
  return await requestJson(
    `/api/workspace/connections/${connectionId}/whatsapp-pairing/start`,
    pairingSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        force: input.force,
        timeout_ms: input.timeoutMs,
      },
    },
  );
}

export async function waitForWhatsAppPairing(
  connectionId: string,
  input: {
    csrfToken: string;
    timeoutMs?: number;
  },
) {
  const pairingSchema = {
    parse: (v: unknown) => v as WhatsAppPairingWaitResponse,
  };
  return await requestJson(
    `/api/workspace/connections/${connectionId}/whatsapp-pairing/wait`,
    pairingSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        timeout_ms: input.timeoutMs,
      },
    },
  );
}

// ---------------------------------------------------------------------------
// Slack approval surface
// ---------------------------------------------------------------------------

export type SlackOperationalStatus = {
  state: string;
  summary: string;
  lastProbeAt: string | null;
  blockingIssueCodes: string[];
};

export type SlackProbeResult = {
  ok: boolean;
  checkedAt: string;
  summary: string;
  issues: Array<{ severity: string; code: string; summary: string }>;
  botName?: string | null;
  teamName?: string | null;
};

export type SlackRecoveryHint = {
  code: string;
  label: string;
  description: string;
  docsHref?: string;
  target?: { surface: string; focus?: string };
};

export type SlackStatusResponse = {
  connection_id: string;
  connection_status: string;
  operational: SlackOperationalStatus;
  probe: SlackProbeResult | null;
  recovery_hints: SlackRecoveryHint[];
};

const slackStatusSchema = {
  parse: (v: unknown) => v as SlackStatusResponse,
};

export async function getSlackStatus(connectionId: string) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/slack-status`,
    slackStatusSchema,
  );
}

export async function setupSlack(
  connectionId: string,
  input: {
    botToken: string;
    signingSecret: string;
    defaultChannel: string;
    csrfToken: string;
  },
) {
  return await requestJson(
    `/api/workspace/connections/${connectionId}/slack-setup`,
    slackStatusSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
      body: {
        bot_token: input.botToken,
        signing_secret: input.signingSecret,
        default_channel: input.defaultChannel,
      },
    },
  );
}

export async function probeSlack(
  connectionId: string,
  input: {
    csrfToken: string;
  },
) {
  const probeSchema = { parse: (v: unknown) => v as SlackProbeResult };
  return await requestJson(
    `/api/workspace/connections/${connectionId}/slack-probe`,
    probeSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

export async function testSlackSend(
  connectionId: string,
  input: {
    csrfToken: string;
  },
) {
  const testSchema = {
    parse: (v: unknown) => v as { ok: boolean; error?: string },
  };
  return await requestJson(
    `/api/workspace/connections/${connectionId}/slack-test-send`,
    testSchema,
    {
      method: "POST",
      csrfToken: input.csrfToken,
    },
  );
}

// ---------------------------------------------------------------------------
// Contacts (R4)
// ---------------------------------------------------------------------------

export async function listWorkspaceContacts() {
  return await requestJson(
    "/api/workspace/contacts",
    contactListResponseSchema,
  );
}

export async function createWorkspaceContact(input: {
  csrfToken: string;
  primary_email: string;
  display_name: string;
  account_id?: string | null;
  relationship_class?: string | null;
  owner_user_id?: string | null;
  handling_note?: string | null;
  do_not_auto_reply?: boolean;
}) {
  const { csrfToken, ...body } = input;
  return await requestJson("/api/workspace/contacts", contactRecordSchema, {
    method: "POST",
    csrfToken,
    body,
  });
}

export async function updateWorkspaceContact(
  id: string,
  input: {
    csrfToken: string;
    primary_email?: string;
    display_name?: string;
    account_id?: string | null;
    relationship_class?: string | null;
    owner_user_id?: string | null;
    handling_note?: string | null;
    do_not_auto_reply?: boolean;
  },
) {
  const { csrfToken, ...body } = input;
  return await requestJson(
    `/api/workspace/contacts/${id}`,
    contactRecordSchema,
    {
      method: "PATCH",
      csrfToken,
      body,
    },
  );
}

// ---------------------------------------------------------------------------
// Accounts (R4)
// ---------------------------------------------------------------------------

export async function listWorkspaceAccounts() {
  return await requestJson(
    "/api/workspace/accounts",
    accountListResponseSchema,
  );
}

export async function createWorkspaceAccount(input: {
  csrfToken: string;
  name: string;
  primary_domain?: string | null;
  relationship_class?: string | null;
  owner_user_id?: string | null;
  handling_note?: string | null;
}) {
  const { csrfToken, ...body } = input;
  return await requestJson("/api/workspace/accounts", accountRecordSchema, {
    method: "POST",
    csrfToken,
    body,
  });
}

export async function updateWorkspaceAccount(
  id: string,
  input: {
    csrfToken: string;
    name?: string;
    primary_domain?: string | null;
    relationship_class?: string | null;
    owner_user_id?: string | null;
    handling_note?: string | null;
  },
) {
  const { csrfToken, ...body } = input;
  return await requestJson(
    `/api/workspace/accounts/${id}`,
    accountRecordSchema,
    {
      method: "PATCH",
      csrfToken,
      body,
    },
  );
}
