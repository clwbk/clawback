import { beforeEach, describe, expect, it } from "vitest";

import { AuthServiceError, type AuthServiceContract, type SessionContext } from "@clawback/auth";

import type { AgentServiceContract } from "./agents/index.js";
import type { ApprovalServiceContract } from "./approvals/index.js";
import { createControlPlaneApp } from "./app.js";
import type { OperatorActionsServiceContract } from "./operator-actions/index.js";
import type { ConversationRunServiceContract } from "./orchestration/index.js";
import type { RuntimeToolServiceContract } from "./runtime-tools/index.js";
import type { TicketServiceContract } from "./tickets/index.js";

function serializeCookies(setCookie: string[]) {
  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
}

class FakeAuthService implements AuthServiceContract {
  bootstrapped = false;
  readonly sessions = new Map<string, SessionContext>();

  async getSetupStatus() {
    return { bootstrapped: this.bootstrapped };
  }

  async bootstrapAdmin() {
    this.bootstrapped = true;
    const sessionToken = "bootstrap-session-token";
    const session = {
      user: { id: "usr_admin", email: "admin@example.com", display_name: "Admin" },
      workspace: { id: "ws_1", slug: "acme", name: "Acme" },
      membership: { role: "admin" as const },
    };
    this.sessions.set(sessionToken, {
      session: {
        id: "ses_admin",
        workspaceId: "ws_1",
        userId: "usr_admin",
        tokenHash: "hashed",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      },
      user: {
        id: "usr_admin",
        email: "admin@example.com",
        normalizedEmail: "admin@example.com",
        displayName: "Admin",
        kind: "human",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      workspace: {
        id: "ws_1",
        slug: "acme",
        name: "Acme",
        status: "active",
        settingsJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        workspaceId: "ws_1",
        userId: "usr_admin",
        role: "admin",
        createdAt: new Date(),
      },
    });
    return { sessionToken, session };
  }

  async login() {
    return await this.bootstrapAdmin();
  }

  async getSessionFromToken(sessionToken: string) {
    return this.sessions.get(sessionToken) ?? null;
  }

  async logout(sessionToken: string) {
    this.sessions.delete(sessionToken);
  }

  async createInvitation(actor: SessionContext) {
    if (actor.membership.role !== "admin") {
      throw new AuthServiceError({
        code: "forbidden",
        message: "Only admins can create invitations.",
        statusCode: 403,
      });
    }

    return {
      invitation: {
        id: "inv_1",
        email: "user@example.com",
        role: "user" as const,
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        accepted_at: null,
        created_at: new Date().toISOString(),
      },
      token: "invite-token",
    };
  }

  async claimInvitation() {
    const sessionToken = "claimed-session-token";
    const session = {
      user: { id: "usr_user", email: "user@example.com", display_name: "User" },
      workspace: { id: "ws_1", slug: "acme", name: "Acme" },
      membership: { role: "user" as const },
    };
    this.sessions.set(sessionToken, {
      session: {
        id: "ses_user",
        workspaceId: "ws_1",
        userId: "usr_user",
        tokenHash: "hashed-user",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastSeenAt: new Date(),
        createdAt: new Date(),
      },
      user: {
        id: "usr_user",
        email: "user@example.com",
        normalizedEmail: "user@example.com",
        displayName: "User",
        kind: "human",
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      workspace: {
        id: "ws_1",
        slug: "acme",
        name: "Acme",
        status: "active",
        settingsJson: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      membership: {
        workspaceId: "ws_1",
        userId: "usr_user",
        role: "user",
        createdAt: new Date(),
      },
    });
    return { sessionToken, session };
  }
}

class FakeAgentService implements AgentServiceContract {
  private readonly createdAt = new Date("2026-03-10T12:00:00Z").toISOString();
  private record: {
    agent: {
      id: string;
      workspace_id: string;
      name: string;
      slug: string;
      scope: "personal" | "shared";
      status: "active" | "archived";
      owner_user_id: string | null;
      created_at: string;
      updated_at: string;
    };
    draftVersion: {
      id: string;
      agent_id: string;
      version_number: number;
      status: "draft";
      published_at: null;
      created_at: string;
      persona: Record<string, unknown>;
      instructions_markdown: string;
      model_routing: { provider: string; model: string };
      tool_policy: {
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
      connector_policy: { enabled: boolean; connector_ids: string[] };
    };
    publishedVersion: {
      id: string;
      agent_id: string;
      version_number: number;
      status: "published";
      published_at: string;
      created_at: string;
    } | null;
  } | null = null;

  async listAgents() {
    if (!this.record) {
      return { agents: [] };
    }

    return {
      agents: [
        {
          ...this.record.agent,
          draft_version: {
            id: this.record.draftVersion.id,
            agent_id: this.record.draftVersion.agent_id,
            version_number: this.record.draftVersion.version_number,
            status: this.record.draftVersion.status,
            published_at: this.record.draftVersion.published_at,
            created_at: this.record.draftVersion.created_at,
          },
          published_version: this.record.publishedVersion,
        },
      ],
    };
  }

  async createAgent(actor: SessionContext, input: { name: string; scope: "personal" | "shared" }) {
    this.record = {
      agent: {
        id: "agt_1",
        workspace_id: actor.workspace.id,
        name: input.name,
        slug: "support-assistant",
        scope: input.scope,
        status: "active",
        owner_user_id: input.scope === "personal" ? actor.user.id : null,
        created_at: this.createdAt,
        updated_at: this.createdAt,
      },
      draftVersion: {
        id: "agtv_1",
        agent_id: "agt_1",
        version_number: 1,
        status: "draft",
        published_at: null,
        created_at: this.createdAt,
        persona: {},
        instructions_markdown: "",
        model_routing: {
          provider: "openai-compatible",
          model: "gpt-4.1-mini",
        },
        tool_policy: {
          mode: "allow_list",
          allowed_tools: [],
          tool_rules: {},
        },
        connector_policy: {
          enabled: false,
          connector_ids: [],
        },
      },
      publishedVersion: null,
    };

    return {
      ...this.record.agent,
      draft_version: {
        id: this.record.draftVersion.id,
        agent_id: this.record.draftVersion.agent_id,
        version_number: this.record.draftVersion.version_number,
        status: this.record.draftVersion.status,
        published_at: this.record.draftVersion.published_at,
        created_at: this.record.draftVersion.created_at,
      },
      published_version: null,
    };
  }

  async getAgent() {
    if (!this.record) {
      throw new Error("missing agent");
    }

    return {
      ...this.record.agent,
      draft_version: {
        id: this.record.draftVersion.id,
        agent_id: this.record.draftVersion.agent_id,
        version_number: this.record.draftVersion.version_number,
        status: this.record.draftVersion.status,
        published_at: this.record.draftVersion.published_at,
        created_at: this.record.draftVersion.created_at,
      },
      published_version: this.record.publishedVersion,
    };
  }

  async updateAgent() {
    return await this.getAgent();
  }

  async getDraft() {
    if (!this.record) {
      throw new Error("missing agent");
    }

    return {
      agent: this.record.agent,
      draft: this.record.draftVersion,
      published_version: this.record.publishedVersion,
    };
  }

  async updateDraft(
    _actor: SessionContext,
    _agentId: string,
    input: { instructions_markdown?: string },
  ) {
    if (!this.record) {
      throw new Error("missing agent");
    }

    this.record.draftVersion.instructions_markdown =
      input.instructions_markdown ?? this.record.draftVersion.instructions_markdown;

    return {
      agent: this.record.agent,
      draft: this.record.draftVersion,
      published_version: this.record.publishedVersion,
    };
  }

  async publishAgent(
    _actor: SessionContext,
    _agentId: string,
    _input: { expected_draft_version_id: string },
  ) {
    if (!this.record) {
      throw new Error("missing agent");
    }

    this.record.publishedVersion = {
      id: this.record.draftVersion.id,
      agent_id: this.record.agent.id,
      version_number: this.record.draftVersion.version_number,
      status: "published",
      published_at: this.createdAt,
      created_at: this.record.draftVersion.created_at,
    };

    this.record.draftVersion = {
      ...this.record.draftVersion,
      id: "agtv_2",
      version_number: 2,
      instructions_markdown: this.record.draftVersion.instructions_markdown,
    };

    return {
      agent: this.record.agent,
      published_version: this.record.publishedVersion,
      draft_version: this.record.draftVersion,
      runtime_publication: {
        status: "pending" as const,
        runtime_agent_id: `cb_${this.record.publishedVersion.id}`,
        detail: null,
      },
    };
  }
}

class FakeConversationRunService implements ConversationRunServiceContract {
  private readonly createdAt = new Date("2026-03-10T12:00:00Z").toISOString();
  private readonly conversationId = "cnv_1";
  private readonly runId = "run_1";

  async createConversation(actor: SessionContext, _input?: { agent_id: string }) {
    return {
      id: this.conversationId,
      workspace_id: actor.workspace.id,
      agent_id: "agt_1",
      agent_version_id: "agtv_1",
      channel: "web" as const,
      started_by: actor.user.id,
      status: "active" as const,
      title: null,
      last_message_at: this.createdAt,
      created_at: this.createdAt,
      updated_at: this.createdAt,
    };
  }

  async listConversations(actor: SessionContext, input: { agent_id?: string }) {
    const conversation = await this.createConversation(actor, {
      agent_id: input.agent_id ?? "agt_1",
    });

    return {
      conversations: [conversation],
    };
  }

  async getConversation(actor: SessionContext) {
    return {
      conversation: await this.createConversation(actor, { agent_id: "agt_1" }),
      messages: [],
    };
  }

  async createRun(_actor: SessionContext) {
    return {
      run_id: this.runId,
      conversation_id: this.conversationId,
      input_message_id: "msg_1",
      stream_url: `/api/runs/${this.runId}/stream`,
    };
  }

  async getRun(actor: SessionContext) {
    return {
      id: this.runId,
      workspace_id: actor.workspace.id,
      agent_id: "agt_1",
      agent_version_id: "agtv_1",
      conversation_id: this.conversationId,
      input_message_id: "msg_1",
      initiated_by: actor.user.id,
      channel: "web" as const,
      status: "completed" as const,
      started_at: this.createdAt,
      completed_at: this.createdAt,
      current_step: null,
      summary: "hello",
      created_at: this.createdAt,
      updated_at: this.createdAt,
    };
  }

  async listRunEvents(actor: SessionContext, runId: string) {
    return await this.listRunEventsAfter(actor, runId, 0);
  }

  async getRunStreamContext() {
    return {
      runId: this.runId,
      conversationId: this.conversationId,
      terminal: true,
    };
  }

  async listRunEventsAfter(
    _actor: SessionContext,
    _runId: string,
    afterSequence: number,
  ) {
    return [
      {
        event_id: "evt_1",
        event_type: "run.output.delta" as const,
        workspace_id: "ws_1",
        run_id: this.runId,
        sequence: 1,
        occurred_at: this.createdAt,
        actor: {
          type: "service" as const,
          id: "runtime-worker",
        },
        payload: {
          delta: "hello",
        },
      },
      {
        event_id: "evt_2",
        event_type: "run.completed" as const,
        workspace_id: "ws_1",
        run_id: this.runId,
        sequence: 2,
        occurred_at: this.createdAt,
        actor: {
          type: "service" as const,
          id: "runtime-worker",
        },
        payload: {
          assistant_message_id: "msg_2",
          assistant_text: "hello",
        },
      },
    ].filter((event) => event.sequence > afterSequence);
  }
}

class FakeOperatorActionsService implements OperatorActionsServiceContract {
  async getRuntimeControlStatus() {
    return {
      enabled: true,
      mode: "local_compose" as const,
      target: "openclaw" as const,
      label: "Restart OpenClaw" as const,
      reason: null,
    };
  }

  async restartOpenClaw() {
    return {
      target: "openclaw" as const,
      status: "completed" as const,
      message: "OpenClaw was restarted and reported healthy again.",
      requested_at: "2026-03-11T15:00:00.000Z",
      completed_at: "2026-03-11T15:00:01.000Z",
    };
  }

  async getRuntimeWorkerControlStatus() {
    return {
      enabled: true,
      mode: "local_dev_watch" as const,
      target: "runtime_worker" as const,
      label: "Restart Runtime Worker",
      reason: null,
    };
  }

  async restartRuntimeWorker() {
    return {
      target: "runtime_worker" as const,
      status: "completed" as const,
      message: "Runtime worker restarted and checked in again.",
      requested_at: "2026-03-11T15:02:00.000Z",
      completed_at: "2026-03-11T15:02:01.000Z",
    };
  }
}

class FakeApprovalService implements ApprovalServiceContract {
  private approval: {
    id: string;
    workspace_id: string;
    run_id: string;
    tool_invocation_id: string;
    tool_name: string;
    action_type: string;
    risk_class: "safe" | "guarded" | "approval_gated" | "restricted";
    status: "pending" | "approved" | "denied" | "expired" | "canceled";
    requested_by: string | null;
    approver_scope: {
      mode: "workspace_admin";
      allowed_roles: Array<"admin" | "user">;
    };
    request_payload: Record<string, unknown>;
    decision_due_at: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
  } = {
    id: "apr_1",
    workspace_id: "ws_1",
    run_id: "run_1",
    tool_invocation_id: "tool_1",
    tool_name: "create_ticket",
    action_type: "ticket.create",
    risk_class: "approval_gated" as const,
    status: "pending" as const,
    requested_by: "usr_admin",
    approver_scope: {
      mode: "workspace_admin" as const,
      allowed_roles: ["admin" as const],
    },
    request_payload: {
      title: "Investigate checkout failover",
    },
    decision_due_at: null,
    resolved_at: null,
    created_at: "2026-03-11T18:00:00.000Z",
    updated_at: "2026-03-11T18:00:00.000Z",
  };

  async listApprovals() {
    return {
      approvals: [this.approval],
    };
  }

  async getApproval() {
    return {
      approval: this.approval,
      decisions: [],
    };
  }

  async resolveApproval(
    _actor: SessionContext,
    _approvalId: string,
    input: { decision: "approved" | "denied"; rationale?: string | null },
  ) {
    this.approval = {
      ...this.approval,
      status: input.decision,
      resolved_at: "2026-03-11T18:05:00.000Z",
      updated_at: "2026-03-11T18:05:00.000Z",
    };

    return {
      approval: this.approval,
      decisions: [
        {
          id: "apd_1",
          workspace_id: "ws_1",
          approval_request_id: "apr_1",
          run_id: "run_1",
          decision: input.decision,
          decided_by: "usr_admin",
          rationale: input.rationale ?? null,
          payload: {
            tool_name: "create_ticket",
          },
          occurred_at: "2026-03-11T18:05:00.000Z",
          created_at: "2026-03-11T18:05:00.000Z",
        },
      ],
    };
  }
}

class FakeTicketService implements TicketServiceContract {
  private readonly tickets: Array<{
    id: string;
    workspace_id: string;
    run_id: string | null;
    approval_request_id: string | null;
    provider: "mock";
    status: "draft" | "created" | "failed";
    external_ref: string | null;
    title: string;
    summary: string;
    body: Record<string, unknown>;
    created_by: string | null;
    created_at: string;
    updated_at: string;
  }> = [
    {
      id: "tkt_1",
      workspace_id: "ws_1",
      run_id: null,
      approval_request_id: null,
      provider: "mock" as const,
      status: "created" as const,
      external_ref: "MOCK-2026-1",
      title: "Investigate checkout failover regression",
      summary: "Follow up on the March 9 incident.",
      body: {
        notes: ["Prior incident on March 9"],
      },
      created_by: "usr_admin",
      created_at: "2026-03-11T12:00:00.000Z",
      updated_at: "2026-03-11T12:00:00.000Z",
    },
  ];

  async listTickets() {
    return {
      tickets: this.tickets,
    };
  }

  async getTicket() {
    return this.tickets[0]!;
  }

  async lookupTickets() {
    return [
      {
        id: "tkt_1",
        title: "Investigate checkout failover regression",
        summary: "Follow up on the March 9 incident.",
        status: "created",
        notes: ["Prior incident on March 9"],
        updated_at: "2026-03-11T12:00:00.000Z",
      },
    ];
  }

  async createTicket(input: {
    workspaceId: string;
    title: string;
    summary: string;
    body: Record<string, unknown>;
    createdBy?: string | null;
  }) {
    return {
      id: "tkt_2",
      workspace_id: input.workspaceId,
      run_id: null,
      approval_request_id: null,
      provider: "mock" as const,
      status: "created" as const,
      external_ref: "MOCK-2026-2",
      title: input.title,
      summary: input.summary,
      body: input.body,
      created_by: input.createdBy ?? null,
      created_at: "2026-03-11T12:05:00.000Z",
      updated_at: "2026-03-11T12:05:00.000Z",
    };
  }
}

class FakeRuntimeToolService implements RuntimeToolServiceContract {
  readonly requestSendCalls: Array<{ runtime_session_key: string; tool_invocation_id: string }> = [];
  private workItemCounter = 0;

  async lookupTickets() {
    return {
      results: [
        {
          id: "tkt_1",
          title: "Investigate checkout failover regression",
          summary: "Follow up on the March 9 incident.",
          status: "created",
          notes: ["Prior incident on March 9"],
          updated_at: "2026-03-11T12:00:00.000Z",
        },
      ],
    };
  }

  async draftTicket() {
    return {
      draft_ticket: {
        id: "tkt_draft_1",
        workspace_id: "ws_1",
        run_id: "run_1",
        approval_request_id: null,
        provider: "mock" as const,
        status: "draft" as const,
        external_ref: null,
        title: "Investigate checkout failover regression",
        summary: "Follow up on the March 9 incident.",
        body: {
          likely_cause: "Replica lag",
          impact: "Checkout requests failed for 7 minutes.",
          recommended_actions: ["Verify failover", "Add alerting"],
          owner: "ops-oncall",
        },
        created_by: "usr_admin",
        created_at: "2026-03-11T12:10:00.000Z",
        updated_at: "2026-03-11T12:10:00.000Z",
      },
    };
  }

  async createTicket() {
    return {
      status: "created" as const,
      approval: {
        id: "apr_1",
        workspace_id: "ws_1",
        run_id: "run_1",
        tool_invocation_id: "tool_1",
        tool_name: "create_ticket",
        action_type: "create_ticket",
        risk_class: "approval_gated" as const,
        status: "approved" as const,
        requested_by: "usr_admin",
        approver_scope: {
          mode: "workspace_admin" as const,
          allowed_roles: ["admin" as const],
        },
        request_payload: {},
        decision_due_at: null,
        resolved_at: "2026-03-11T12:12:00.000Z",
        created_at: "2026-03-11T12:11:00.000Z",
        updated_at: "2026-03-11T12:12:00.000Z",
      },
      ticket: {
        id: "tkt_2",
        workspace_id: "ws_1",
        run_id: "run_1",
        approval_request_id: "apr_1",
        provider: "mock" as const,
        status: "created" as const,
        external_ref: "MOCK-2026-2",
        title: "Investigate checkout failover regression",
        summary: "Follow up on the March 9 incident.",
        body: {
          likely_cause: "Replica lag",
          impact: "Checkout requests failed for 7 minutes.",
          recommended_actions: ["Verify failover", "Add alerting"],
          owner: "ops-oncall",
        },
        created_by: "usr_admin",
        created_at: "2026-03-11T12:12:00.000Z",
        updated_at: "2026-03-11T12:12:00.000Z",
      },
    };
  }

  async draftFollowUp(input: { runtime_session_key: string; tool_invocation_id: string; draft: Record<string, unknown> }) {
    if (input.runtime_session_key !== "test-session-key") {
      throw new Error(`No active Clawback run found for runtime session ${input.runtime_session_key}.`);
    }
    this.workItemCounter += 1;
    return {
      draft: {
        work_item_id: `wi_fake_${this.workItemCounter}`,
        status: "draft",
        to: (input.draft.to as string) ?? null,
        subject: (input.draft.subject as string) ?? null,
        body: (input.draft.body as string) ?? null,
      },
    };
  }

  async draftRecap(input: { runtime_session_key: string; tool_invocation_id: string; recap: Record<string, unknown> }) {
    if (input.runtime_session_key !== "test-session-key") {
      throw new Error(`No active Clawback run found for runtime session ${input.runtime_session_key}.`);
    }
    this.workItemCounter += 1;
    return {
      draft: {
        work_item_id: `wi_fake_${this.workItemCounter}`,
        status: "draft",
        to: (input.recap.to as string) ?? null,
        subject: (input.recap.subject as string) ?? null,
        meeting_summary: (input.recap.meeting_summary as string) ?? null,
        action_items: (input.recap.action_items as string[]) ?? [],
        decisions: (input.recap.decisions as string[]) ?? [],
      },
    };
  }

  async requestSend(input: { runtime_session_key: string; tool_invocation_id: string; send_request: Record<string, unknown> }) {
    if (input.runtime_session_key !== "test-session-key") {
      throw new Error(`No active Clawback run found for runtime session ${input.runtime_session_key}.`);
    }
    this.requestSendCalls.push({
      runtime_session_key: input.runtime_session_key,
      tool_invocation_id: input.tool_invocation_id,
    });
    return {
      status: "pending",
      approval_request_id: `apr_fu_${this.requestSendCalls.length}`,
      message: "Send request submitted for review. Awaiting human approval.",
    };
  }
}

describe("control-plane auth routes", () => {
  let fakeAuthService: FakeAuthService;
  let fakeAgentService: FakeAgentService;
  let fakeConversationRunService: FakeConversationRunService;
  let fakeOperatorActionsService: FakeOperatorActionsService;
  let fakeApprovalService: FakeApprovalService;
  let fakeTicketService: FakeTicketService;
  let fakeRuntimeToolService: FakeRuntimeToolService;

  beforeEach(() => {
    fakeAuthService = new FakeAuthService();
    fakeAgentService = new FakeAgentService();
    fakeConversationRunService = new FakeConversationRunService();
    fakeOperatorActionsService = new FakeOperatorActionsService();
    fakeApprovalService = new FakeApprovalService();
    fakeTicketService = new FakeTicketService();
    fakeRuntimeToolService = new FakeRuntimeToolService();
  });

  it("bootstraps, reads session, creates an invite, and logs out", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/api/setup/bootstrap-admin",
      payload: {
        workspace_name: "Acme",
        workspace_slug: "acme",
        email: "admin@example.com",
        display_name: "Admin",
        password: "password123",
      },
    });

    expect(bootstrapResponse.statusCode).toBe(201);
    const bootstrapBody = bootstrapResponse.json();
    const cookieHeader = serializeCookies(bootstrapResponse.headers["set-cookie"] as string[]);

    const sessionResponse = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json().user.email).toBe("admin@example.com");

    const inviteResponse = await app.inject({
      method: "POST",
      url: "/api/invitations",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
      payload: {
        email: "user@example.com",
        role: "user",
      },
    });

    expect(inviteResponse.statusCode).toBe(201);
    expect(inviteResponse.json().token).toBe("invite-token");

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
    });

    expect(logoutResponse.statusCode).toBe(204);
    await app.close();
  });

  it("creates, edits, publishes, and lists agents through the control-plane routes", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/api/setup/bootstrap-admin",
      payload: {
        workspace_name: "Acme",
        workspace_slug: "acme",
        email: "admin@example.com",
        display_name: "Admin",
        password: "password123",
      },
    });

    const bootstrapBody = bootstrapResponse.json();
    const cookieHeader = serializeCookies(bootstrapResponse.headers["set-cookie"] as string[]);

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/agents",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
      payload: {
        name: "Support Assistant",
        scope: "shared",
      },
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json().draft_version.id).toBe("agtv_1");

    const draftUpdateResponse = await app.inject({
      method: "PATCH",
      url: "/api/agents/agt_1/draft",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
      payload: {
        instructions_markdown: "Answer support questions clearly.",
      },
    });

    expect(draftUpdateResponse.statusCode).toBe(200);
    expect(draftUpdateResponse.json().draft.instructions_markdown).toBe(
      "Answer support questions clearly.",
    );

    const publishResponse = await app.inject({
      method: "POST",
      url: "/api/agents/agt_1/publish",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
      payload: {
        expected_draft_version_id: "agtv_1",
      },
    });

    expect(publishResponse.statusCode).toBe(200);
    expect(publishResponse.json().runtime_publication.runtime_agent_id).toBe("cb_agtv_1");

    const listResponse = await app.inject({
      method: "GET",
      url: "/api/agents",
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().agents).toHaveLength(1);
    expect(listResponse.json().agents[0].published_version.id).toBe("agtv_1");
    await app.close();
  });

  it("creates conversations and queued runs through the control-plane routes", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/api/setup/bootstrap-admin",
      payload: {
        workspace_name: "Acme",
        workspace_slug: "acme",
        email: "admin@example.com",
        display_name: "Admin",
        password: "password123",
      },
    });

    const bootstrapBody = bootstrapResponse.json();
    const cookieHeader = serializeCookies(bootstrapResponse.headers["set-cookie"] as string[]);

    const conversationResponse = await app.inject({
      method: "POST",
      url: "/api/conversations",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
      payload: {
        agent_id: "agt_1",
      },
    });

    expect(conversationResponse.statusCode).toBe(201);
    expect(conversationResponse.json().agent_version_id).toBe("agtv_1");

    const listConversationsResponse = await app.inject({
      method: "GET",
      url: "/api/conversations?agent_id=agt_1",
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(listConversationsResponse.statusCode).toBe(200);
    expect(listConversationsResponse.json().conversations).toHaveLength(1);

    const runResponse = await app.inject({
      method: "POST",
      url: "/api/runs",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
      payload: {
        conversation_id: "cnv_1",
        input: {
          type: "text",
          text: "hello",
        },
      },
    });

    expect(runResponse.statusCode).toBe(201);
    expect(runResponse.json().stream_url).toBe("/api/runs/run_1/stream");

    const runDetailResponse = await app.inject({
      method: "GET",
      url: "/api/runs/run_1",
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(runDetailResponse.statusCode).toBe(200);
    expect(runDetailResponse.json().status).toBe("completed");

    const runEventsResponse = await app.inject({
      method: "GET",
      url: "/api/runs/run_1/events",
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(runEventsResponse.statusCode).toBe(200);
    expect(runEventsResponse.json().events).toHaveLength(2);

    const streamResponse = await app.inject({
      method: "GET",
      url: "/api/runs/run_1/stream",
      headers: {
        cookie: cookieHeader,
      },
    });

    expect(streamResponse.statusCode).toBe(200);
    expect(streamResponse.headers["content-type"]).toContain("text/event-stream");
    expect(streamResponse.headers["cache-control"]).toBe("no-cache, no-transform");
    expect(streamResponse.headers["x-accel-buffering"]).toBe("no");
    expect(streamResponse.body).toContain("\"type\":\"assistant.delta\"");
    expect(streamResponse.body).toContain("\"type\":\"assistant.completed\"");
    await app.close();
  });

  it("exposes runtime control status and restart for admins only", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/api/setup/bootstrap-admin",
      payload: {
        workspace_name: "Acme",
        workspace_slug: "acme",
        email: "admin@example.com",
        display_name: "Admin",
        password: "password123",
      },
    });

    const bootstrapBody = bootstrapResponse.json();
    const adminCookie = serializeCookies(bootstrapResponse.headers["set-cookie"] as string[]);

    const statusResponse = await app.inject({
      method: "GET",
      url: "/api/admin/runtime-control",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(statusResponse.statusCode).toBe(200);
    expect(statusResponse.json()).toEqual({
      enabled: true,
      mode: "local_compose",
      target: "openclaw",
      label: "Restart OpenClaw",
      reason: null,
    });

    const restartResponse = await app.inject({
      method: "POST",
      url: "/api/admin/runtime-control/restart",
      headers: {
        cookie: adminCookie,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
    });

    expect(restartResponse.statusCode).toBe(200);
    expect(restartResponse.json().status).toBe("completed");

    const workerStatusResponse = await app.inject({
      method: "GET",
      url: "/api/admin/runtime-control/worker",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(workerStatusResponse.statusCode).toBe(200);
    expect(workerStatusResponse.json()).toEqual({
      enabled: true,
      mode: "local_dev_watch",
      target: "runtime_worker",
      label: "Restart Runtime Worker",
      reason: null,
    });

    const workerRestartResponse = await app.inject({
      method: "POST",
      url: "/api/admin/runtime-control/worker/restart",
      headers: {
        cookie: adminCookie,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
    });

    expect(workerRestartResponse.statusCode).toBe(200);
    expect(workerRestartResponse.json().status).toBe("completed");

    const claimedInvite = await app.inject({
      method: "POST",
      url: "/api/invitations/claim",
      payload: {
        token: "invite-token",
        display_name: "User",
        password: "password123",
      },
    });
    const userCookie = serializeCookies(claimedInvite.headers["set-cookie"] as string[]);

    const forbiddenResponse = await app.inject({
      method: "GET",
      url: "/api/admin/runtime-control",
      headers: {
        cookie: userCookie,
      },
    });

    expect(forbiddenResponse.statusCode).toBe(403);
    await app.close();
  });

  it("lists and resolves approvals and exposes mock ticket inspection routes", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapResponse = await app.inject({
      method: "POST",
      url: "/api/setup/bootstrap-admin",
      payload: {
        workspace_name: "Acme",
        workspace_slug: "acme",
        email: "admin@example.com",
        display_name: "Admin",
        password: "password123",
      },
    });

    const bootstrapBody = bootstrapResponse.json();
    const adminCookie = serializeCookies(bootstrapResponse.headers["set-cookie"] as string[]);

    const approvalsResponse = await app.inject({
      method: "GET",
      url: "/api/approvals",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(approvalsResponse.statusCode).toBe(200);
    expect(approvalsResponse.json().approvals[0].tool_name).toBe("create_ticket");

    const actionsResponse = await app.inject({
      method: "GET",
      url: "/api/actions",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(actionsResponse.statusCode).toBe(200);
    expect(actionsResponse.json().actions[0]).toMatchObject({
      id: "apr_1",
      kind: "ticket.create",
      tool_name: "create_ticket",
    });

    const resolveResponse = await app.inject({
      method: "POST",
      url: "/api/approvals/apr_1/resolve",
      headers: {
        cookie: adminCookie,
        "x-csrf-token": bootstrapBody.csrf_token,
      },
      payload: {
        decision: "approved",
        rationale: "Looks good.",
      },
    });

    expect(resolveResponse.statusCode).toBe(200);
    expect(resolveResponse.json().approval.status).toBe("approved");

    const ticketsResponse = await app.inject({
      method: "GET",
      url: "/api/admin/mock-tickets",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(ticketsResponse.statusCode).toBe(200);
    expect(ticketsResponse.json().tickets[0].external_ref).toBe("MOCK-2026-1");

    const artifactsResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(artifactsResponse.statusCode).toBe(200);
    expect(artifactsResponse.json().artifacts[0]).toMatchObject({
      kind: "ticket",
      external_ref: "MOCK-2026-1",
    });

    const artifactDetailResponse = await app.inject({
      method: "GET",
      url: "/api/artifacts/tkt_1",
      headers: {
        cookie: adminCookie,
      },
    });

    expect(artifactDetailResponse.statusCode).toBe(200);
    expect(artifactDetailResponse.json().artifact).toMatchObject({
      id: "tkt_1",
      body: {
        notes: ["Prior incident on March 9"],
      },
    });
    await app.close();
  });

  it("exposes runtime ticket tool endpoints behind bearer auth", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const unauthorized = await app.inject({
      method: "POST",
      url: "/api/runtime/ticket-tools/lookup",
      payload: {
        runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
        tool_invocation_id: "tool_1",
        query: "checkout",
      },
    });

    expect(unauthorized.statusCode).toBe(401);

    const authHeader = {
      authorization: "Bearer clawback-local-runtime-api-token",
    };

    const lookupResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/ticket-tools/lookup",
      headers: authHeader,
      payload: {
        runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
        tool_invocation_id: "tool_1",
        query: "checkout",
      },
    });

    expect(lookupResponse.statusCode).toBe(200);
    expect(lookupResponse.json().results[0].id).toBe("tkt_1");

    const draftResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/ticket-tools/draft",
      headers: authHeader,
      payload: {
        runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
        tool_invocation_id: "tool_2",
        draft: {
          title: "Investigate checkout failover regression",
          summary: "Follow up on the March 9 incident.",
          likely_cause: "Replica lag",
          impact: "Checkout requests failed for 7 minutes.",
          recommended_actions: ["Verify failover", "Add alerting"],
          owner: "ops-oncall",
        },
      },
    });

    expect(draftResponse.statusCode).toBe(200);
    expect(draftResponse.json().draft_ticket.status).toBe("draft");

    const createResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/ticket-tools/create",
      headers: authHeader,
      payload: {
        runtime_session_key: "agent:cb_agtv_1:conversation:cnv_1",
        tool_invocation_id: "tool_3",
        draft: {
          title: "Investigate checkout failover regression",
          summary: "Follow up on the March 9 incident.",
          likely_cause: "Replica lag",
          impact: "Checkout requests failed for 7 minutes.",
          recommended_actions: ["Verify failover", "Add alerting"],
          owner: "ops-oncall",
        },
      },
    });

    expect(createResponse.statusCode).toBe(200);
    expect(createResponse.json().status).toBe("created");
    expect(createResponse.json().ticket.id).toBe("tkt_2");

    await app.close();
  });

  it("rejects inbound email without auth", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/inbound/email",
      payload: {
        message_id: "<msg@example.com>",
        from: "sender@example.com",
        to: "worker@inbound.clawback.dev",
        subject: "Test",
        body_text: "Hello",
      },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("returns 400 for inbound email missing required fields", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const authHeader = { authorization: "Bearer clawback-local-runtime-api-token" };

    const response = await app.inject({
      method: "POST",
      url: "/api/inbound/email",
      headers: authHeader,
      payload: {
        message_id: "",
        from: "",
        to: "",
        subject: "",
        body_text: "",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("Missing required fields");
    await app.close();
  });

  it("rejects provider-backed inbound email without webhook auth", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/inbound/email/postmark",
      payload: {
        From: "sender@example.com",
        To: "worker@inbound.clawback.dev",
        Subject: "Test",
        MessageID: "<msg@example.com>",
      },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects gmail watch hook ingress without webhook auth", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/inbound/gmail-watch/ws_1/conn_gmail_01",
      payload: {
        messages: [{
          id: "gmail-msg-001",
          from: "client@example.com",
          subject: "Hello",
        }],
      },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("fails closed on whatsapp webhook callbacks when signing is not configured", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/webhooks/whatsapp",
      payload: {
        entry: [],
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      code: "whatsapp_webhook_signature_not_configured",
    });
    await app.close();
  });

  it("exposes follow-up runtime tool draft endpoint behind bearer auth", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const authHeader = { authorization: "Bearer clawback-local-runtime-api-token" };

    // Unauthorized
    const noAuthResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/follow-up-tools/draft",
      payload: {
        runtime_session_key: "test-session-key",
        tool_invocation_id: "tool_draft_1",
        draft: { to: "client@example.com", subject: "Follow up", body: "Hello" },
      },
    });
    expect(noAuthResponse.statusCode).toBe(401);

    // Missing fields
    const missingFieldsResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/follow-up-tools/draft",
      headers: authHeader,
      payload: { draft: { to: "client@example.com" } },
    });
    expect(missingFieldsResponse.statusCode).toBe(400);

    // No active run
    const noRunResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/follow-up-tools/draft",
      headers: authHeader,
      payload: {
        runtime_session_key: "nonexistent-session",
        tool_invocation_id: "tool_draft_1",
        draft: { to: "client@example.com", subject: "Follow up", body: "Hello" },
      },
    });
    expect(noRunResponse.statusCode).toBe(404);

    // Successful draft
    const draftResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/follow-up-tools/draft",
      headers: authHeader,
      payload: {
        runtime_session_key: "test-session-key",
        tool_invocation_id: "tool_draft_1",
        draft: {
          to: "client@example.com",
          subject: "Follow up",
          body: "Hello, just checking in.",
          context_summary: "Previous discussion about Q3 renewal.",
        },
      },
    });

    expect(draftResponse.statusCode).toBe(201);
    const draftBody = draftResponse.json();
    expect(draftBody.draft).toBeDefined();
    expect(draftBody.draft.status).toBe("draft");
    expect(draftBody.draft.work_item_id).toBeDefined();
    expect(draftBody.draft.to).toBe("client@example.com");
    expect(draftBody.draft.subject).toBe("Follow up");

    await app.close();
  });

  it("exposes follow-up runtime tool draft-recap endpoint", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const authHeader = { authorization: "Bearer clawback-local-runtime-api-token" };

    const recapResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/follow-up-tools/draft-recap",
      headers: authHeader,
      payload: {
        runtime_session_key: "test-session-key",
        tool_invocation_id: "tool_recap_1",
        recap: {
          to: "team@example.com",
          subject: "Q3 Planning Meeting Recap",
          meeting_summary: "Discussed Q3 goals and budget allocation.",
          action_items: ["Finalize budget", "Schedule review"],
          decisions: ["Budget approved"],
        },
      },
    });

    expect(recapResponse.statusCode).toBe(201);
    const recapBody = recapResponse.json();
    expect(recapBody.draft).toBeDefined();
    expect(recapBody.draft.status).toBe("draft");
    expect(recapBody.draft.work_item_id).toBeDefined();
    expect(recapBody.draft.meeting_summary).toBe("Discussed Q3 goals and budget allocation.");

    await app.close();
  });

  it("exposes follow-up runtime tool request-send endpoint", async () => {
    const app = await createControlPlaneApp({
      authService: fakeAuthService,
      agentService: fakeAgentService,
      approvalService: fakeApprovalService,
      conversationRunService: fakeConversationRunService,
      operatorActionsService: fakeOperatorActionsService,
      runtimeToolService: fakeRuntimeToolService,
      ticketService: fakeTicketService,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const authHeader = { authorization: "Bearer clawback-local-runtime-api-token" };

    const sendResponse = await app.inject({
      method: "POST",
      url: "/api/runtime/follow-up-tools/request-send",
      headers: authHeader,
      payload: {
        runtime_session_key: "test-session-key",
        tool_invocation_id: "tool_send_1",
        send_request: {
          work_item_id: "wi_123",
          to: "client@example.com",
          subject: "Re: Q3 Renewal Discussion",
          body: "Hi, just following up on our conversation.",
        },
      },
    });

    expect(sendResponse.statusCode).toBe(201);
    const sendBody = sendResponse.json();
    expect(sendBody.status).toBe("pending");
    expect(sendBody.approval_request_id).toBeDefined();
    expect(sendBody.message).toContain("Awaiting human approval");

    // Verify the request-send was called
    expect(fakeRuntimeToolService.requestSendCalls).toHaveLength(1);
    expect(fakeRuntimeToolService.requestSendCalls[0]!.tool_invocation_id).toBe("tool_send_1");

    await app.close();
  });
});
