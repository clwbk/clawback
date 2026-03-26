import * as crypto from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { AuthServiceError, type AuthServiceContract, type SessionContext } from "@clawback/auth";

import { createControlPlaneApp } from "./app.js";
import type { WorkspaceReadModelServices } from "./workspace-routes.js";
import { WorkerService } from "./workers/index.js";
import { WorkItemService } from "./work-items/index.js";
import { InboxItemService } from "./inbox/index.js";
import { ReviewService } from "./reviews/index.js";
import { ReviewDecisionService } from "./reviews/index.js";
import { ReviewedExternalWorkflowExecutionError } from "./reviews/index.js";
import { ActivityService } from "./activity/index.js";
import {
  ConnectionService,
  GmailPilotSetupService,
  type DriveContextService,
  type DriveSetupService,
} from "./connections/index.js";
import { InputRouteService } from "./input-routes/index.js";
import { ActionCapabilityService } from "./action-capabilities/index.js";
import { WorkspacePeopleService } from "./workspace-people/index.js";
import {
  ApprovalSurfaceIdentityService,
  ApprovalSurfaceTokenSigner,
} from "./approval-surfaces/index.js";
import { createFakeReviewedEmailSender } from "./reviews/test-reviewed-send.js";
import {
  WorkerPackInstallService,
  followUpWorkerPack,
  proposalWorkerPack,
} from "./worker-packs/index.js";
import { ContactService } from "./contacts/index.js";
import { AccountService } from "./accounts/index.js";
import type { GitHubConnectionService } from "./integrations/github/index.js";
import type { SlackSetupService } from "./integrations/slack/index.js";
import type { WhatsAppSetupService } from "./integrations/whatsapp/index.js";
import type { GmailPollingServiceContract } from "./integrations/watched-inbox/index.js";

import type { StoredWorker, WorkerStore } from "./workers/types.js";
import type { StoredWorkItem, WorkItemStore } from "./work-items/types.js";
import type { StoredInboxItem, InboxItemStore } from "./inbox/types.js";
import type { StoredReview, ReviewStore } from "./reviews/types.js";
import type { StoredReviewDecision, ReviewDecisionStore } from "./reviews/decision-types.js";
import type { StoredActivityEvent, ActivityEventStore } from "./activity/types.js";
import type { StoredConnection, ConnectionStore } from "./connections/types.js";
import type { StoredInputRoute, InputRouteStore } from "./input-routes/types.js";
import type { StoredContact, ContactStore } from "./contacts/index.js";
import type { StoredAccount, AccountStore } from "./accounts/index.js";
import type {
  StoredActionCapability,
  ActionCapabilityStore,
} from "./action-capabilities/types.js";
import type {
  StoredWorkspacePerson,
  WorkspacePeopleStore,
} from "./workspace-people/types.js";
import type {
  StoredApprovalSurfaceIdentity,
  ApprovalSurfaceIdentityStore,
} from "./approval-surfaces/types.js";
import type { ReviewedExternalWorkflowExecutor } from "./reviews/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeCookies(setCookie: string[]) {
  return setCookie.map((cookie) => cookie.split(";")[0]).join("; ");
}

function signSlackInteraction(secret: string, timestamp: string, rawBody: string) {
  return `v0=${crypto
    .createHmac("sha256", secret)
    .update(`v0:${timestamp}:${rawBody}`)
    .digest("hex")}`;
}

async function withSmtpEnv<T>(
  values: {
    host?: string;
    port?: string;
    username?: string;
    password?: string;
    fromAddress?: string;
  },
  run: () => Promise<T>,
): Promise<T> {
  const original = {
    host: process.env.CLAWBACK_SMTP_HOST,
    port: process.env.CLAWBACK_SMTP_PORT,
    username: process.env.CLAWBACK_SMTP_USERNAME,
    password: process.env.CLAWBACK_SMTP_PASSWORD,
    fromAddress: process.env.CLAWBACK_SMTP_FROM_ADDRESS,
  };

  if (values.host !== undefined) {
    process.env.CLAWBACK_SMTP_HOST = values.host;
  } else {
    delete process.env.CLAWBACK_SMTP_HOST;
  }

  if (values.port !== undefined) {
    process.env.CLAWBACK_SMTP_PORT = values.port;
  } else {
    delete process.env.CLAWBACK_SMTP_PORT;
  }

  if (values.username !== undefined) {
    process.env.CLAWBACK_SMTP_USERNAME = values.username;
  } else {
    delete process.env.CLAWBACK_SMTP_USERNAME;
  }

  if (values.password !== undefined) {
    process.env.CLAWBACK_SMTP_PASSWORD = values.password;
  } else {
    delete process.env.CLAWBACK_SMTP_PASSWORD;
  }

  if (values.fromAddress !== undefined) {
    process.env.CLAWBACK_SMTP_FROM_ADDRESS = values.fromAddress;
  } else {
    delete process.env.CLAWBACK_SMTP_FROM_ADDRESS;
  }

  try {
    return await run();
  } finally {
    if (original.host !== undefined) {
      process.env.CLAWBACK_SMTP_HOST = original.host;
    } else {
      delete process.env.CLAWBACK_SMTP_HOST;
    }

    if (original.port !== undefined) {
      process.env.CLAWBACK_SMTP_PORT = original.port;
    } else {
      delete process.env.CLAWBACK_SMTP_PORT;
    }

    if (original.username !== undefined) {
      process.env.CLAWBACK_SMTP_USERNAME = original.username;
    } else {
      delete process.env.CLAWBACK_SMTP_USERNAME;
    }

    if (original.password !== undefined) {
      process.env.CLAWBACK_SMTP_PASSWORD = original.password;
    } else {
      delete process.env.CLAWBACK_SMTP_PASSWORD;
    }

    if (original.fromAddress !== undefined) {
      process.env.CLAWBACK_SMTP_FROM_ADDRESS = original.fromAddress;
    } else {
      delete process.env.CLAWBACK_SMTP_FROM_ADDRESS;
    }
  }
}

function createFakeReviewedExternalWorkflowExecutor(options?: {
  failWith?: Error;
  responseStatusCode?: number | null;
  responseSummary?: string | null;
  backendReference?: string | null;
  onRun?: () => void;
}): ReviewedExternalWorkflowExecutor {
  return {
    async runReviewedExternalWorkflow() {
      options?.onRun?.();
      if (options?.failWith) {
        throw options.failWith;
      }

      return {
        response_status_code: options?.responseStatusCode ?? 202,
        response_summary: options?.responseSummary ?? "Workflow accepted by n8n.",
        backend_reference: options?.backendReference ?? "exec_n8n_01",
      };
    },
  };
}

function createFakeSlackSetupService(options?: {
  setupResult?: unknown;
  statusResult?: unknown;
  probeResult?: unknown;
  validatedConfig?: {
    botToken: string;
    defaultChannel: string;
  };
}): SlackSetupService {
  return {
    async setup() {
      return options?.setupResult ?? {
        connection_id: "conn_slack_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "Connected as Clawbot in Acme.",
          lastProbeAt: "2026-03-25T12:00:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      };
    },
    async getStatus() {
      return options?.statusResult ?? {
        connection_id: "conn_slack_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "Connected as Clawbot in Acme.",
          lastProbeAt: "2026-03-25T12:00:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      };
    },
    async probe() {
      return options?.probeResult ?? {
        ok: true,
        checkedAt: "2026-03-25T12:00:00Z",
        summary: "Connected as Clawbot in Acme.",
        issues: [],
        botName: "Clawbot",
        teamName: "Acme",
      };
    },
    async getValidatedConfig() {
      return {
        botToken: options?.validatedConfig?.botToken ?? "xoxb-test",
        signingSecret: "slack-signing-secret-test",
        defaultChannel: options?.validatedConfig?.defaultChannel ?? "C123456",
        validatedBotName: "Clawbot",
        validatedTeamName: "Acme",
        lastProbeAt: "2026-03-25T12:00:00Z",
        lastProbeError: null,
      };
    },
  } as unknown as SlackSetupService;
}

function createFakeGitHubConnectionService(options?: {
  setupResult?: unknown;
  statusResult?: unknown;
  probeResult?: unknown;
}): GitHubConnectionService {
  return {
    async setup() {
      return options?.setupResult ?? {
        connection_id: "conn_github_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "GitHub connection is ready.",
          lastProbeAt: "2026-03-25T12:00:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      };
    },
    async getStatus() {
      return options?.statusResult ?? {
        connection_id: "conn_github_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "GitHub connection is ready.",
          lastProbeAt: "2026-03-25T12:05:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      };
    },
    async probe() {
      return options?.probeResult ?? {
        ok: true,
        checkedAt: "2026-03-25T12:10:00Z",
        summary: "GitHub token is valid.",
        issues: [],
        user: {
          login: "octocat",
          name: "The Octocat",
        },
        scopes: ["repo"],
      };
    },
  } as unknown as GitHubConnectionService;
}

function createFakeDriveSetupService(options?: {
  setupResult?: unknown;
  summaryResult?: unknown;
  probeResult?: {
    ok: boolean;
    issues: Array<{ code: string }>;
    [key: string]: unknown;
  };
  statusResult?: unknown;
  recoveryHints?: string[];
  oauthCredentialsResult?: unknown;
  saveOAuthResult?: unknown;
  storedOAuthSecrets?: { clientId: string; clientSecret: string } | null;
  oauthCallbackResult?: unknown;
}): DriveSetupService {
  return {
    async setup() {
      return options?.setupResult ?? {
        configured: true,
        checked_at: "2026-03-25T12:00:00Z",
      };
    },
    async getSummary() {
      return options?.summaryResult ?? {
        configured: true,
        checked_at: "2026-03-25T12:05:00Z",
      };
    },
    async probe() {
      return options?.probeResult ?? {
        ok: true,
        issues: [],
        checkedAt: "2026-03-25T12:10:00Z",
      };
    },
    async status() {
      return options?.statusResult ?? {
        state: "ready",
        summary: "Drive connection is ready.",
      };
    },
    recoveryHints() {
      return options?.recoveryHints ?? [];
    },
    async getOAuthAppCredentials() {
      return options?.oauthCredentialsResult ?? {
        configured: true,
        client_id_present: true,
      };
    },
    async saveOAuthAppCredentials() {
      return options?.saveOAuthResult ?? { saved: true };
    },
    async getStoredOAuthAppSecrets() {
      return options?.storedOAuthSecrets ?? {
        clientId: "drive-client-id",
        clientSecret: "drive-client-secret",
      };
    },
    async completeOAuthFlow() {
      return options?.oauthCallbackResult ?? {
        configured: true,
        checked_at: "2026-03-25T12:15:00Z",
      };
    },
  } as unknown as DriveSetupService;
}

function createFakeDriveContextService(options?: {
  listFilesResult?: unknown;
  searchFilesResult?: unknown;
  fileContentResult?: unknown;
}): DriveContextService {
  return {
    async listFiles() {
      return options?.listFilesResult ?? {
        files: [{ id: "file_01", name: "Proposal.docx" }],
        next_page_token: null,
      };
    },
    async searchFiles() {
      return options?.searchFilesResult ?? {
        files: [{ id: "file_02", name: "Invoice.pdf" }],
        next_page_token: null,
      };
    },
    async getFileContent() {
      return options?.fileContentResult ?? {
        file: { id: "file_01", name: "Proposal.docx" },
        content: "Important document content",
      };
    },
  } as unknown as DriveContextService;
}

function createFakeWhatsAppSetupService(options?: {
  setupResult?: unknown;
  statusResult?: unknown;
  probeResult?: unknown;
  transportModeResult?: unknown;
  startPairingResult?: unknown;
  waitForPairingResult?: unknown;
}): WhatsAppSetupService {
  return {
    async setup(_workspaceId: string, connectionId: string) {
      return options?.setupResult ?? {
        connection_id: connectionId,
        connection_status: "connected",
        transport_mode: "meta_cloud_api",
        pairing_status: null,
        paired_identity_ref: null,
        operational: {
          state: "ready",
          summary: "WhatsApp connection is ready.",
          lastProbeAt: "2026-03-25T12:00:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      };
    },
    async getStatus(_workspaceId: string, connectionId: string) {
      return options?.statusResult ?? {
        connection_id: connectionId,
        connection_status: "connected",
        transport_mode: "meta_cloud_api",
        pairing_status: null,
        paired_identity_ref: null,
        operational: {
          state: "ready",
          summary: "WhatsApp connection is ready.",
          lastProbeAt: "2026-03-25T12:05:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      };
    },
    async probe() {
      return options?.probeResult ?? {
        ok: true,
        checkedAt: "2026-03-25T12:10:00Z",
        summary: "WhatsApp API is reachable.",
        issues: [],
        displayName: "Acme Support",
      };
    },
    async setTransportMode(_workspaceId: string, connectionId: string, transportMode: string) {
      return options?.transportModeResult ?? {
        connection_id: connectionId,
        connection_status: "connected",
        transport_mode: transportMode,
        pairing_status: transportMode === "openclaw_pairing" ? "unpaired" : null,
        paired_identity_ref: null,
        operational: {
          state: "configured",
          summary: "Transport mode updated.",
          lastProbeAt: null,
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      };
    },
    async startPairing(_workspaceId: string, connectionId: string) {
      return options?.startPairingResult ?? {
        pairing: {
          qr_data_url: "data:image/png;base64,abc123",
          message: "Scan the QR code to pair.",
          account_id: null,
        },
        status: {
          connection_id: connectionId,
          connection_status: "connected",
          transport_mode: "openclaw_pairing",
          pairing_status: "unpaired",
          paired_identity_ref: null,
          operational: {
            state: "configured",
            summary: "Waiting for pairing.",
            lastProbeAt: null,
            blockingIssueCodes: [],
          },
          probe: null,
          recovery_hints: [],
        },
      };
    },
    async waitForPairing(_workspaceId: string, connectionId: string) {
      return options?.waitForPairingResult ?? {
        pairing: {
          connected: true,
          message: "Device paired.",
          account_id: "acct_wa_01",
        },
        status: {
          connection_id: connectionId,
          connection_status: "connected",
          transport_mode: "openclaw_pairing",
          pairing_status: "paired",
          paired_identity_ref: "acct_wa_01",
          operational: {
            state: "ready",
            summary: "WhatsApp pairing is complete.",
            lastProbeAt: "2026-03-25T12:15:00Z",
            blockingIssueCodes: [],
          },
          probe: null,
          recovery_hints: [],
        },
      };
    },
  } as unknown as WhatsAppSetupService;
}

function createFakeGmailPollingService(options?: {
  pollResult?: Awaited<ReturnType<GmailPollingServiceContract["pollConnection"]>>;
}): GmailPollingServiceContract {
  return {
    async pollConnection(workspaceId: string, connectionId: string, trigger: "manual" | "background") {
      return options?.pollResult ?? {
        connection_id: connectionId,
        workspace_id: workspaceId,
        trigger,
        watch_status: "polling",
        bootstrapped: true,
        processed_messages: 2,
        created_results: 1,
        deduplicated_results: 1,
        attached_worker_ids: ["wkr_followup_01"],
        last_checked_at: "2026-03-25T12:20:00Z",
        last_success_at: "2026-03-25T12:20:00Z",
        last_message_at: "2026-03-25T12:19:30Z",
        last_error: null,
      };
    },
    async pollEligibleConnections() {
      return [];
    },
    start() {},
    async stop() {},
  };
}

// ---------------------------------------------------------------------------
// Fake auth service (simplified from app.test.ts)
// ---------------------------------------------------------------------------

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

  async createInvitation() {
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
    return await this.bootstrapAdmin();
  }
}

// ---------------------------------------------------------------------------
// In-memory stores
// ---------------------------------------------------------------------------

class InMemoryWorkerStore implements WorkerStore {
  private items: StoredWorker[] = [];

  async list(workspaceId: string) {
    return this.items.filter((w) => w.workspaceId === workspaceId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }
  async findBySlug(workspaceId: string, slug: string) {
    return this.items.find((w) => w.workspaceId === workspaceId && w.slug === slug) ?? null;
  }
  async create(input: StoredWorker) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredWorker>) {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((w) => w.id !== id);
  }
}

class InMemoryWorkItemStore implements WorkItemStore {
  private items: StoredWorkItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((w) => w.workspaceId === workspaceId);
  }
  async listByWorker(workerId: string) {
    return this.items.filter((w) => w.workerId === workerId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((w) => w.workspaceId === workspaceId && w.id === id) ?? null;
  }
  async findBySourceInboxItemId(workspaceId: string, sourceInboxItemId: string) {
    return this.items.find(
      (w) => w.workspaceId === workspaceId && w.sourceInboxItemId === sourceInboxItemId,
    ) ?? null;
  }
  async create(input: StoredWorkItem) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredWorkItem>) {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((w) => w.id !== id);
  }
}

class InMemoryInboxItemStore implements InboxItemStore {
  private items: StoredInboxItem[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId);
  }
  async listOpen(workspaceId: string) {
    return this.items.filter((i) => i.workspaceId === workspaceId && i.state === "open");
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.id === id) ?? null;
  }
  async findByReviewId(workspaceId: string, reviewId: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.reviewId === reviewId) ?? null;
  }
  async findByWorkItemId(workspaceId: string, workItemId: string) {
    return this.items.find((i) => i.workspaceId === workspaceId && i.workItemId === workItemId) ?? null;
  }
  async create(input: StoredInboxItem) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredInboxItem>) {
    const idx = this.items.findIndex((i) => i.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
  }
}

class InMemoryReviewStore implements ReviewStore {
  private items: StoredReview[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((r) => r.workspaceId === workspaceId);
  }
  async listPending(workspaceId: string) {
    return this.items.filter((r) => r.workspaceId === workspaceId && r.status === "pending");
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((r) => r.workspaceId === workspaceId && r.id === id) ?? null;
  }
  async create(input: StoredReview) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredReview>) {
    const idx = this.items.findIndex((r) => r.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((r) => r.id !== id);
  }
}

class InMemoryReviewDecisionStore implements ReviewDecisionStore {
  private items: StoredReviewDecision[] = [];

  async findByReviewId(workspaceId: string, reviewId: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.reviewId === reviewId) ?? null;
  }

  async create(input: StoredReviewDecision) {
    this.items.push(input);
    return input;
  }

  get all() {
    return this.items;
  }
}

class InMemoryActivityEventStore implements ActivityEventStore {
  private items: StoredActivityEvent[] = [];

  async listByWorkspace(workspaceId: string, limit?: number) {
    const filtered = this.items
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? filtered.slice(0, limit) : filtered;
  }
  async create(input: StoredActivityEvent) {
    this.items.push(input);
    return input;
  }

  async findByReviewResult(workspaceId: string, reviewId: string, resultKind: string) {
    return this.items.find(
      (event) =>
        event.workspaceId === workspaceId
        && event.reviewId === reviewId
        && event.resultKind === resultKind,
    ) ?? null;
  }

  get all() {
    return this.items;
  }
}

class InMemoryConnectionStore implements ConnectionStore {
  private items: StoredConnection[] = [];

  async listAll() {
    return [...this.items];
  }
  async listByWorkspace(workspaceId: string) {
    return this.items.filter((c) => c.workspaceId === workspaceId);
  }
  async findById(workspaceId: string, id: string) {
    return this.items.find((c) => c.workspaceId === workspaceId && c.id === id) ?? null;
  }
  async create(input: StoredConnection) {
    this.items.push(input);
    return input;
  }
  async update(id: string, input: Partial<StoredConnection>) {
    const idx = this.items.findIndex((c) => c.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
  async remove(id: string) {
    this.items = this.items.filter((c) => c.id !== id);
  }
}

class InMemoryInputRouteStore implements InputRouteStore {
  private items: StoredInputRoute[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((route) => route.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((route) => route.workspaceId === workspaceId && route.id === id) ?? null;
  }

  async update(id: string, input: Partial<StoredInputRoute>) {
    const idx = this.items.findIndex((route) => route.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }

  async create(input: StoredInputRoute) {
    this.items.push(input);
    return input;
  }
}

class InMemoryContactStore implements ContactStore {
  private items: StoredContact[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((contact) => contact.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((contact) => contact.workspaceId === workspaceId && contact.id === id) ?? null;
  }

  async findByEmail(workspaceId: string, email: string) {
    return this.items.find((contact) => contact.workspaceId === workspaceId && contact.primaryEmail === email) ?? null;
  }

  async create(input: StoredContact) {
    this.items.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredContact>) {
    const idx = this.items.findIndex((contact) => contact.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
}

class InMemoryAccountStore implements AccountStore {
  private items: StoredAccount[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((account) => account.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((account) => account.workspaceId === workspaceId && account.id === id) ?? null;
  }

  async findByDomain(workspaceId: string, domain: string) {
    return this.items.find((account) => account.workspaceId === workspaceId && account.primaryDomain === domain) ?? null;
  }

  async create(input: StoredAccount) {
    this.items.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredAccount>) {
    const idx = this.items.findIndex((account) => account.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
}

class InMemoryActionCapabilityStore implements ActionCapabilityStore {
  private items: StoredActionCapability[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((action) => action.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((action) => action.workspaceId === workspaceId && action.id === id) ?? null;
  }

  async create(input: StoredActionCapability) {
    this.items.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredActionCapability>) {
    const idx = this.items.findIndex((action) => action.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }
}

class InMemoryWorkspacePeopleStore implements WorkspacePeopleStore {
  private items: StoredWorkspacePerson[] = [];

  async listByWorkspace(_workspaceId: string) {
    return this.items;
  }

  async create(input: StoredWorkspacePerson) {
    this.items.push(input);
    return input;
  }
}

class InMemoryApprovalSurfaceIdentityStore implements ApprovalSurfaceIdentityStore {
  private items: StoredApprovalSurfaceIdentity[] = [];

  async listByWorkspace(workspaceId: string) {
    return this.items.filter((item) => item.workspaceId === workspaceId);
  }

  async findById(workspaceId: string, id: string) {
    return this.items.find((item) => item.workspaceId === workspaceId && item.id === id) ?? null;
  }

  async findByChannelAndUser(workspaceId: string, channel: StoredApprovalSurfaceIdentity["channel"], userId: string) {
    return this.items.find(
      (item) => item.workspaceId === workspaceId && item.channel === channel && item.userId === userId,
    ) ?? null;
  }

  async findByChannelAndIdentity(
    workspaceId: string,
    channel: StoredApprovalSurfaceIdentity["channel"],
    externalIdentity: string,
  ) {
    return this.items.find(
      (item) =>
        item.workspaceId === workspaceId
        && item.channel === channel
        && item.externalIdentity === externalIdentity,
    ) ?? null;
  }

  async create(input: StoredApprovalSurfaceIdentity) {
    this.items.push(input);
    return input;
  }

  async update(id: string, input: Partial<StoredApprovalSurfaceIdentity>) {
    const idx = this.items.findIndex((item) => item.id === id);
    if (idx === -1) throw new Error("not found");
    this.items[idx] = { ...this.items[idx]!, ...input };
    return this.items[idx]!;
  }

  async remove(id: string) {
    this.items = this.items.filter((item) => item.id !== id);
  }

  get all() {
    return this.items;
  }
}

class FakeGmailValidator {
  async validateReadOnly(input: { refreshToken: string }) {
    if (input.refreshToken === "bad-refresh-token") {
      throw new Error("Invalid refresh token");
    }

    return {
      emailAddress: "shared-inbox@example.com",
    };
  }
}

class FakeServiceAccountValidator {
  async validateServiceAccount(input: { serviceAccountEmail: string; privateKey: string; targetMailbox: string }) {
    if (input.privateKey === "bad-key") {
      throw new Error("Invalid service account key");
    }

    return {
      emailAddress: input.targetMailbox,
    };
  }
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

const NOW = new Date("2026-03-18T10:00:00Z");
const HOUR_AGO = new Date("2026-03-18T09:00:00Z");
const YESTERDAY = new Date("2026-03-17T10:00:00Z");
const APPROVAL_SURFACE_SECRET = "test-approval-surface-secret";

function seedWorkers(store: InMemoryWorkerStore) {
  return Promise.all([
    store.create({
      id: "wkr_followup_01",
      workspaceId: "ws_1",
      slug: "client-follow-up",
      name: "Client Follow-Up",
      kind: "follow_up",
      scope: "shared",
      status: "active",
      summary: "Monitors client threads.",
      memberIds: ["usr_admin"],
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      inputRouteIds: [],
      connectionIds: [],
      actionIds: [],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
    store.create({
      id: "wkr_proposal_01",
      workspaceId: "ws_1",
      slug: "proposal",
      name: "Proposal",
      kind: "proposal",
      scope: "shared",
      status: "active",
      summary: "Generates proposals.",
      memberIds: ["usr_admin"],
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      inputRouteIds: [],
      connectionIds: [],
      actionIds: [],
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

function seedWorkItems(store: InMemoryWorkItemStore) {
  return Promise.all([
    store.create({
      id: "wi_draft_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "email_draft",
      status: "pending_review",
      title: "Follow-up: Acme Corp renewal",
      summary: "Draft reply for review.",
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      sourceRouteKind: "watched_inbox",
      sourceEventId: null,
      reviewId: "rev_01",
      runId: null,
      triageJson: null,
      draftTo: "sarah@acmecorp.com",
      draftSubject: "Re: Acme Corp renewal",
      draftBody: "Hi Sarah,\n\nThanks for the update.",
      executionStatus: "not_requested",
      executionError: null,
      executionStateJson: {
        continuity_family: "governed_action",
        state: "waiting_review",
        current_step: "wait_for_review",
        pause_reason: "human_review",
        resume_reason: null,
        last_decision: "shadow_draft",
        target_worker_id: null,
        downstream_work_item_id: null,
      },
      createdAt: HOUR_AGO,
      updatedAt: NOW,
    }),
    store.create({
      id: "wi_proposal_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "proposal_draft",
      status: "draft",
      title: "Proposal: Globex engagement",
      summary: "Initial draft.",
      assigneeIds: ["usr_admin"],
      reviewerIds: [],
      sourceRouteKind: "chat",
      sourceEventId: null,
      reviewId: null,
      runId: null,
      triageJson: null,
      draftTo: null,
      draftSubject: null,
      draftBody: null,
      executionStatus: "not_requested",
      executionError: null,
      executionStateJson: null,
      createdAt: YESTERDAY,
      updatedAt: HOUR_AGO,
    }),
  ]);
}

function seedInboxItems(store: InMemoryInboxItemStore) {
  return Promise.all([
    store.create({
      id: "inb_review_01",
      workspaceId: "ws_1",
      kind: "review",
      title: "Review email draft: Acme Corp",
      summary: "Needs review before sending.",
      assigneeIds: ["usr_admin"],
      workerId: "wkr_followup_01",
      workItemId: "wi_draft_01",
      reviewId: "rev_01",
      routeKind: "watched_inbox",
      state: "open",
      triageJson: null,
      executionStateJson: {
        continuity_family: "governed_action",
        state: "waiting_review",
        current_step: "wait_for_review",
        pause_reason: "human_review",
        resume_reason: null,
        last_decision: "shadow_draft",
        target_worker_id: null,
        downstream_work_item_id: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    }),
    store.create({
      id: "inb_setup_01",
      workspaceId: "ws_1",
      kind: "setup",
      title: "Connect Gmail",
      summary: "Enable proactive follow-ups.",
      assigneeIds: ["usr_other"],
      workerId: "wkr_followup_01",
      workItemId: null,
      reviewId: null,
      routeKind: null,
      state: "open",
      triageJson: null,
      executionStateJson: null,
      createdAt: YESTERDAY,
      updatedAt: YESTERDAY,
    }),
  ]);
}

function seedReviews(store: InMemoryReviewStore) {
  return store.create({
    id: "rev_01",
    workspaceId: "ws_1",
    actionKind: "send_email",
    status: "pending",
    workerId: "wkr_followup_01",
    workItemId: "wi_draft_01",
    reviewerIds: ["usr_admin"],
    assigneeIds: ["usr_admin"],
    sourceRouteKind: "watched_inbox",
    actionDestination: "sarah@acmecorp.com",
    requestedAt: NOW,
    resolvedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

function seedActivity(store: InMemoryActivityEventStore) {
  return Promise.all([
    store.create({
      id: "evt_01",
      workspaceId: "ws_1",
      timestamp: NOW,
      workerId: "wkr_followup_01",
      routeKind: "watched_inbox",
      resultKind: "review_requested",
      title: "Review requested for Acme Corp follow-up",
      summary: "Dave needs to approve.",
      assigneeIds: ["usr_admin"],
      runId: null,
      workItemId: "wi_draft_01",
      reviewId: "rev_01",
    }),
    store.create({
      id: "evt_02",
      workspaceId: "ws_1",
      timestamp: HOUR_AGO,
      workerId: "wkr_followup_01",
      routeKind: "forward_email",
      resultKind: "work_item_created",
      title: "Email draft created",
      summary: null,
      assigneeIds: ["usr_admin"],
      runId: null,
      workItemId: "wi_draft_01",
      reviewId: null,
    }),
  ]);
}

function seedConnections(store: InMemoryConnectionStore) {
  return Promise.all([
    store.create({
      id: "conn_gmail_01",
      workspaceId: "ws_1",
      provider: "gmail",
      accessMode: "read_only",
      status: "connected",
      label: "Admin Gmail (read-only)",
      capabilities: ["read_threads", "watch_inbox"],
      attachedWorkerIds: ["wkr_followup_01"],
      configJson: {},
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
    store.create({
      id: "conn_smtp_01",
      workspaceId: "ws_1",
      provider: "smtp_relay",
      accessMode: "write_capable",
      status: "connected",
      label: "Shared Mail Relay",
      capabilities: ["send_email"],
      attachedWorkerIds: ["wkr_followup_01"],
      configJson: {},
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

function seedInputRoutes(store: InMemoryInputRouteStore) {
  return Promise.all([
    store.create({
      id: "rte_forward_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "forward_email",
      status: "active",
      label: "Forwarded email",
      description: "Forward one thread into the worker.",
      address: "followup-acme@inbound.clawback.dev",
      capabilityNote: "Lowest-trust route for real client context.",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
    store.create({
      id: "rte_watch_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "watched_inbox",
      status: "active",
      label: "Watched inbox",
      description: "Notices inbox activity and prepares shadow drafts.",
      address: null,
      capabilityNote: "Enabled when Gmail read-only is connected.",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

function seedActionCapabilities(store: InMemoryActionCapabilityStore) {
  return Promise.all([
    store.create({
      id: "act_send_email_01",
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "send_email",
      boundaryMode: "ask_me",
      reviewerIds: ["usr_admin"],
      destinationConnectionId: "conn_smtp_01",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    }),
  ]);
}

function seedWorkspacePeople(store: InMemoryWorkspacePeopleStore) {
  return Promise.all([
    store.create({
      id: "usr_admin",
      email: "admin@example.com",
      displayName: "Admin",
      role: "admin",
    }),
    store.create({
      id: "usr_other",
      email: "emma@example.com",
      displayName: "Emma",
      role: "user",
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("workspace read-model routes", () => {
  let fakeAuthService: FakeAuthService;
  let workerStore: InMemoryWorkerStore;
  let workItemStore: InMemoryWorkItemStore;
  let inboxItemStore: InMemoryInboxItemStore;
  let reviewStore: InMemoryReviewStore;
  let reviewDecisionStore: InMemoryReviewDecisionStore;
  let activityStore: InMemoryActivityEventStore;
  let connectionStore: InMemoryConnectionStore;
  let inputRouteStore: InMemoryInputRouteStore;
  let contactStore: InMemoryContactStore;
  let accountStore: InMemoryAccountStore;
  let actionCapabilityStore: InMemoryActionCapabilityStore;
  let workspacePeopleStore: InMemoryWorkspacePeopleStore;
  let approvalSurfaceIdentityStore: InMemoryApprovalSurfaceIdentityStore;
  let services: WorkspaceReadModelServices;

  beforeEach(async () => {
    fakeAuthService = new FakeAuthService();
    workerStore = new InMemoryWorkerStore();
    workItemStore = new InMemoryWorkItemStore();
    inboxItemStore = new InMemoryInboxItemStore();
    reviewStore = new InMemoryReviewStore();
    reviewDecisionStore = new InMemoryReviewDecisionStore();
    activityStore = new InMemoryActivityEventStore();
    connectionStore = new InMemoryConnectionStore();
    inputRouteStore = new InMemoryInputRouteStore();
    contactStore = new InMemoryContactStore();
    accountStore = new InMemoryAccountStore();
    actionCapabilityStore = new InMemoryActionCapabilityStore();
    workspacePeopleStore = new InMemoryWorkspacePeopleStore();
    approvalSurfaceIdentityStore = new InMemoryApprovalSurfaceIdentityStore();

    services = {
      workerService: new WorkerService({ store: workerStore }),
      workItemService: new WorkItemService({ store: workItemStore }),
      inboxItemService: new InboxItemService({ store: inboxItemStore }),
      reviewService: new ReviewService({ store: reviewStore }),
      reviewDecisionService: new ReviewDecisionService({ store: reviewDecisionStore }),
      activityService: new ActivityService({ store: activityStore }),
      connectionService: new ConnectionService({ store: connectionStore }),
      inputRouteService: new InputRouteService({ store: inputRouteStore }),
      contactService: new ContactService({ store: contactStore }),
      accountService: new AccountService({ store: accountStore }),
      actionCapabilityService: new ActionCapabilityService({ store: actionCapabilityStore }),
      workspacePeopleService: new WorkspacePeopleService({ store: workspacePeopleStore }),
      approvalSurfaceIdentityService: new ApprovalSurfaceIdentityService({
        store: approvalSurfaceIdentityStore,
      }),
      gmailPilotSetupService: new GmailPilotSetupService({
        connectionService: new ConnectionService({ store: connectionStore }),
        validator: new FakeGmailValidator(),
        serviceAccountValidator: new FakeServiceAccountValidator(),
        now: () => NOW,
      }),
      reviewedEmailSender: createFakeReviewedEmailSender(),
    };

    await seedWorkers(workerStore);
    await seedWorkItems(workItemStore);
    await seedInboxItems(inboxItemStore);
    await seedReviews(reviewStore);
    await seedActivity(activityStore);
    await seedConnections(connectionStore);
    await seedInputRoutes(inputRouteStore);
    await seedActionCapabilities(actionCapabilityStore);
    await seedWorkspacePeople(workspacePeopleStore);
  });

  async function createApp() {
    return createControlPlaneApp({
      authService: fakeAuthService,
      workspaceReadModelServices: services,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
      approvalSurfaceTokenSecret: APPROVAL_SURFACE_SECRET,
    });
  }

  async function authenticate(app: Awaited<ReturnType<typeof createApp>>) {
    const res = await app.inject({
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
    const cookieHeader = serializeCookies(res.headers["set-cookie"] as string[]);
    return {
      cookie: cookieHeader,
      csrfToken: res.json().csrf_token as string,
      toString() {
        return cookieHeader;
      },
      valueOf() {
        return cookieHeader;
      },
    };
  }

  async function configureSlackApprovalSurface(
    app: Awaited<ReturnType<typeof createApp>>,
    cookie: { toString(): string; csrfToken: string },
  ) {
    await connectionStore.create({
      id: "conn_slack_01",
      workspaceId: "ws_1",
      provider: "slack",
      accessMode: "write_capable",
      status: "connected",
      label: "Workspace Slack",
      capabilities: ["send_approval_prompts", "receive_approval_decisions"],
      attachedWorkerIds: [],
      configJson: {
        botToken: "xoxb-test",
        signingSecret: "slack-signing-secret-test",
        defaultChannel: "C123456",
      },
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });

    const createIdentityRes = await app.inject({
      method: "POST",
      url: "/api/workspace/approval-surfaces/identities",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        channel: "slack",
        user_id: "usr_admin",
        external_identity: "uadmin01",
        label: "Admin Slack",
      },
    });
    expect(createIdentityRes.statusCode).toBe(201);
  }

  function buildSlackApprovalToken(input: {
    reviewId: string;
    decision: "approved" | "denied";
    userId?: string;
    actorIdentity?: string;
  }) {
    const signer = new ApprovalSurfaceTokenSigner(APPROVAL_SURFACE_SECRET);
    return signer.sign({
      version: 1,
      workspaceId: "ws_1",
      reviewId: input.reviewId,
      channel: "slack",
      decision: input.decision,
      userId: input.userId ?? "usr_admin",
      actorIdentity: input.actorIdentity ?? "uadmin01",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
  }

  async function resolveReviewViaSlack(
    app: Awaited<ReturnType<typeof createApp>>,
    input: {
      reviewId: string;
      decision: "approved" | "denied";
      slackUserId?: string;
      actorIdentity?: string;
    },
  ) {
    const approvalToken = buildSlackApprovalToken({
      reviewId: input.reviewId,
      decision: input.decision,
      ...(input.actorIdentity !== undefined ? { actorIdentity: input.actorIdentity } : {}),
    });
    const interactionPayload = JSON.stringify({
      type: "block_actions",
      user: { id: input.slackUserId ?? "UADMIN01", username: "admin" },
      actions: [
        {
          type: "button",
          action_id: input.decision === "approved" ? "clawback_approve" : "clawback_deny",
          value: approvalToken,
        },
      ],
    });
    const rawBody = `payload=${encodeURIComponent(interactionPayload)}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signSlackInteraction("slack-signing-secret-test", timestamp, rawBody);

    return app.inject({
      method: "POST",
      url: "/api/webhooks/slack/interactions",
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature,
      },
      payload: rawBody,
    });
  }

  async function seedReviewedSendReview(params: {
    workItemId: string;
    reviewId: string;
    inboxItemId: string;
    destinationEmail: string;
  }) {
    await workItemStore.create({
      id: params.workItemId,
      workspaceId: "ws_1",
      workerId: "wkr_followup_01",
      kind: "email_draft",
      status: "pending_review",
      title: `Follow-up: ${params.destinationEmail}`,
      summary: "Draft reply for review.",
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      sourceRouteKind: "watched_inbox",
      sourceEventId: null,
      reviewId: params.reviewId,
      runId: null,
      triageJson: null,
      draftTo: params.destinationEmail,
      draftSubject: `Re: ${params.destinationEmail}`,
      draftBody: "Hi there,\n\nFollowing up on the reviewed draft.",
      executionStatus: "not_requested",
      executionError: null,
      createdAt: HOUR_AGO,
      updatedAt: NOW,
    });

    await reviewStore.create({
      id: params.reviewId,
      workspaceId: "ws_1",
      actionKind: "send_email",
      status: "pending",
      workerId: "wkr_followup_01",
      workItemId: params.workItemId,
      reviewerIds: ["usr_admin"],
      assigneeIds: ["usr_admin"],
      sourceRouteKind: "watched_inbox",
      actionDestination: params.destinationEmail,
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await inboxItemStore.create({
      id: params.inboxItemId,
      workspaceId: "ws_1",
      kind: "review",
      title: `Review email draft: ${params.destinationEmail}`,
      summary: "Needs review before sending.",
      assigneeIds: ["usr_admin"],
      workerId: "wkr_followup_01",
      workItemId: params.workItemId,
      reviewId: params.reviewId,
      routeKind: "watched_inbox",
      state: "open",
      triageJson: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  function comparableReviewedSendOutcome(outcome: any) {
    return {
      kind: outcome.kind,
      status: outcome.status,
      transport: outcome.transport,
      connection_id: outcome.connection_id,
      connection_label: outcome.connection_label,
      attempt_count: outcome.attempt_count,
      provider_message_id: outcome.provider_message_id,
      last_error: outcome.last_error,
    };
  }

  function n8nWebhookHeaders(token = "n8n-token") {
    return {
      "x-clawback-webhook-token": token,
    };
  }

  async function seedReviewedExternalWorkflowCallbackTarget() {
    await connectionStore.create({
      id: "conn_n8n_callback_01",
      workspaceId: "ws_1",
      provider: "n8n",
      accessMode: "write_capable",
      status: "connected",
      label: "Shared n8n",
      capabilities: ["run_n8n_workflow"],
      attachedWorkerIds: ["wkr_proposal_01"],
      configJson: {
        base_url: "https://n8n.example.com",
        auth_token: "n8n-token",
      },
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });

    await reviewStore.create({
      id: "rev_n8n_callback_01",
      workspaceId: "ws_1",
      actionKind: "run_external_workflow",
      status: "completed",
      workerId: "wkr_proposal_01",
      workItemId: "wi_n8n_callback_01",
      reviewerIds: ["usr_admin"],
      assigneeIds: ["usr_admin"],
      sourceRouteKind: "chat",
      actionDestination: "Shared n8n",
      requestPayloadJson: {
        backend_kind: "n8n",
        connection_id: "conn_n8n_callback_01",
        workflow_identifier: "crm-follow-up-sync",
        payload: {
          customer_id: "cus_123",
        },
      },
      requestedAt: NOW,
      resolvedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await workItemStore.create({
      id: "wi_n8n_callback_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "action_plan",
      status: "completed",
      title: "Reviewed CRM follow-up sync",
      summary: "The deterministic CRM sync was handed to n8n.",
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      sourceRouteKind: "chat",
      sourceEventId: null,
      reviewId: "rev_n8n_callback_01",
      runId: null,
      triageJson: null,
      draftTo: null,
      draftSubject: null,
      draftBody: null,
      executionStatus: "completed",
      executionError: null,
      executionStateJson: null,
      executionOutcomeJson: {
        kind: "reviewed_external_workflow",
        status: "succeeded",
        review_id: "rev_n8n_callback_01",
        review_decision_id: "rdec_n8n_01",
        approved_via: "web",
        backend_kind: "n8n",
        connection_id: "conn_n8n_callback_01",
        connection_label: "Shared n8n",
        workflow_identifier: "crm-follow-up-sync",
        request_payload: {
          customer_id: "cus_123",
        },
        attempt_count: 1,
        last_attempted_at: NOW.toISOString(),
        response_status_code: 202,
        response_summary: "Workflow accepted by n8n.",
        backend_reference: "exec_n8n_01",
        completed_at: NOW.toISOString(),
        failed_at: null,
        last_error: null,
        callback_result: null,
      },
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  // -----------------------------------------------------------------------
  // GET /api/workspace/today
  // -----------------------------------------------------------------------

  it("returns today response with viewer, stats, for_you, team, snapshots, recent_work", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/today",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();

    expect(body.viewer.user_id).toBe("usr_admin");
    expect(body.viewer.display_name).toBe("Admin");
    expect(body.viewer.role).toBe("admin");

    expect(body.stats.inbox_waiting).toBe(2);
    expect(body.stats.workers_active).toBe(2);
    expect(body.stats.connections_active).toBe(2);

    // for_you: open inbox items assigned to usr_admin
    expect(body.for_you).toHaveLength(1);
    expect(body.for_you[0].id).toBe("inb_review_01");

    expect(body.team).toHaveLength(2);
    expect(body.worker_snapshots).toHaveLength(2);
    expect(body.recent_work).toHaveLength(2);

    await app.close();
  });

  it("requires authentication for /api/workspace/today", async () => {
    const app = await createApp();
    const res = await app.inject({ method: "GET", url: "/api/workspace/today" });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/workers
  // -----------------------------------------------------------------------

  it("lists workers scoped to workspace", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/workers",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.workers).toHaveLength(2);
    expect(body.workers.map((w: any) => w.slug).sort()).toEqual(["client-follow-up", "proposal"]);

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/workers/:id
  // -----------------------------------------------------------------------

  it("returns a single worker by ID", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Client Follow-Up");

    await app.close();
  });

  it("returns 404 for unknown worker", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/workers/wkr_nonexistent",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/inbox
  // -----------------------------------------------------------------------

  it("lists inbox items", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(2);
    expect(res.json().items[0].execution_state_json).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "shadow_draft",
    });

    await app.close();
  });

  it("filters inbox items by assignee", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox?assignee=usr_admin",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().items).toHaveLength(1);
    expect(res.json().items[0].id).toBe("inb_review_01");

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/work
  // -----------------------------------------------------------------------

  it("lists work items", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/work",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().work_items).toHaveLength(2);
    expect(res.json().work_items[0].execution_state_json).toMatchObject({
      continuity_family: "governed_action",
      state: "waiting_review",
      current_step: "wait_for_review",
      pause_reason: "human_review",
      resume_reason: null,
      last_decision: "shadow_draft",
    });

    await app.close();
  });

  it("filters work items by kind", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/work?kind=email_draft",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().work_items).toHaveLength(1);
    expect(res.json().work_items[0].kind).toBe("email_draft");

    await app.close();
  });

  it("filters work items by worker_id", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/work?worker_id=wkr_proposal_01",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().work_items).toHaveLength(1);
    expect(res.json().work_items[0].kind).toBe("proposal_draft");

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/work/:id
  // -----------------------------------------------------------------------

  it("returns a single work item by ID", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().title).toBe("Follow-up: Acme Corp renewal");

    await app.close();
  });

  it("returns 404 for unknown work item", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_nonexistent",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/connections
  // -----------------------------------------------------------------------

  it("lists connections", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/connections",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.connections).toHaveLength(2);
    expect(body.connections.map((connection: any) => connection.provider).sort()).toEqual([
      "gmail",
      "smtp_relay",
    ]);
    expect(body.connections.every((connection: any) => connection.status === "connected")).toBe(true);

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/input-routes
  // -----------------------------------------------------------------------

  it("lists input routes and supports worker filtering", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes?worker_id=wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.input_routes).toHaveLength(2);
    expect(body.input_routes.map((route: any) => route.kind).sort()).toEqual([
      "forward_email",
      "watched_inbox",
    ]);
    const watchedRoute = body.input_routes.find((route: any) => route.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("active");

    await app.close();
  });

  // -----------------------------------------------------------------------
  // POST /api/workspace/connections/:id/connect
  // -----------------------------------------------------------------------

  it("connect requires csrf protection", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("disconnect requires csrf protection", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("disconnect marks the Gmail connection not_connected and downgrades watched inbox routes to suggested", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("not_connected");

    const routeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes?worker_id=wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });
    const watchedRoute = routeRes.json().input_routes.find((route: any) => route.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("suggested");

    await app.close();
  });

  it("connect re-activates watched inbox routes for attached workers", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const setupRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/gmail-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        scope_kind: "shared_mailbox",
        mailbox_addresses: ["shared-inbox@example.com"],
        client_id: "google-client-id",
        client_secret: "google-client-secret",
        refresh_token: "refresh-token",
      },
    });

    expect(setupRes.statusCode).toBe(200);

    await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/disconnect",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/connect",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("connected");

    const routeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes?worker_id=wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });
    const watchedRoute = routeRes.json().input_routes.find((route: any) => route.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("active");

    await app.close();
  });

  it("stores validated Gmail setup and returns a summary", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/gmail-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        scope_kind: "shared_mailbox",
        mailbox_addresses: ["shared-inbox@example.com"],
        client_id: "google-client-id",
        client_secret: "google-client-secret",
        refresh_token: "refresh-token",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().setup.configured).toBe(true);
    expect(res.json().setup.validated_email).toBe("shared-inbox@example.com");
    expect(res.json().setup.scope_kind).toBe("shared_mailbox");

    await app.close();
  });

  it("rejects invalid Gmail setup credentials", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/gmail-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        scope_kind: "shared_mailbox",
        mailbox_addresses: ["shared-inbox@example.com"],
        client_id: "google-client-id",
        client_secret: "google-client-secret",
        refresh_token: "bad-refresh-token",
      },
    });

    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe("validation_failed");

    await app.close();
  });

  it("validates and connects Gmail via service account", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const saKey = JSON.stringify({
      type: "service_account",
      client_email: "clawback@project.iam.gserviceaccount.com",
      private_key: "fake-private-key",
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/gmail-service-account-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        service_account_json: saKey,
        target_mailbox: "team@company.com",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().setup.configured).toBe(true);
    expect(res.json().setup.auth_method).toBe("service_account");
    expect(res.json().setup.validated_email).toBe("team@company.com");
    expect(res.json().setup.service_account_present).toBe(true);

    await app.close();
  });

  it("rejects invalid service account JSON", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/gmail-service-account-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        service_account_json: "not-valid-json",
        target_mailbox: "team@company.com",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("invalid_service_account_json");

    await app.close();
  });

  it("rejects service account JSON with wrong type", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/gmail-service-account-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        service_account_json: JSON.stringify({ type: "authorized_user", client_email: "x@y.com", private_key: "k" }),
        target_mailbox: "team@company.com",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("invalid_service_account_json");

    await app.close();
  });

  it("returns Gmail setup summary and supports manual Gmail polling", async () => {
    services.gmailPollingService = createFakeGmailPollingService();

    const app = await createApp();
    const cookie = await authenticate(app);

    const summaryRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_gmail_01/gmail-setup",
      headers: { cookie: cookie.toString() },
    });

    expect(summaryRes.statusCode).toBe(200);
    expect(summaryRes.json()).toMatchObject({
      setup: {
        connection_id: "conn_gmail_01",
        configured: false,
      },
    });

    const pollRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_gmail_01/gmail-poll",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });

    expect(pollRes.statusCode).toBe(200);
    expect(pollRes.json()).toMatchObject({
      poll: {
        connection_id: "conn_gmail_01",
        workspace_id: "ws_1",
        trigger: "manual",
        watch_status: "polling",
        bootstrapped: true,
      },
    });

    await app.close();
  });

  it("saves Gmail OAuth app credentials, returns them, and completes the OAuth callback flow", async () => {
    const originalFetch = globalThis.fetch;
    const originalGoogleClientId = process.env.GOOGLE_CLIENT_ID;
    const originalGoogleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;

    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        access_token: "oauth-access-token",
        refresh_token: "oauth-refresh-token",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const app = await createApp();
      const cookie = await authenticate(app);

      const initialCredsRes = await app.inject({
        method: "GET",
        url: "/api/workspace/connections/conn_gmail_01/gmail-oauth-credentials",
        headers: { cookie: cookie.toString() },
      });
      expect(initialCredsRes.statusCode).toBe(200);
      expect(initialCredsRes.json()).toEqual({
        configured: false,
        client_id: null,
      });

      const saveCredsRes = await app.inject({
        method: "POST",
        url: "/api/workspace/connections/conn_gmail_01/gmail-oauth-credentials",
        headers: {
          cookie: cookie.toString(),
          "x-csrf-token": cookie.csrfToken,
        },
        payload: {
          client_id: "oauth-client-id",
          client_secret: "oauth-client-secret",
        },
      });
      expect(saveCredsRes.statusCode).toBe(200);
      expect(saveCredsRes.json()).toEqual({
        configured: true,
        client_id: "oauth-client-id",
      });

      const storedCredsRes = await app.inject({
        method: "GET",
        url: "/api/workspace/connections/conn_gmail_01/gmail-oauth-credentials",
        headers: { cookie: cookie.toString() },
      });
      expect(storedCredsRes.statusCode).toBe(200);
      expect(storedCredsRes.json()).toEqual({
        configured: true,
        client_id: "oauth-client-id",
      });

      const callbackRes = await app.inject({
        method: "POST",
        url: "/api/workspace/connections/conn_gmail_01/gmail-oauth-callback",
        headers: {
          cookie: cookie.toString(),
          "x-csrf-token": cookie.csrfToken,
        },
        payload: {
          code: "oauth-auth-code",
          redirect_uri: "http://localhost:3000/oauth/callback",
        },
      });

      expect(callbackRes.statusCode).toBe(200);
      expect(callbackRes.json()).toMatchObject({
        setup: {
          connection_id: "conn_gmail_01",
          configured: true,
          auth_method: "oauth",
        },
      });

      await app.close();
    } finally {
      globalThis.fetch = originalFetch;
      if (originalGoogleClientId !== undefined) {
        process.env.GOOGLE_CLIENT_ID = originalGoogleClientId;
      } else {
        delete process.env.GOOGLE_CLIENT_ID;
      }
      if (originalGoogleClientSecret !== undefined) {
        process.env.GOOGLE_CLIENT_SECRET = originalGoogleClientSecret;
      } else {
        delete process.env.GOOGLE_CLIENT_SECRET;
      }
    }
  });

  it("updates Gmail attached workers and syncs worker connection ids plus watched inbox route state", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/connections/conn_gmail_01/attached-workers",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        attached_worker_ids: [],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().attached_worker_ids).toEqual([]);

    const workerRes = await app.inject({
      method: "GET",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workerRes.statusCode).toBe(200);
    expect(workerRes.json().connection_ids).toEqual([]);

    const routeRes = await app.inject({
      method: "GET",
      url: "/api/workspace/input-routes?worker_id=wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });
    const watchedRoute = routeRes.json().input_routes.find((route: any) => route.kind === "watched_inbox");
    expect(watchedRoute.status).toBe("suggested");

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/action-capabilities
  // -----------------------------------------------------------------------

  it("lists action capabilities and supports worker filtering", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/action-capabilities?worker_id=wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.action_capabilities).toHaveLength(1);
    expect(body.action_capabilities[0].kind).toBe("send_email");
    expect(body.action_capabilities[0].boundary_mode).toBe("ask_me");

    await app.close();
  });

  it("updates action boundary mode", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/action-capabilities/act_send_email_01",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        boundary_mode: "never",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().boundary_mode).toBe("never");

    const listRes = await app.inject({
      method: "GET",
      url: "/api/workspace/action-capabilities?worker_id=wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().action_capabilities[0].boundary_mode).toBe("never");

    await app.close();
  });

  it("requires admin for PATCH /api/workspace/action-capabilities/:id", async () => {
    const nonAdminAuth = new FakeAuthService();

    const app = await createControlPlaneApp({
      authService: nonAdminAuth,
      workspaceReadModelServices: services,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapRes = await app.inject({
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
    const cookieHeader = serializeCookies(bootstrapRes.headers["set-cookie"] as string[]);
    const csrfToken = bootstrapRes.json().csrf_token as string;

    for (const [token, ctx] of nonAdminAuth.sessions) {
      nonAdminAuth.sessions.set(token, {
        ...ctx,
        membership: { ...ctx.membership, role: "user" },
      });
    }

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/action-capabilities/act_send_email_01",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
      },
      payload: {
        boundary_mode: "never",
      },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe("forbidden");

    await app.close();
  });

  it("bootstraps an n8n workspace connection for admins", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/bootstrap",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        provider: "n8n",
        access_mode: "write_capable",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().provider).toBe("n8n");
    expect(res.json().access_mode).toBe("write_capable");

    await app.close();
  });

  it("configures an n8n backend connection", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    await connectionStore.create({
      id: "conn_n8n_01",
      workspaceId: "ws_1",
      provider: "n8n",
      accessMode: "write_capable",
      status: "not_connected",
      label: "Shared n8n",
      capabilities: ["run_n8n_workflow"],
      attachedWorkerIds: ["wkr_proposal_01"],
      configJson: {},
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_n8n_01/n8n-configure",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        base_url: "https://n8n.example.com",
        auth_token: "n8n-token",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("connected");

    const stored = await connectionStore.findById("ws_1", "conn_n8n_01");
    expect(stored?.configJson).toMatchObject({
      base_url: "https://n8n.example.com",
      auth_token: "n8n-token",
    });

    await app.close();
  });

  it("n8n-status returns configuration state for a configured n8n connection", async () => {
    await connectionStore.create({
      id: "conn_n8n_01",
      workspaceId: "ws_1",
      provider: "n8n",
      accessMode: "write_capable",
      status: "connected",
      label: "Shared n8n",
      capabilities: ["run_n8n_workflow"],
      attachedWorkerIds: [],
      configJson: {
        base_url: "https://n8n.example.com",
        auth_token: "n8n-token",
        webhook_path_prefix: "webhook-test",
        configured_at: "2026-03-23T10:00:00Z",
      },
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_n8n_01/n8n-status",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      status: "connected",
      base_url: "https://n8n.example.com",
      has_auth_token: true,
      webhook_path_prefix: "webhook-test",
      configured_at: "2026-03-23T10:00:00Z",
      configured: true,
    });

    await app.close();
  });

  it("n8n-verify returns reachable=false when n8n is not configured", async () => {
    await connectionStore.create({
      id: "conn_n8n_01",
      workspaceId: "ws_1",
      provider: "n8n",
      accessMode: "write_capable",
      status: "not_connected",
      label: "Shared n8n",
      capabilities: ["run_n8n_workflow"],
      attachedWorkerIds: [],
      configJson: {},
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_n8n_01/n8n-verify",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      reachable: false,
      authenticated: false,
    });
    expect(res.json().error).toContain("not configured");

    await app.close();
  });

  it("updates the destination connection for an external workflow capability", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    await connectionStore.create({
      id: "conn_n8n_01",
      workspaceId: "ws_1",
      provider: "n8n",
      accessMode: "write_capable",
      status: "connected",
      label: "Shared n8n",
      capabilities: ["run_n8n_workflow"],
      attachedWorkerIds: ["wkr_proposal_01"],
      configJson: {
        base_url: "https://n8n.example.com",
        auth_token: "n8n-token",
      },
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });
    await actionCapabilityStore.create({
      id: "act_external_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "run_external_workflow",
      boundaryMode: "ask_me",
      reviewerIds: ["usr_admin"],
      destinationConnectionId: null,
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/action-capabilities/act_external_01",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        destination_connection_id: "conn_n8n_01",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().destination_connection_id).toBe("conn_n8n_01");

    await app.close();
  });

  it("lists workspace people", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/people",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.people).toHaveLength(2);
    expect(body.people[0].display_name).toBe("Admin");
    expect(body.people[1].display_name).toBe("Emma");

    await app.close();
  });

  it("creates and updates approval surface identities for admins", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/workspace/approval-surfaces/identities",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        channel: "whatsapp",
        user_id: "usr_admin",
        external_identity: "15551234567@c.us",
        label: "Admin WhatsApp",
      },
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().external_identity).toBe("15551234567@c.us");

    const listRes = await app.inject({
      method: "GET",
      url: "/api/workspace/approval-surfaces/identities",
      headers: { cookie: cookie.toString() },
    });

    expect(listRes.statusCode).toBe(200);
    expect(listRes.json().identities).toHaveLength(1);

    const identityId = listRes.json().identities[0].id as string;
    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/workspace/approval-surfaces/identities/${identityId}`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        label: "Founder WhatsApp",
        status: "disabled",
      },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().label).toBe("Founder WhatsApp");
    expect(patchRes.json().status).toBe("disabled");

    await app.close();
  });

  it("bootstraps a WhatsApp workspace connection for admins", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/bootstrap",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        provider: "whatsapp",
        access_mode: "write_capable",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().provider).toBe("whatsapp");
    expect(res.json().access_mode).toBe("write_capable");

    await app.close();
  });

  it("routes WhatsApp setup, status, probe, transport mode, and pairing through the configured WhatsApp setup service", async () => {
    services.whatsappSetupService = createFakeWhatsAppSetupService();

    const app = await createApp();
    const cookie = await authenticate(app);

    const bootstrapRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/bootstrap",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        provider: "whatsapp",
        access_mode: "write_capable",
      },
    });

    expect(bootstrapRes.statusCode).toBe(201);
    const connectionId = bootstrapRes.json().id as string;

    const setupRes = await app.inject({
      method: "POST",
      url: `/api/workspace/connections/${connectionId}/whatsapp-setup`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        phone_number_id: "1234567890",
        access_token: "wa-access-token",
        verify_token: "wa-verify-token",
      },
    });
    expect(setupRes.statusCode).toBe(200);
    expect(setupRes.json()).toMatchObject({
      connection_id: connectionId,
      operational: {
        state: "ready",
      },
    });

    const statusRes = await app.inject({
      method: "GET",
      url: `/api/workspace/connections/${connectionId}/whatsapp-status`,
      headers: { cookie: cookie.toString() },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json()).toMatchObject({
      connection_id: connectionId,
      transport_mode: "meta_cloud_api",
    });

    const probeRes = await app.inject({
      method: "POST",
      url: `/api/workspace/connections/${connectionId}/whatsapp-probe`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });
    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json()).toMatchObject({
      ok: true,
      displayName: "Acme Support",
    });

    const modeRes = await app.inject({
      method: "POST",
      url: `/api/workspace/connections/${connectionId}/whatsapp-transport-mode`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        transport_mode: "openclaw_pairing",
      },
    });
    expect(modeRes.statusCode).toBe(200);
    expect(modeRes.json()).toMatchObject({
      connection_id: connectionId,
      transport_mode: "openclaw_pairing",
      pairing_status: "unpaired",
    });

    const startPairingRes = await app.inject({
      method: "POST",
      url: `/api/workspace/connections/${connectionId}/whatsapp-pairing/start`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        force: true,
        timeout_ms: 5000,
      },
    });
    expect(startPairingRes.statusCode).toBe(200);
    expect(startPairingRes.json()).toMatchObject({
      pairing: {
        message: "Scan the QR code to pair.",
      },
      status: {
        connection_id: connectionId,
      },
    });

    const waitPairingRes = await app.inject({
      method: "POST",
      url: `/api/workspace/connections/${connectionId}/whatsapp-pairing/wait`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        timeout_ms: 5000,
      },
    });
    expect(waitPairingRes.statusCode).toBe(200);
    expect(waitPairingRes.json()).toMatchObject({
      pairing: {
        connected: true,
        account_id: "acct_wa_01",
      },
      status: {
        connection_id: connectionId,
        pairing_status: "paired",
      },
    });

    await app.close();
  });

  it("rejects invalid WhatsApp transport mode values before calling the setup service", async () => {
    services.whatsappSetupService = createFakeWhatsAppSetupService();

    const app = await createApp();
    const cookie = await authenticate(app);

    const bootstrapRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/bootstrap",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        provider: "whatsapp",
        access_mode: "write_capable",
      },
    });

    const connectionId = bootstrapRes.json().id as string;

    const res = await app.inject({
      method: "POST",
      url: `/api/workspace/connections/${connectionId}/whatsapp-transport-mode`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        transport_mode: "bad_mode",
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "transport_mode must be 'openclaw_pairing' or 'meta_cloud_api'.",
      code: "invalid_transport_mode",
    });

    await app.close();
  });

  it("bootstraps a GitHub workspace connection for admins", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/bootstrap",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        provider: "github",
        access_mode: "read_only",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().provider).toBe("github");
    expect(res.json().access_mode).toBe("read_only");

    await app.close();
  });

  it("routes GitHub setup, status, and probe through the configured GitHub connection service", async () => {
    services.githubConnectionService = createFakeGitHubConnectionService({
      setupResult: {
        connection_id: "conn_github_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "GitHub connection is ready.",
          lastProbeAt: "2026-03-25T12:00:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      },
      statusResult: {
        connection_id: "conn_github_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "GitHub connection is ready.",
          lastProbeAt: "2026-03-25T12:05:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      },
      probeResult: {
        ok: true,
        checkedAt: "2026-03-25T12:10:00Z",
        summary: "GitHub token is valid.",
        issues: [],
        user: {
          login: "octocat",
          name: "The Octocat",
        },
        scopes: ["repo"],
      },
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const setupRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_github_01/github-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        personal_access_token: "ghp_testtoken",
        org: "acme",
        repos: ["acme/repo"],
      },
    });
    expect(setupRes.statusCode).toBe(200);
    expect(setupRes.json().connection_id).toBe("conn_github_01");

    const statusRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_github_01/github-status",
      headers: { cookie: cookie.toString() },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().operational.state).toBe("ready");

    const probeRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_github_01/github-probe",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });
    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json()).toMatchObject({
      ok: true,
      user: {
        login: "octocat",
      },
      scopes: ["repo"],
    });

    await app.close();
  });

  it("routes Drive setup and OAuth endpoints through the configured Drive setup service", async () => {
    services.driveSetupService = createFakeDriveSetupService({
      setupResult: {
        configured: true,
        checked_at: "2026-03-25T12:00:00Z",
      },
      summaryResult: {
        configured: true,
        checked_at: "2026-03-25T12:05:00Z",
      },
      probeResult: {
        ok: true,
        issues: [],
        checkedAt: "2026-03-25T12:10:00Z",
      },
      statusResult: {
        state: "ready",
        summary: "Drive connection is ready.",
      },
      oauthCredentialsResult: {
        configured: true,
        client_id_present: true,
      },
      saveOAuthResult: {
        saved: true,
      },
      oauthCallbackResult: {
        configured: true,
        checked_at: "2026-03-25T12:15:00Z",
      },
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const setupRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_drive_01/drive-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        client_id: "drive-client-id",
        client_secret: "drive-client-secret",
        refresh_token: "drive-refresh-token",
      },
    });
    expect(setupRes.statusCode).toBe(200);
    expect(setupRes.json()).toEqual({
      setup: {
        configured: true,
        checked_at: "2026-03-25T12:00:00Z",
      },
    });

    const statusRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_drive_01/drive-status",
      headers: { cookie: cookie.toString() },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json()).toEqual({
      setup: {
        configured: true,
        checked_at: "2026-03-25T12:05:00Z",
      },
    });

    const probeRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_drive_01/drive-probe",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });
    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json()).toEqual({
      probe: {
        ok: true,
        issues: [],
        checkedAt: "2026-03-25T12:10:00Z",
      },
      status: {
        state: "ready",
        summary: "Drive connection is ready.",
      },
      recovery_hints: [],
    });

    const oauthCredsRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_drive_01/drive-oauth-credentials",
      headers: { cookie: cookie.toString() },
    });
    expect(oauthCredsRes.statusCode).toBe(200);
    expect(oauthCredsRes.json()).toEqual({
      configured: true,
      client_id_present: true,
    });

    const oauthSaveRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_drive_01/drive-oauth-credentials",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        client_id: "drive-client-id",
        client_secret: "drive-client-secret",
      },
    });
    expect(oauthSaveRes.statusCode).toBe(200);
    expect(oauthSaveRes.json()).toEqual({ saved: true });

    const oauthCallbackRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_drive_01/drive-oauth-callback",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        code: "auth-code",
        redirect_uri: "http://localhost/callback",
      },
    });
    expect(oauthCallbackRes.statusCode).toBe(200);
    expect(oauthCallbackRes.json()).toEqual({
      setup: {
        configured: true,
        checked_at: "2026-03-25T12:15:00Z",
      },
    });

    await app.close();
  });

  it("routes Drive context endpoints through the configured Drive context service", async () => {
    services.driveContextService = createFakeDriveContextService({
      listFilesResult: {
        files: [{ id: "file_01", name: "Proposal.docx" }],
        next_page_token: "next-token",
      },
      searchFilesResult: {
        files: [{ id: "file_02", name: "Invoice.pdf" }],
        next_page_token: null,
      },
      fileContentResult: {
        file: { id: "file_01", name: "Proposal.docx" },
        content: "Important document content",
      },
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const filesRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_drive_01/drive-files?folder_id=folder_01&page_size=10&page_token=next-token",
      headers: { cookie: cookie.toString() },
    });
    expect(filesRes.statusCode).toBe(200);
    expect(filesRes.json()).toEqual({
      files: [{ id: "file_01", name: "Proposal.docx" }],
      next_page_token: "next-token",
    });

    const searchRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_drive_01/drive-search?q=invoice&page_size=5",
      headers: { cookie: cookie.toString() },
    });
    expect(searchRes.statusCode).toBe(200);
    expect(searchRes.json()).toEqual({
      files: [{ id: "file_02", name: "Invoice.pdf" }],
      next_page_token: null,
    });

    const fileRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_drive_01/drive-file/file_01",
      headers: { cookie: cookie.toString() },
    });
    expect(fileRes.statusCode).toBe(200);
    expect(fileRes.json()).toEqual({
      file: { id: "file_01", name: "Proposal.docx" },
      content: "Important document content",
    });

    await app.close();
  });

  it("reports SMTP env status and configures smtp_relay connections from env", async () => {
    await withSmtpEnv({
      host: "smtp.example.com",
      port: "587",
      username: "smtp-user",
      password: "smtp-password",
      fromAddress: "relay@example.com",
    }, async () => {
      const app = await createApp();
      const cookie = await authenticate(app);

      const statusRes = await app.inject({
        method: "GET",
        url: "/api/workspace/connections/conn_smtp_01/smtp-status",
        headers: { cookie: cookie.toString() },
      });

      expect(statusRes.statusCode).toBe(200);
      expect(statusRes.json()).toEqual({
        connection_id: "conn_smtp_01",
        status: "connected",
        env_configured: true,
        host_present: true,
        port_present: true,
        username_present: true,
        password_present: true,
        from_address_present: true,
        from_address: "relay@example.com",
        host: "smtp.example.com",
        port: 587,
      });

      const configureRes = await app.inject({
        method: "POST",
        url: "/api/workspace/connections/conn_smtp_01/smtp-configure",
        headers: {
          cookie: cookie.toString(),
          "x-csrf-token": cookie.csrfToken,
        },
        payload: {},
      });

      expect(configureRes.statusCode).toBe(200);
      expect(configureRes.json()).toMatchObject({
        id: "conn_smtp_01",
        provider: "smtp_relay",
        status: "connected",
      });

      const stored = await services.connectionService.getStoredById("ws_1", "conn_smtp_01");
      expect(stored.configJson).toMatchObject({
        host: "smtp.example.com",
        port: 587,
        from: "relay@example.com",
      });
      expect(typeof stored.configJson?.configuredAt).toBe("string");

      await app.close();
    });
  });

  it("rejects smtp-configure when required SMTP env vars are missing", async () => {
    await withSmtpEnv({}, async () => {
      const app = await createApp();
      const cookie = await authenticate(app);

      const configureRes = await app.inject({
        method: "POST",
        url: "/api/workspace/connections/conn_smtp_01/smtp-configure",
        headers: {
          cookie: cookie.toString(),
          "x-csrf-token": cookie.csrfToken,
        },
        payload: {},
      });

      expect(configureRes.statusCode).toBe(400);
      expect(configureRes.json()).toEqual({
        error: "SMTP environment variables are not fully configured. Set CLAWBACK_SMTP_HOST, CLAWBACK_SMTP_PORT, and CLAWBACK_SMTP_FROM_ADDRESS.",
        code: "smtp_env_not_configured",
      });

      await app.close();
    });
  });

  it("bootstraps a Slack workspace connection for admins", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/bootstrap",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        provider: "slack",
        access_mode: "write_capable",
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().provider).toBe("slack");
    expect(res.json().access_mode).toBe("write_capable");

    await app.close();
  });

  it("routes Slack setup, status, and probe through the configured Slack setup service", async () => {
    services.slackSetupService = createFakeSlackSetupService({
      setupResult: {
        connection_id: "conn_slack_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "Connected as Clawbot in Acme.",
          lastProbeAt: "2026-03-25T12:00:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      },
      statusResult: {
        connection_id: "conn_slack_01",
        connection_status: "connected",
        operational: {
          state: "ready",
          summary: "Connected as Clawbot in Acme.",
          lastProbeAt: "2026-03-25T12:05:00Z",
          blockingIssueCodes: [],
        },
        probe: null,
        recovery_hints: [],
      },
      probeResult: {
        ok: true,
        checkedAt: "2026-03-25T12:10:00Z",
        summary: "Connected as Clawbot in Acme.",
        issues: [],
        botName: "Clawbot",
        teamName: "Acme",
      },
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const setupRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_slack_01/slack-setup",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        bot_token: "xoxb-test",
        signing_secret: "slack-signing-secret-test",
        default_channel: "C123456",
      },
    });
    expect(setupRes.statusCode).toBe(200);
    expect(setupRes.json().connection_id).toBe("conn_slack_01");

    const statusRes = await app.inject({
      method: "GET",
      url: "/api/workspace/connections/conn_slack_01/slack-status",
      headers: { cookie: cookie.toString() },
    });
    expect(statusRes.statusCode).toBe(200);
    expect(statusRes.json().operational.state).toBe("ready");

    const probeRes = await app.inject({
      method: "POST",
      url: "/api/workspace/connections/conn_slack_01/slack-probe",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });
    expect(probeRes.statusCode).toBe(200);
    expect(probeRes.json()).toMatchObject({
      ok: true,
      botName: "Clawbot",
      teamName: "Acme",
    });

    await app.close();
  });

  it("sends a Slack test message through the validated Slack config", async () => {
    services.slackSetupService = createFakeSlackSetupService({
      validatedConfig: {
        botToken: "xoxb-test",
        defaultChannel: "C123456",
      },
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ ok: true, channel: "C123456", ts: "1.0" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });

    try {
      const app = await createApp();
      const cookie = await authenticate(app);

      const res = await app.inject({
        method: "POST",
        url: "/api/workspace/connections/conn_slack_01/slack-test-send",
        headers: {
          cookie: cookie.toString(),
          "x-csrf-token": cookie.csrfToken,
        },
        payload: {},
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });

      await app.close();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("creates a review decision record for web approvals", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(200);
    expect(reviewDecisionStore.all).toHaveLength(1);
    expect(reviewDecisionStore.all[0]?.surface).toBe("web");
    expect(reviewDecisionStore.all[0]?.decidedByUserId).toBe("usr_admin");

    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.statusCode).toBe(200);
    expect(workRes.json().execution_outcome_json).toMatchObject({
      kind: "reviewed_send_email",
      status: "sent",
      approved_via: "web",
      review_id: "rev_01",
      review_decision_id: reviewDecisionStore.all[0]?.id,
      transport: "smtp_relay",
      connection_id: "conn_smtp_01",
      connection_label: "Shared Mail Relay",
      attempt_count: 1,
      provider_message_id: "msg_test_01",
      last_error: null,
    });

    await app.close();
  });

  it("resolves a review through the Slack approval path and records the same send truth", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    await connectionStore.create({
      id: "conn_slack_01",
      workspaceId: "ws_1",
      provider: "slack",
      accessMode: "write_capable",
      status: "connected",
      label: "Workspace Slack",
      capabilities: ["send_approval_prompts", "receive_approval_decisions"],
      attachedWorkerIds: [],
      configJson: {
        botToken: "xoxb-test",
        signingSecret: "slack-signing-secret-test",
        defaultChannel: "C123456",
      },
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });

    const createIdentityRes = await app.inject({
      method: "POST",
      url: "/api/workspace/approval-surfaces/identities",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        channel: "slack",
        user_id: "usr_admin",
        external_identity: "uadmin01",
        label: "Admin Slack",
      },
    });
    expect(createIdentityRes.statusCode).toBe(201);

    const signer = new ApprovalSurfaceTokenSigner(APPROVAL_SURFACE_SECRET);
    const approvalToken = signer.sign({
      version: 1,
      workspaceId: "ws_1",
      reviewId: "rev_01",
      channel: "slack",
      decision: "approved",
      userId: "usr_admin",
      actorIdentity: "uadmin01",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const interactionPayload = JSON.stringify({
      type: "block_actions",
      user: { id: "UADMIN01", username: "admin" },
      actions: [
        {
          type: "button",
          action_id: "clawback_approve",
          value: approvalToken,
        },
      ],
    });
    const rawBody = `payload=${encodeURIComponent(interactionPayload)}`;
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signSlackInteraction("slack-signing-secret-test", timestamp, rawBody);

    const resolveRes = await app.inject({
      method: "POST",
      url: "/api/webhooks/slack/interactions",
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-slack-request-timestamp": timestamp,
        "x-slack-signature": signature,
      },
      payload: rawBody,
    });

    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json()).toEqual({
      processed: 1,
      skipped: 0,
      errors: 0,
    });
    expect(reviewDecisionStore.all).toHaveLength(1);
    expect(reviewDecisionStore.all[0]?.surface).toBe("slack");
    expect(reviewDecisionStore.all[0]?.decidedByUserId).toBe("usr_admin");
    expect(reviewDecisionStore.all[0]?.actorExternalId).toBe("uadmin01");

    const reviewRes = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers: { cookie: cookie.toString() },
    });
    expect(reviewRes.statusCode).toBe(200);
    expect(reviewRes.json().status).toBe("completed");

    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.statusCode).toBe(200);
    expect(workRes.json().status).toBe("sent");
    expect(workRes.json().execution_status).toBe("completed");
    expect(workRes.json().execution_outcome_json).toMatchObject({
      kind: "reviewed_send_email",
      status: "sent",
      approved_via: "slack",
      review_id: "rev_01",
      review_decision_id: reviewDecisionStore.all[0]?.id,
      transport: "smtp_relay",
      connection_id: "conn_smtp_01",
      connection_label: "Shared Mail Relay",
      attempt_count: 1,
      provider_message_id: "msg_test_01",
      last_error: null,
    });

    expect(
      activityStore.all.filter((event) => event.resultKind === "review_resolved_via_slack"),
    ).toHaveLength(1);

    await app.close();
  });

  it("keeps web and Slack approved sends aligned on the same reviewed-send model", async () => {
    await seedReviewedSendReview({
      workItemId: "wi_draft_slack_compare_01",
      reviewId: "rev_slack_compare_01",
      inboxItemId: "inb_review_slack_compare_01",
      destinationEmail: "casey@acmecorp.com",
    });

    const app = await createApp();
    const cookie = await authenticate(app);
    await configureSlackApprovalSurface(app, cookie);

    const webRes = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });
    expect(webRes.statusCode).toBe(200);

    const slackRes = await resolveReviewViaSlack(app, {
      reviewId: "rev_slack_compare_01",
      decision: "approved",
    });
    expect(slackRes.statusCode).toBe(200);
    expect(slackRes.json()).toEqual({
      processed: 1,
      skipped: 0,
      errors: 0,
    });

    const webReview = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers: { cookie: cookie.toString() },
    });
    const slackReview = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_slack_compare_01",
      headers: { cookie: cookie.toString() },
    });
    expect(webReview.json().status).toBe("completed");
    expect(slackReview.json().status).toBe("completed");

    const webWork = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    const slackWork = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_slack_compare_01",
      headers: { cookie: cookie.toString() },
    });

    expect(webWork.json().status).toBe("sent");
    expect(slackWork.json().status).toBe("sent");
    expect(webWork.json().execution_status).toBe("completed");
    expect(slackWork.json().execution_status).toBe("completed");
    expect(webWork.json().execution_outcome_json.approved_via).toBe("web");
    expect(slackWork.json().execution_outcome_json.approved_via).toBe("slack");
    expect(comparableReviewedSendOutcome(webWork.json().execution_outcome_json)).toEqual(
      comparableReviewedSendOutcome(slackWork.json().execution_outcome_json),
    );

    expect(reviewDecisionStore.all).toHaveLength(2);
    expect(reviewDecisionStore.all.map((decision) => decision.surface).sort()).toEqual([
      "slack",
      "web",
    ]);

    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const reviewApprovedEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "review_approved",
    );
    const workSentEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "work_item_sent",
    );
    const slackSurfaceEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "review_resolved_via_slack",
    );

    expect(reviewApprovedEvents.map((event: any) => event.review_id).sort()).toEqual([
      "rev_01",
      "rev_slack_compare_01",
    ]);
    expect(workSentEvents.map((event: any) => event.work_item_id).sort()).toEqual([
      "wi_draft_01",
      "wi_draft_slack_compare_01",
    ]);
    expect(slackSurfaceEvents).toHaveLength(1);
    expect(slackSurfaceEvents[0]?.review_id).toBe("rev_slack_compare_01");

    await app.close();
  });

  it("keeps web and Slack denial semantics aligned on the same reviewed-send model", async () => {
    await seedReviewedSendReview({
      workItemId: "wi_draft_slack_deny_01",
      reviewId: "rev_slack_deny_01",
      inboxItemId: "inb_review_slack_deny_01",
      destinationEmail: "jamie@acmecorp.com",
    });

    const app = await createApp();
    const cookie = await authenticate(app);
    await configureSlackApprovalSurface(app, cookie);

    const webRes = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "denied" },
    });
    expect(webRes.statusCode).toBe(200);

    const slackRes = await resolveReviewViaSlack(app, {
      reviewId: "rev_slack_deny_01",
      decision: "denied",
    });
    expect(slackRes.statusCode).toBe(200);
    expect(slackRes.json()).toEqual({
      processed: 1,
      skipped: 0,
      errors: 0,
    });

    const webReview = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers: { cookie: cookie.toString() },
    });
    const slackReview = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_slack_deny_01",
      headers: { cookie: cookie.toString() },
    });
    expect(webReview.json().status).toBe("denied");
    expect(slackReview.json().status).toBe("denied");

    const webWork = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    const slackWork = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_slack_deny_01",
      headers: { cookie: cookie.toString() },
    });
    expect(webWork.json().status).toBe("pending_review");
    expect(slackWork.json().status).toBe("pending_review");
    expect(webWork.json().execution_status).toBe("not_requested");
    expect(slackWork.json().execution_status).toBe("not_requested");
    expect(webWork.json().execution_outcome_json).toBeNull();
    expect(slackWork.json().execution_outcome_json).toBeNull();

    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const webInbox = inboxRes.json().items.find((item: any) => item.id === "inb_review_01");
    const slackInbox = inboxRes.json().items.find((item: any) => item.id === "inb_review_slack_deny_01");
    expect(webInbox.state).toBe("resolved");
    expect(slackInbox.state).toBe("resolved");

    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const deniedEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "review_denied",
    );
    const slackSurfaceEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "review_resolved_via_slack",
    );
    expect(deniedEvents.map((event: any) => event.review_id).sort()).toEqual([
      "rev_01",
      "rev_slack_deny_01",
    ]);
    expect(deniedEvents.every((event: any) => event.summary === null)).toBe(true);
    expect(slackSurfaceEvents).toHaveLength(1);
    expect(slackSurfaceEvents[0]?.review_id).toBe("rev_slack_deny_01");

    await app.close();
  });

  it("routes already-resolved Slack approvals through the same idempotent repair truth as web", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);
    await configureSlackApprovalSurface(app, cookie);

    await reviewStore.update("rev_01", {
      status: "approved",
      resolvedAt: NOW,
      updatedAt: NOW,
    });
    await reviewDecisionStore.create({
      id: "rdc_slack_existing_01",
      workspaceId: "ws_1",
      reviewId: "rev_01",
      decision: "approved",
      surface: "slack",
      decidedByUserId: "usr_admin",
      actorExternalId: "uadmin01",
      rationale: null,
      payloadJson: {},
      occurredAt: NOW,
      createdAt: NOW,
    });

    const res = await resolveReviewViaSlack(app, {
      reviewId: "rev_01",
      decision: "approved",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      processed: 1,
      skipped: 0,
      errors: 0,
    });

    const reviewRes = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers: { cookie: cookie.toString() },
    });
    expect(reviewRes.json().status).toBe("completed");

    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().status).toBe("sent");
    expect(workRes.json().execution_status).toBe("completed");
    expect(workRes.json().execution_outcome_json).toMatchObject({
      kind: "reviewed_send_email",
      status: "sent",
      approved_via: "slack",
      review_decision_id: "rdc_slack_existing_01",
    });

    expect(reviewDecisionStore.all).toHaveLength(1);

    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const approvedEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "review_approved",
    );
    const sentEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "work_item_sent",
    );
    const slackSurfaceEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "review_resolved_via_slack",
    );
    expect(approvedEvents).toHaveLength(1);
    expect(sentEvents).toHaveLength(1);
    expect(slackSurfaceEvents).toHaveLength(0);

    await app.close();
  });

  it("resolves a review through the runtime WhatsApp approval surface path", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const createIdentityRes = await app.inject({
      method: "POST",
      url: "/api/workspace/approval-surfaces/identities",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        channel: "whatsapp",
        user_id: "usr_admin",
        external_identity: "15551234567@c.us",
        label: "Admin WhatsApp",
      },
    });
    expect(createIdentityRes.statusCode).toBe(201);

    const signer = new ApprovalSurfaceTokenSigner(APPROVAL_SURFACE_SECRET);
    const approvalToken = signer.sign({
      version: 1,
      workspaceId: "ws_1",
      reviewId: "rev_01",
      channel: "whatsapp",
      decision: "approved",
      userId: "usr_admin",
      actorIdentity: "15551234567@c.us",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const resolveRes = await app.inject({
      method: "POST",
      url: "/api/runtime/reviews/rev_01/approval-surfaces/whatsapp/resolve",
      headers: {
        authorization: "Bearer clawback-local-runtime-api-token",
      },
      payload: {
        approval_token: approvalToken,
        actor_identity: "15551234567@c.us",
        interaction_id: "wa_msg_01",
      },
    });

    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.json().already_resolved).toBe(false);
    expect(resolveRes.json().review.status).toBe("completed");
    expect(resolveRes.json().decision.surface).toBe("whatsapp");
    expect(resolveRes.json().decision.decided_by_user_id).toBe("usr_admin");

    const againRes = await app.inject({
      method: "POST",
      url: "/api/runtime/reviews/rev_01/approval-surfaces/whatsapp/resolve",
      headers: {
        authorization: "Bearer clawback-local-runtime-api-token",
      },
      payload: {
        approval_token: approvalToken,
        actor_identity: "15551234567@c.us",
        interaction_id: "wa_msg_01",
      },
    });

    expect(againRes.statusCode).toBe(200);
    expect(againRes.json().already_resolved).toBe(true);
    expect(reviewDecisionStore.all).toHaveLength(1);
    expect(
      activityStore.all.filter((event) => event.resultKind === "review_resolved_via_whatsapp"),
    ).toHaveLength(1);

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/activity
  // -----------------------------------------------------------------------

  it("lists activity events ordered by timestamp desc", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.events).toHaveLength(2);
    // Should be ordered by timestamp desc (newest first)
    expect(body.events[0].id).toBe("evt_01");
    expect(body.events[1].id).toBe("evt_02");

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/reviews/:id
  // -----------------------------------------------------------------------

  it("returns a single review by ID", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.action_kind).toBe("send_email");
    expect(body.status).toBe("pending");
    expect(body.action_destination).toBe("sarah@acmecorp.com");

    await app.close();
  });

  it("returns 404 for unknown review", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_nonexistent",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("creates and approves a reviewed external workflow handoff exactly once", async () => {
    let executionCount = 0;
    services.reviewedExternalWorkflowExecutor = createFakeReviewedExternalWorkflowExecutor({
      onRun: () => {
        executionCount += 1;
      },
      responseStatusCode: 202,
      responseSummary: "Workflow accepted by n8n.",
      backendReference: "exec_n8n_01",
    });

    await connectionStore.create({
      id: "conn_n8n_01",
      workspaceId: "ws_1",
      provider: "n8n",
      accessMode: "write_capable",
      status: "connected",
      label: "Shared n8n",
      capabilities: ["run_n8n_workflow"],
      attachedWorkerIds: ["wkr_proposal_01"],
      configJson: {
        base_url: "https://n8n.example.com",
        auth_token: "n8n-token",
      },
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });
    await actionCapabilityStore.create({
      id: "act_external_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "run_external_workflow",
      boundaryMode: "ask_me",
      reviewerIds: ["usr_admin"],
      destinationConnectionId: "conn_n8n_01",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });
    await workItemStore.create({
      id: "wi_action_plan_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "action_plan",
      status: "draft",
      title: "Follow-on CRM sync",
      summary: "Create the downstream CRM note after approval.",
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      sourceRouteKind: "chat",
      sourceEventId: null,
      reviewId: null,
      runId: null,
      triageJson: null,
      draftTo: null,
      draftSubject: null,
      draftBody: null,
      executionStatus: "not_requested",
      executionError: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const requestRes = await app.inject({
      method: "POST",
      url: "/api/workspace/work/wi_action_plan_01/request-external-workflow-review",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        workflow_identifier: "crm-follow-up-sync",
        payload: {
          customer_id: "cus_123",
          note: "Approved follow-on action.",
        },
      },
    });

    expect(requestRes.statusCode).toBe(201);
    expect(requestRes.json().review.action_kind).toBe("run_external_workflow");
    const reviewId = requestRes.json().review.id as string;

    const approveRes = await app.inject({
      method: "POST",
      url: `/api/workspace/reviews/${reviewId}/resolve`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().status).toBe("completed");
    expect(executionCount).toBe(1);

    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_action_plan_01",
      headers: { cookie: cookie.toString() },
    });

    expect(workRes.statusCode).toBe(200);
    expect(workRes.json().status).toBe("completed");
    expect(workRes.json().execution_status).toBe("completed");
    expect(workRes.json().execution_outcome_json).toMatchObject({
      kind: "reviewed_external_workflow",
      status: "succeeded",
      approved_via: "web",
      connection_id: "conn_n8n_01",
      connection_label: "Shared n8n",
      workflow_identifier: "crm-follow-up-sync",
      response_status_code: 202,
      response_summary: "Workflow accepted by n8n.",
      backend_reference: "exec_n8n_01",
      attempt_count: 1,
    });

    const againRes = await app.inject({
      method: "POST",
      url: `/api/workspace/reviews/${reviewId}/resolve`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(againRes.statusCode).toBe(200);
    expect(executionCount).toBe(1);

    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const handoffEvent = activityRes
      .json()
      .events
      .find((event: any) => event.result_kind === "external_workflow_handed_off");
    expect(handoffEvent).toBeTruthy();
    expect(handoffEvent.work_item_id).toBe("wi_action_plan_01");

    await app.close();
  });

  it("records external workflow handoff failures without ambiguous retries", async () => {
    let executionCount = 0;
    services.reviewedExternalWorkflowExecutor = createFakeReviewedExternalWorkflowExecutor({
      onRun: () => {
        executionCount += 1;
      },
      failWith: new ReviewedExternalWorkflowExecutionError(
        "n8n workflow handoff failed: unauthorized",
        {
          responseStatusCode: 401,
          responseSummary: "unauthorized",
          backendReference: null,
        },
      ),
    });

    await connectionStore.create({
      id: "conn_n8n_01",
      workspaceId: "ws_1",
      provider: "n8n",
      accessMode: "write_capable",
      status: "connected",
      label: "Shared n8n",
      capabilities: ["run_n8n_workflow"],
      attachedWorkerIds: ["wkr_proposal_01"],
      configJson: {
        base_url: "https://n8n.example.com",
        auth_token: "bad-token",
      },
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });
    await actionCapabilityStore.create({
      id: "act_external_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "run_external_workflow",
      boundaryMode: "ask_me",
      reviewerIds: ["usr_admin"],
      destinationConnectionId: "conn_n8n_01",
      createdAt: YESTERDAY,
      updatedAt: NOW,
    });
    await workItemStore.create({
      id: "wi_action_plan_01",
      workspaceId: "ws_1",
      workerId: "wkr_proposal_01",
      kind: "action_plan",
      status: "draft",
      title: "Create downstream task",
      summary: "Kick off the deterministic task workflow.",
      assigneeIds: ["usr_admin"],
      reviewerIds: ["usr_admin"],
      sourceRouteKind: "chat",
      sourceEventId: null,
      reviewId: null,
      runId: null,
      triageJson: null,
      draftTo: null,
      draftSubject: null,
      draftBody: null,
      executionStatus: "not_requested",
      executionError: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const requestRes = await app.inject({
      method: "POST",
      url: "/api/workspace/work/wi_action_plan_01/request-external-workflow-review",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        workflow_identifier: "task-fanout",
        payload: {
          task_id: "tsk_123",
        },
      },
    });
    const reviewId = requestRes.json().review.id as string;

    const approveRes = await app.inject({
      method: "POST",
      url: `/api/workspace/reviews/${reviewId}/resolve`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(approveRes.statusCode).toBe(200);
    expect(approveRes.json().status).toBe("approved");
    expect(executionCount).toBe(1);

    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_action_plan_01",
      headers: { cookie: cookie.toString() },
    });

    expect(workRes.statusCode).toBe(200);
    expect(workRes.json().status).toBe("failed");
    expect(workRes.json().execution_status).toBe("failed");
    expect(workRes.json().execution_error).toContain("unauthorized");
    expect(workRes.json().execution_outcome_json).toMatchObject({
      kind: "reviewed_external_workflow",
      status: "failed",
      workflow_identifier: "task-fanout",
      response_status_code: 401,
      response_summary: "unauthorized",
      last_error: "n8n workflow handoff failed: unauthorized",
      attempt_count: 1,
    });

    const againRes = await app.inject({
      method: "POST",
      url: `/api/workspace/reviews/${reviewId}/resolve`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(againRes.statusCode).toBe(200);
    expect(executionCount).toBe(1);

    await app.close();
  });

  it("records a normalized n8n callback against the reviewed external workflow truth", async () => {
    await seedReviewedExternalWorkflowCallbackTarget();

    const app = await createApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/n8n/ws_1/conn_n8n_callback_01/callback",
      headers: n8nWebhookHeaders(),
      payload: {
        delivery_id: "n8n_cb_01",
        workflow_identifier: "crm-follow-up-sync",
        status: "succeeded",
        response_status_code: 200,
        summary: "Workflow completed in downstream systems.",
        backend_reference: "exec_n8n_01",
        occurred_at: NOW.toISOString(),
        clawback: {
          workspace_id: "ws_1",
          review_id: "rev_n8n_callback_01",
          work_item_id: "wi_n8n_callback_01",
        },
        ignored_raw_detail: {
          should_not_persist: true,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      deduplicated: false,
      review_id: "rev_n8n_callback_01",
      work_item_id: "wi_n8n_callback_01",
      callback_result: {
        delivery_id: "n8n_cb_01",
        status: "succeeded",
        response_status_code: 200,
        summary: "Workflow completed in downstream systems.",
        backend_reference: "exec_n8n_01",
      },
    });

    const stored = await workItemStore.findById("ws_1", "wi_n8n_callback_01");
    expect(stored?.status).toBe("completed");
    expect(stored?.executionStatus).toBe("completed");
    expect(stored?.executionOutcomeJson).toMatchObject({
      kind: "reviewed_external_workflow",
      status: "succeeded",
      callback_result: {
        delivery_id: "n8n_cb_01",
        status: "succeeded",
        response_status_code: 200,
        summary: "Workflow completed in downstream systems.",
        backend_reference: "exec_n8n_01",
      },
    });
    expect((stored?.executionOutcomeJson as any).callback_result.ignored_raw_detail).toBeUndefined();

    const callbackEvent = activityStore.all.find(
      (event) => event.resultKind === "external_workflow_callback_succeeded",
    );
    expect(callbackEvent).toBeTruthy();
    expect(callbackEvent?.workItemId).toBe("wi_n8n_callback_01");

    await app.close();
  });

  it("rejects n8n callbacks with bad auth", async () => {
    await seedReviewedExternalWorkflowCallbackTarget();

    const app = await createApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/n8n/ws_1/conn_n8n_callback_01/callback",
      headers: n8nWebhookHeaders("wrong-token"),
      payload: {
        delivery_id: "n8n_cb_bad_auth",
        workflow_identifier: "crm-follow-up-sync",
        status: "succeeded",
        clawback: {
          review_id: "rev_n8n_callback_01",
          work_item_id: "wi_n8n_callback_01",
        },
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("unauthorized");

    const stored = await workItemStore.findById("ws_1", "wi_n8n_callback_01");
    expect((stored?.executionOutcomeJson as any).callback_result).toBeNull();
    expect(
      activityStore.all.some((event) => event.resultKind.startsWith("external_workflow_callback_")),
    ).toBe(false);

    await app.close();
  });

  it("treats duplicate n8n callback delivery as idempotent", async () => {
    await seedReviewedExternalWorkflowCallbackTarget();

    const app = await createApp();
    const payload = {
      delivery_id: "n8n_cb_dupe_01",
      workflow_identifier: "crm-follow-up-sync",
      status: "failed",
      summary: "downstream rejected the CRM mutation",
      response_status_code: 500,
      clawback: {
        review_id: "rev_n8n_callback_01",
        work_item_id: "wi_n8n_callback_01",
      },
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/webhooks/n8n/ws_1/conn_n8n_callback_01/callback",
      headers: n8nWebhookHeaders(),
      payload,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/api/webhooks/n8n/ws_1/conn_n8n_callback_01/callback",
      headers: n8nWebhookHeaders(),
      payload,
    });

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({
      deduplicated: true,
      work_item_id: "wi_n8n_callback_01",
      callback_result: {
        delivery_id: "n8n_cb_dupe_01",
        status: "failed",
      },
    });

    const callbackEvents = activityStore.all.filter(
      (event) => event.resultKind === "external_workflow_callback_failed",
    );
    expect(callbackEvents).toHaveLength(1);

    const stored = await workItemStore.findById("ws_1", "wi_n8n_callback_01");
    expect(stored?.status).toBe("failed");
    expect(stored?.executionStatus).toBe("failed");
    expect(stored?.executionError).toBe("downstream rejected the CRM mutation");

    await app.close();
  });

  it("rejects malformed n8n callback payloads before durability", async () => {
    await seedReviewedExternalWorkflowCallbackTarget();

    const app = await createApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/n8n/ws_1/conn_n8n_callback_01/callback",
      headers: n8nWebhookHeaders(),
      payload: {
        workflow_identifier: "crm-follow-up-sync",
        status: "succeeded",
        clawback: {
          review_id: "rev_n8n_callback_01",
          work_item_id: "wi_n8n_callback_01",
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("n8n_webhook_payload_invalid");

    const stored = await workItemStore.findById("ws_1", "wi_n8n_callback_01");
    expect((stored?.executionOutcomeJson as any).callback_result).toBeNull();

    await app.close();
  });

  it("rejects unlinked n8n callbacks instead of broad inbound ingestion", async () => {
    await seedReviewedExternalWorkflowCallbackTarget();

    const app = await createApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/webhooks/n8n/ws_1/conn_n8n_callback_01/callback",
      headers: n8nWebhookHeaders(),
      payload: {
        delivery_id: "n8n_cb_unlinked_01",
        workflow_identifier: "wrong-workflow",
        status: "succeeded",
        clawback: {
          review_id: "rev_n8n_callback_01",
          work_item_id: "wi_n8n_callback_01",
        },
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().code).toBe("n8n_webhook_unlinked");

    const stored = await workItemStore.findById("ws_1", "wi_n8n_callback_01");
    expect((stored?.executionOutcomeJson as any).callback_result).toBeNull();
    expect(
      activityStore.all.some((event) => event.resultKind.startsWith("external_workflow_callback_")),
    ).toBe(false);

    await app.close();
  });

  // -----------------------------------------------------------------------
  // POST /api/workspace/reviews/:id/resolve — T14 integration tests
  // -----------------------------------------------------------------------

  it("approve: resolves review, updates work item to sent, resolves inbox item, creates activity event", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    // Verify initial state
    const reviewBefore = await app.inject({
      method: "GET",
      url: "/api/workspace/reviews/rev_01",
      headers: { cookie: cookie.toString() },
    });
    expect(reviewBefore.json().status).toBe("pending");

    // Resolve with approved
    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(200);
    const review = res.json();
    expect(review.status).toBe("completed");
    expect(review.resolved_at).toBeTruthy();

    // Verify work item is now "sent"
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().status).toBe("sent");
    expect(workRes.json().execution_status).toBe("completed");

    // Verify inbox item is now "resolved"
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const reviewInboxItem = inboxRes.json().items.find((i: any) => i.id === "inb_review_01");
    expect(reviewInboxItem.state).toBe("resolved");

    // Verify activity event was created
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const events = activityRes.json().events;
    const approvedEvent = events.find((e: any) => e.result_kind === "review_approved");
    const sentEvent = events.find((e: any) => e.result_kind === "work_item_sent");
    expect(approvedEvent).toBeTruthy();
    expect(approvedEvent.review_id).toBe("rev_01");
    expect(approvedEvent.work_item_id).toBe("wi_draft_01");
    expect(sentEvent).toBeTruthy();
    expect(sentEvent.work_item_id).toBe("wi_draft_01");

    await app.close();
  });

  it("deny: resolves review as denied, keeps work item as draft, resolves inbox item, creates activity event", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "denied", rationale: "Not ready to send" },
    });

    expect(res.statusCode).toBe(200);
    const review = res.json();
    expect(review.status).toBe("denied");
    expect(review.resolved_at).toBeTruthy();

    // Verify work item status is unchanged (still pending_review)
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().status).toBe("pending_review");

    // Verify inbox item is resolved
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const reviewInboxItem = inboxRes.json().items.find((i: any) => i.id === "inb_review_01");
    expect(reviewInboxItem.state).toBe("resolved");

    // Verify activity event with denied kind
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const deniedEvent = activityRes.json().events.find((e: any) => e.result_kind === "review_denied");
    expect(deniedEvent).toBeTruthy();
    expect(deniedEvent.summary).toBe("Not ready to send");

    await app.close();
  });

  it("idempotency: double-approve returns same result without duplicating side effects", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    // First approval
    const res1 = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().status).toBe("completed");

    // Second approval (idempotent)
    const res2 = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json().status).toBe("completed");

    // Verify only one activity event for review_approved (no duplicate)
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const approvedEvents = activityRes.json().events.filter(
      (e: any) => e.result_kind === "review_approved",
    );
    const sentEvents = activityRes.json().events.filter(
      (e: any) => e.result_kind === "work_item_sent",
    );
    expect(approvedEvents).toHaveLength(1);
    expect(sentEvents).toHaveLength(1);

    await app.close();
  });

  it("confirm-route: creates one downstream work/inbox chain and resolves the origin suggestion", async () => {
    await inboxItemStore.create({
      id: "inb_route_01",
      workspaceId: "ws_1",
      kind: "review",
      title: "Route suggested: Proposal request from Globex",
      summary: "Client Follow-Up suggests routing this proposal request to Proposal.",
      assigneeIds: ["usr_admin"],
      workerId: "wkr_followup_01",
      workItemId: null,
      reviewId: null,
      routeKind: "watched_inbox",
      state: "open",
      triageJson: {
        intent: "proposal",
        confidence: "high",
        posture: "acknowledge",
        relationship: "prospect",
        source_kind: "inbound_email",
        decision: "route_to_worker",
        reasons: ["resolved_via_exact_contact", "proposal_worker_recommended"],
        route_target_worker_id: "wkr_proposal_01",
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const first = await app.inject({
      method: "POST",
      url: "/api/workspace/inbox/inb_route_01/confirm-route",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });

    expect(first.statusCode).toBe(200);
    expect(first.json().already_confirmed).toBe(false);
    expect(first.json().destination_work_item.worker_id).toBe("wkr_proposal_01");
    expect(first.json().destination_work_item.kind).toBe("proposal_draft");
    expect(first.json().destination_work_item.source_inbox_item_id).toBe("inb_route_01");
    expect(first.json().destination_inbox_item.work_item_id).toBe(first.json().destination_work_item.id);

    const second = await app.inject({
      method: "POST",
      url: "/api/workspace/inbox/inb_route_01/confirm-route",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });

    expect(second.statusCode).toBe(200);
    expect(second.json().already_confirmed).toBe(true);
    expect(second.json().destination_work_item.id).toBe(first.json().destination_work_item.id);

    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const originInboxItem = inboxRes.json().items.find((item: any) => item.id === "inb_route_01");
    expect(originInboxItem.state).toBe("resolved");
    expect(originInboxItem.work_item_id).toBe(first.json().destination_work_item.id);

    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const routeEvents = activityRes.json().events.filter(
      (event: any) => event.result_kind === "route_handoff_confirmed",
    );
    expect(routeEvents).toHaveLength(1);
    expect(routeEvents[0]!.work_item_id).toBe(first.json().destination_work_item.id);

    await app.close();
  });

  it("confirm-route: leaves unsafe suggestions reviewable without creating downstream work", async () => {
    await services.workerService.update("ws_1", "wkr_proposal_01", { status: "paused" });
    await inboxItemStore.create({
      id: "inb_route_unsafe_01",
      workspaceId: "ws_1",
      kind: "review",
      title: "Route suggested: Proposal request from Globex",
      summary: "Client Follow-Up suggests routing this proposal request to Proposal.",
      assigneeIds: ["usr_admin"],
      workerId: "wkr_followup_01",
      workItemId: null,
      reviewId: null,
      routeKind: "watched_inbox",
      state: "open",
      triageJson: {
        intent: "proposal",
        confidence: "high",
        posture: "acknowledge",
        relationship: "prospect",
        source_kind: "inbound_email",
        decision: "route_to_worker",
        reasons: ["resolved_via_exact_contact", "proposal_worker_recommended"],
        route_target_worker_id: "wkr_proposal_01",
      },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/inbox/inb_route_unsafe_01/confirm-route",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe("route_confirmation_target_unavailable");

    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const originInboxItem = inboxRes.json().items.find((item: any) => item.id === "inb_route_unsafe_01");
    expect(originInboxItem.state).toBe("open");
    expect(originInboxItem.work_item_id).toBeNull();

    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().work_items.filter((item: any) => item.source_inbox_item_id === "inb_route_unsafe_01")).toHaveLength(0);

    await app.close();
  });

  it("rejects unauthenticated resolve attempts", async () => {
    const app = await createApp();

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("requires CSRF for resolve endpoint", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: { cookie: cookie.toString() },
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 404 for review in wrong workspace", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    // Create a review in a different workspace
    await reviewStore.create({
      id: "rev_other_ws",
      workspaceId: "ws_other",
      actionKind: "send_email",
      status: "pending",
      workerId: "wkr_followup_01",
      workItemId: null,
      reviewerIds: [],
      assigneeIds: [],
      sourceRouteKind: null,
      actionDestination: null,
      requestedAt: NOW,
      resolvedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_other_ws/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("returns 400 for invalid decision value", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "maybe" },
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 404 for nonexistent review", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_nonexistent/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("repairs side effects for an already-resolved review", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    await reviewStore.update("rev_01", {
      status: "approved",
      resolvedAt: NOW,
      updatedAt: NOW,
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("completed");

    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().status).toBe("sent");

    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const reviewInboxItem = inboxRes.json().items.find((i: any) => i.id === "inb_review_01");
    expect(reviewInboxItem.state).toBe("resolved");

    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const approvedEvents = activityRes.json().events.filter(
      (e: any) => e.result_kind === "review_approved",
    );
    const sentEvents = activityRes.json().events.filter(
      (e: any) => e.result_kind === "work_item_sent",
    );
    expect(approvedEvents).toHaveLength(1);
    expect(sentEvents).toHaveLength(1);

    await app.close();
  });

  // -----------------------------------------------------------------------
  // GET /api/workspace/worker-packs
  // -----------------------------------------------------------------------

  it("returns available worker packs with aligned discovery metadata", async () => {
    services.workerPacks = [followUpWorkerPack, proposalWorkerPack];
    services.workerPackInstallService = new WorkerPackInstallService({
      workerService: services.workerService as any,
      inputRouteStore: inputRouteStore,
      actionCapabilityStore: actionCapabilityStore,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "GET",
      url: "/api/workspace/worker-packs",
      headers: { cookie: cookie.toString() },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.packs).toHaveLength(2);
    expect(body.packs[0]).toMatchObject({
      id: "follow_up_v1",
      name: "Client Follow-Up",
      kind: "follow_up",
      default_scope: "shared",
      stability: "pilot",
      category: "email",
      priority: 10,
    });
    expect(body.packs[0].supported_input_routes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "forward_email",
          capability_note: "Parses forwarded threads and extracts action items.",
        }),
        expect.objectContaining({
          kind: "watched_inbox",
          capability_note: "Read-only monitoring via Gmail connection.",
        }),
      ]),
    );
    expect(body.packs[0].action_capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "send_email",
          default_boundary_mode: "ask_me",
        }),
      ]),
    );
    expect(body.packs[1]).toMatchObject({
      id: "proposal_v1",
      stability: "pilot",
      category: "project",
      priority: 10,
    });

    await app.close();
  });

  it("returns registry worker-pack entries that stay consistent with the worker-packs list", async () => {
    services.workerPacks = [followUpWorkerPack, proposalWorkerPack];
    services.workerPackInstallService = new WorkerPackInstallService({
      workerService: services.workerService as any,
      inputRouteStore: inputRouteStore,
      actionCapabilityStore: actionCapabilityStore,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const registryRes = await app.inject({
      method: "GET",
      url: "/api/workspace/registry",
      headers: { cookie: cookie.toString() },
    });

    expect(registryRes.statusCode).toBe(200);
    const registryBody = registryRes.json();
    expect(registryBody.connection_providers.length).toBeGreaterThan(0);
    expect(registryBody.ingress_adapters.length).toBeGreaterThan(0);
    expect(registryBody.action_executors.length).toBeGreaterThan(0);
    expect(registryBody.worker_packs.length).toBeGreaterThan(0);

    const followUpEntry = registryBody.worker_packs.find(
      (pack: any) => pack.worker_pack_id === "follow_up_v1",
    );
    expect(followUpEntry).toMatchObject({
      display_name: "Client Follow-Up",
      worker_kind: "follow_up",
      stability: "pilot",
      category: "email",
      priority: 10,
    });
    expect(followUpEntry.supported_input_route_kinds).toEqual(
      expect.arrayContaining(["chat", "forward_email", "watched_inbox"]),
    );
    expect(followUpEntry.action_kinds).toEqual(
      expect.arrayContaining(["send_email", "save_work"]),
    );
    expect(followUpEntry.setup_steps.length).toBeGreaterThan(0);

    const packsRes = await app.inject({
      method: "GET",
      url: "/api/workspace/worker-packs",
      headers: { cookie: cookie.toString() },
    });
    expect(packsRes.statusCode).toBe(200);

    const registryPackIds = registryBody.worker_packs.map((pack: any) => pack.worker_pack_id);
    const listedPackIds = packsRes.json().packs.map((pack: any) => pack.id);
    for (const packId of listedPackIds) {
      expect(registryPackIds).toContain(packId);
    }

    await app.close();
  });

  // -----------------------------------------------------------------------
  // POST /api/workspace/workers/install
  // -----------------------------------------------------------------------

  it("installs a worker from a pack", async () => {
    services.workerPacks = [followUpWorkerPack, proposalWorkerPack];
    services.workerPackInstallService = new WorkerPackInstallService({
      workerService: services.workerService as any,
      inputRouteStore: inputRouteStore,
      actionCapabilityStore: actionCapabilityStore,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/workers/install",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { pack_id: "follow_up_v1" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.worker_id).toBeDefined();
    expect(body.input_route_ids).toHaveLength(3); // chat, forward_email, watched_inbox
    expect(body.action_capability_ids).toHaveLength(2); // send_email, save_work

    // Verify worker was actually created
    const workerRes = await app.inject({
      method: "GET",
      url: `/api/workspace/workers/${body.worker_id}`,
      headers: { cookie: cookie.toString() },
    });
    expect(workerRes.statusCode).toBe(200);
    expect(workerRes.json().name).toBe("Client Follow-Up");
    expect(workerRes.json().status).toBe("active");

    // Verify input routes were created
    const routesRes = await app.inject({
      method: "GET",
      url: `/api/workspace/input-routes?worker_id=${body.worker_id}`,
      headers: { cookie: cookie.toString() },
    });
    expect(routesRes.statusCode).toBe(200);
    expect(routesRes.json().input_routes).toHaveLength(3);

    // Verify action capabilities were created
    const actionsRes = await app.inject({
      method: "GET",
      url: `/api/workspace/action-capabilities?worker_id=${body.worker_id}`,
      headers: { cookie: cookie.toString() },
    });
    expect(actionsRes.statusCode).toBe(200);
    expect(actionsRes.json().action_capabilities).toHaveLength(2);

    await app.close();
  });

  it("installs a worker with a custom name", async () => {
    services.workerPacks = [followUpWorkerPack, proposalWorkerPack];
    services.workerPackInstallService = new WorkerPackInstallService({
      workerService: services.workerService as any,
      inputRouteStore: inputRouteStore,
      actionCapabilityStore: actionCapabilityStore,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/workers/install",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { pack_id: "follow_up_v1", name: "My Custom Follow-Up" },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();

    const workerRes = await app.inject({
      method: "GET",
      url: `/api/workspace/workers/${body.worker_id}`,
      headers: { cookie: cookie.toString() },
    });
    expect(workerRes.json().name).toBe("My Custom Follow-Up");

    await app.close();
  });

  it("returns 404 for invalid pack_id", async () => {
    services.workerPacks = [followUpWorkerPack, proposalWorkerPack];
    services.workerPackInstallService = new WorkerPackInstallService({
      workerService: services.workerService as any,
      inputRouteStore: inputRouteStore,
      actionCapabilityStore: actionCapabilityStore,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/workers/install",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { pack_id: "nonexistent_v99" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("pack_not_found");

    await app.close();
  });

  it("returns 400 when pack_id is missing", async () => {
    services.workerPacks = [followUpWorkerPack, proposalWorkerPack];
    services.workerPackInstallService = new WorkerPackInstallService({
      workerService: services.workerService as any,
      inputRouteStore: inputRouteStore,
      actionCapabilityStore: actionCapabilityStore,
    });

    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/workers/install",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("missing_pack_id");

    await app.close();
  });

  // -----------------------------------------------------------------------
  // PATCH /api/workspace/workers/:id
  // -----------------------------------------------------------------------

  it("updates worker name via PATCH", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { name: "Renamed Worker" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe("Renamed Worker");

    // Verify the change persisted
    const getRes = await app.inject({
      method: "GET",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: { cookie: cookie.toString() },
    });
    expect(getRes.json().name).toBe("Renamed Worker");

    await app.close();
  });

  it("updates worker status via PATCH", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { status: "paused" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("paused");

    await app.close();
  });

  it("updates worker member_ids via PATCH", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        member_ids: ["usr_admin", "usr_other"],
        assignee_ids: ["usr_other"],
        reviewer_ids: ["usr_admin"],
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().member_ids).toEqual(["usr_admin", "usr_other"]);
    expect(res.json().assignee_ids).toEqual(["usr_other"]);
    expect(res.json().reviewer_ids).toEqual(["usr_admin"]);

    await app.close();
  });

  it("returns 400 for unknown workspace people in PATCH", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        member_ids: ["usr_admin", "usr_missing"],
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("invalid_person_ids");

    await app.close();
  });

  it("returns 400 for invalid status in PATCH", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { status: "invalid_status" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe("invalid_status");

    await app.close();
  });

  it("requires admin for PATCH /api/workspace/workers/:id", async () => {
    const nonAdminAuth = new FakeAuthService();

    const app = await createControlPlaneApp({
      authService: nonAdminAuth,
      workspaceReadModelServices: services,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapRes = await app.inject({
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
    const cookieHeader = serializeCookies(bootstrapRes.headers["set-cookie"] as string[]);
    const csrfToken = bootstrapRes.json().csrf_token as string;

    // Downgrade session to non-admin AFTER bootstrap (so the cookie resolves to a user session)
    for (const [token, ctx] of nonAdminAuth.sessions) {
      nonAdminAuth.sessions.set(token, {
        ...ctx,
        membership: { ...ctx.membership, role: "user" },
      });
    }

    const res = await app.inject({
      method: "PATCH",
      url: "/api/workspace/workers/wkr_followup_01",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
      },
      payload: { name: "Should Fail" },
    });

    expect(res.statusCode).toBe(403);

    await app.close();
  });

  it("requires admin for POST /api/workspace/workers/install", async () => {
    services.workerPacks = [followUpWorkerPack, proposalWorkerPack];
    services.workerPackInstallService = new WorkerPackInstallService({
      workerService: services.workerService as any,
      inputRouteStore: inputRouteStore,
      actionCapabilityStore: actionCapabilityStore,
    });

    const nonAdminAuth = new FakeAuthService();

    const app = await createControlPlaneApp({
      authService: nonAdminAuth,
      workspaceReadModelServices: services,
      cookieSecret: "test-cookie-secret-that-is-long-enough",
      consoleOrigin: "http://localhost:3000",
    });

    const bootstrapRes = await app.inject({
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
    const cookieHeader = serializeCookies(bootstrapRes.headers["set-cookie"] as string[]);
    const csrfToken = bootstrapRes.json().csrf_token as string;

    // Downgrade session to non-admin AFTER bootstrap
    for (const [token, ctx] of nonAdminAuth.sessions) {
      nonAdminAuth.sessions.set(token, {
        ...ctx,
        membership: { ...ctx.membership, role: "user" },
      });
    }

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/workers/install",
      headers: {
        cookie: cookieHeader,
        "x-csrf-token": csrfToken,
      },
      payload: { pack_id: "follow_up_v1" },
    });

    expect(res.statusCode).toBe(403);

    await app.close();
  });

  it("creates, lists, and updates contacts and accounts through the extracted routes", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const createAccountRes = await app.inject({
      method: "POST",
      url: "/api/workspace/accounts",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        name: "Acme Corp",
        primary_domain: "acme.example",
        relationship_class: "customer",
        handling_note: "Priority account",
      },
    });
    expect(createAccountRes.statusCode).toBe(201);
    const createdAccount = createAccountRes.json();
    expect(createdAccount.name).toBe("Acme Corp");
    expect(createdAccount.primary_domain).toBe("acme.example");

    const createContactRes = await app.inject({
      method: "POST",
      url: "/api/workspace/contacts",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        primary_email: "owner@acme.example",
        display_name: "Acme Owner",
        account_id: createdAccount.id,
        relationship_class: "customer",
        do_not_auto_reply: true,
      },
    });
    expect(createContactRes.statusCode).toBe(201);
    const createdContact = createContactRes.json();
    expect(createdContact.primary_email).toBe("owner@acme.example");
    expect(createdContact.account_id).toBe(createdAccount.id);
    expect(createdContact.do_not_auto_reply).toBe(true);

    const listContactsRes = await app.inject({
      method: "GET",
      url: "/api/workspace/contacts",
      headers: { cookie: cookie.toString() },
    });
    expect(listContactsRes.statusCode).toBe(200);
    expect(listContactsRes.json().contacts).toHaveLength(1);

    const updateContactRes = await app.inject({
      method: "PATCH",
      url: `/api/workspace/contacts/${createdContact.id}`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        display_name: "Acme Ops",
        do_not_auto_reply: false,
      },
    });
    expect(updateContactRes.statusCode).toBe(200);
    expect(updateContactRes.json().display_name).toBe("Acme Ops");
    expect(updateContactRes.json().do_not_auto_reply).toBe(false);

    const updateAccountRes = await app.inject({
      method: "PATCH",
      url: `/api/workspace/accounts/${createdAccount.id}`,
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        handling_note: "Escalate to success team",
      },
    });
    expect(updateAccountRes.statusCode).toBe(200);
    expect(updateAccountRes.json().handling_note).toBe("Escalate to success team");

    const listAccountsRes = await app.inject({
      method: "GET",
      url: "/api/workspace/accounts",
      headers: { cookie: cookie.toString() },
    });
    expect(listAccountsRes.statusCode).toBe(200);
    expect(listAccountsRes.json().accounts).toHaveLength(1);

    await app.close();
  });

  it("maps contact and account not-found errors to 404 responses", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const updateContactRes = await app.inject({
      method: "PATCH",
      url: "/api/workspace/contacts/cot_missing",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        display_name: "Ghost Contact",
      },
    });
    expect(updateContactRes.statusCode).toBe(404);
    expect(updateContactRes.json()).toMatchObject({
      code: "contact_not_found",
    });

    const updateAccountRes = await app.inject({
      method: "PATCH",
      url: "/api/workspace/accounts/acc_missing",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: {
        name: "Ghost Account",
      },
    });
    expect(updateAccountRes.statusCode).toBe(404);
    expect(updateAccountRes.json()).toMatchObject({
      code: "account_not_found",
    });

    await app.close();
  });

  // ---------------------------------------------------------------------------
  // A6: Lane A — state machine consistency tests
  // ---------------------------------------------------------------------------

  it("failure-after-approval: work item shows failed, not sent, when SMTP send fails", async () => {
    // Override the email sender to fail
    services.reviewedEmailSender = createFakeReviewedEmailSender({
      failWith: new Error("SMTP connection timeout"),
    });
    const app = await createApp();
    const cookie = await authenticate(app);

    // Approve the review (SMTP will fail)
    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });

    // Review should stay as approved (not completed, since send failed)
    expect(res.statusCode).toBe(200);
    const review = res.json();
    expect(review.status).toBe("approved");

    // Work item must show failed, NOT sent
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().status).toBe("failed");
    expect(workRes.json().execution_status).toBe("failed");
    expect(workRes.json().execution_error).toBe("SMTP connection timeout");

    // Inbox item should NOT be resolved (execution didn't complete)
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const reviewInboxItem = inboxRes.json().items.find((i: any) => i.id === "inb_review_01");
    expect(reviewInboxItem.state).toBe("open");

    // Activity should include a send_failed event
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const failedEvent = activityRes.json().events.find((e: any) => e.result_kind === "send_failed");
    expect(failedEvent).toBeTruthy();
    expect(failedEvent.summary).toBe("SMTP connection timeout");

    await app.close();
  });

  it("duplicate-resolution: second decision on already-resolved review is rejected as idempotent", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    // First: approve the review
    const res1 = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "approved" },
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.json().status).toBe("completed");

    // Second: try to deny the same review — should return the existing result
    const res2 = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "denied" },
    });
    expect(res2.statusCode).toBe(200);
    // Should still be completed (the original approved outcome), not denied
    expect(res2.json().status).toBe("completed");

    // Work item should still be sent (not reverted)
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().status).toBe("sent");
    expect(workRes.json().execution_status).toBe("completed");

    // Only one review_approved activity event (no duplicate or denial)
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const approvedEvents = activityRes.json().events.filter(
      (e: any) => e.result_kind === "review_approved",
    );
    const deniedEvents = activityRes.json().events.filter(
      (e: any) => e.result_kind === "review_denied",
    );
    expect(approvedEvents).toHaveLength(1);
    expect(deniedEvents).toHaveLength(0);

    await app.close();
  });

  it("denial-path: denied review keeps work item in pending_review with no execution", async () => {
    const app = await createApp();
    const cookie = await authenticate(app);

    const res = await app.inject({
      method: "POST",
      url: "/api/workspace/reviews/rev_01/resolve",
      headers: {
        cookie: cookie.toString(),
        "x-csrf-token": cookie.csrfToken,
      },
      payload: { decision: "denied", rationale: "Not appropriate" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().status).toBe("denied");

    // Work item should stay pending_review with no execution attempted
    const workRes = await app.inject({
      method: "GET",
      url: "/api/workspace/work/wi_draft_01",
      headers: { cookie: cookie.toString() },
    });
    expect(workRes.json().status).toBe("pending_review");
    expect(workRes.json().execution_status).toBe("not_requested");
    expect(workRes.json().execution_error).toBeNull();

    // Inbox item should be resolved (denial is a terminal decision)
    const inboxRes = await app.inject({
      method: "GET",
      url: "/api/workspace/inbox",
      headers: { cookie: cookie.toString() },
    });
    const reviewInboxItem = inboxRes.json().items.find((i: any) => i.id === "inb_review_01");
    expect(reviewInboxItem.state).toBe("resolved");

    // Activity should have a review_denied event, no send events
    const activityRes = await app.inject({
      method: "GET",
      url: "/api/workspace/activity",
      headers: { cookie: cookie.toString() },
    });
    const deniedEvent = activityRes.json().events.find((e: any) => e.result_kind === "review_denied");
    const sentEvent = activityRes.json().events.find((e: any) => e.result_kind === "work_item_sent");
    expect(deniedEvent).toBeTruthy();
    expect(deniedEvent.summary).toBe("Not appropriate");
    expect(sentEvent).toBeUndefined();

    await app.close();
  });
});
