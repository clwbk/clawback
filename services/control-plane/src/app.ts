import path from "node:path";
import { PassThrough } from "node:stream";
import { fileURLToPath } from "node:url";

import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyCsrfProtection from "@fastify/csrf-protection";
import fastifyHelmet from "@fastify/helmet";
import fastifyRateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { ZodError } from "zod";

import {
  actionPathParamsSchema,
  getActionResponseSchema,
  getArtifactResponseSchema,
  listActionsResponseSchema,
  agentListResponseSchema,
  artifactListResponseSchema,
  artifactPathParamsSchema,
  runtimeControlStatusResponseSchema,
  runtimeRestartResponseSchema,
  approvalPathParamsSchema,
  agentPathParamsSchema,
  connectorListResponseSchema,
  connectorPathParamsSchema,
  connectorSyncJobListResponseSchema,
  createAgentRequestSchema,
  createAgentResponseSchema,
  createConnectorRequestSchema,
  createConnectorResponseSchema,
  authenticatedSessionResponseSchema,
  bootstrapAdminRequestSchema,
  claimInvitationRequestSchema,
  conversationDetailResponseSchema,
  conversationListQuerySchema,
  conversationListResponseSchema,
  conversationPathParamsSchema,
  createConversationRequestSchema,
  createConversationResponseSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  createRunRequestSchema,
  createRunResponseSchema,
  getApprovalResponseSchema,
  getConnectorResponseSchema,
  getAgentDraftResponseSchema,
  getAgentResponseSchema,
  getRunResponseSchema,
  getTicketResponseSchema,
  listApprovalsResponseSchema,
  loginRequestSchema,
  n8nConnectionConfigSchema,
  publishAgentRequestSchema,
  publishAgentResponseSchema,
  runtimeCreateTicketRequestSchema,
  runtimeCreateTicketResponseSchema,
  runtimeDraftTicketRequestSchema,
  runtimeDraftTicketResponseSchema,
  runtimeTicketLookupRequestSchema,
  runtimeTicketLookupResponseSchema,
  resolveApprovalRequestSchema,
  runPathParamsSchema,
  runEventListResponseSchema,
  runStatusSchema,
  requestConnectorSyncResponseSchema,
  reviewSurfaceResolveRequestSchema,
  reviewSurfaceResolveResponseSchema,
  sseEnvelopeSchema,
  setupStatusResponseSchema,
  ticketListResponseSchema,
  ticketPathParamsSchema,
  updateConnectorRequestSchema,
  updateAgentDraftRequestSchema,
  updateAgentRequestSchema,
} from "@clawback/contracts";
import {
  ActionService,
  type ActionServiceContract,
} from "./actions/index.js";
import {
  ArtifactService,
  type ArtifactServiceContract,
} from "./artifacts/index.js";
import {
  AuthService,
  AuthServiceError,
  DrizzleAuthStore,
  SESSION_COOKIE_NAME,
  type AuthServiceContract,
  type SessionContext,
} from "@clawback/auth";
import { createDb, createPool } from "@clawback/db";
import { OpenClawRunEngine } from "@clawback/model-adapters";

import { AgentService, DrizzleAgentStore, type AgentServiceContract } from "./agents/index.js";
import {
  ConversationRunService,
  DrizzleOrchestrationStore,
  PgBossRunQueue,
  createPgBossQueue,
  type ConversationRunServiceContract,
} from "./orchestration/index.js";
import {
  ConnectorService,
  DrizzleConnectorStore,
  type ConnectorServiceContract,
} from "./connectors/index.js";
import {
  ApprovalService,
  DrizzleApprovalStore,
  type ApprovalServiceContract,
} from "./approvals/index.js";
import {
  LocalOperatorActionsService,
  OperatorActionsServiceError,
  type OperatorActionsServiceContract,
} from "./operator-actions/index.js";
import {
  DrizzleTicketStore,
  TicketService,
  type TicketServiceContract,
} from "./tickets/index.js";
import {
  DrizzleRuntimeToolStore,
  RuntimeToolService,
  type RuntimeToolServiceContract,
} from "./runtime-tools/index.js";
import {
  InboundEmailService,
  InboundEmailRoutingError,
  InboundEmailWorkerNotFoundError,
  InboundEmailWorkerRuntimeNotAvailableError,
  DrizzleSourceEventStoreAdapter,
  DrizzleInputRouteLookupAdapter,
  WorkerStoreLookupAdapter,
  type InboundEmailServiceContract,
} from "./integrations/inbound-email/index.js";
import {
  InboundEmailWebhookParseError,
  parsePostmarkInboundEmail,
} from "./integrations/inbound-email/provider-webhooks.js";
import {
  WatchedInboxService,
  WatchedInboxRouteNotFoundError,
  WatchedInboxWorkerNotFoundError,
  WatchedInboxWorkerRuntimeNotAvailableError,
  GmailConnectionNotReadyError,
  GmailPollingService,
} from "./integrations/watched-inbox/index.js";
import {
  GmailWatchHookProcessingError,
  GmailWatchHookService,
} from "./integrations/watched-inbox/gmail-hook.js";
import { WorkerService, DrizzleWorkerStore } from "./workers/index.js";
import { WorkItemService, DrizzleWorkItemStore } from "./work-items/index.js";
import { ContactService, DrizzleContactStore } from "./contacts/index.js";
import { AccountService, DrizzleAccountStore } from "./accounts/index.js";
import { InboxItemService, DrizzleInboxItemStore } from "./inbox/index.js";
import {
  ReviewService,
  ReviewResolutionService,
  ReviewDecisionService,
  N8nWebhookCallbackError,
  N8nWebhookCallbackService,
  N8nWorkflowExecutor,
  DrizzleReviewStore,
  DrizzleReviewDecisionStore,
} from "./reviews/index.js";
import { SmtpRelayEmailSender } from "./reviews/index.js";
import { ActivityService, DrizzleActivityEventStore } from "./activity/index.js";
import {
  ConnectionService as V1ConnectionService,
  ConnectionNotFoundError,
  DrizzleConnectionStore as DrizzleV1ConnectionStore,
  GmailPilotSetupService,
  GoogleGmailCredentialsValidator,
  GoogleServiceAccountValidator,
  DriveSetupService,
  GoogleDriveCredentialsValidator,
  DriveContextService,
} from "./connections/index.js";
import {
  InputRouteService,
  DrizzleInputRouteStore,
} from "./input-routes/index.js";
import {
  ActionCapabilityService,
  DrizzleActionCapabilityStore,
} from "./action-capabilities/index.js";
import {
  WorkspacePeopleService,
  DrizzleWorkspacePeopleStore,
} from "./workspace-people/index.js";
import {
  ApprovalSurfaceIdentityService,
  DrizzleApprovalSurfaceIdentityStore,
  ApprovalSurfaceTokenSigner,
  ApprovalSurfaceTokenError,
  ReviewApprovalSurfaceService,
  ReviewApprovalSurfaceForbiddenError,
  ReviewApprovalSurfaceError,
} from "./approval-surfaces/index.js";
import {
  workspaceRoutesPlugin,
  type WorkspaceReadModelServices,
} from "./workspace-routes.js";
import {
  WorkerPackInstallService,
  firstPartyWorkerPacks,
} from "./worker-packs/index.js";
import { GitHubConnectionService } from "./integrations/github/index.js";
import {
  OpenClawGatewayService,
  OpenClawPairingAdapter,
  OpenClawPairingTransportService,
  WhatsAppSetupService,
  WhatsAppTransportService,
  WhatsAppWebhookHandler,
  findWhatsAppConnectionByPhoneNumberId,
  findWhatsAppConnectionByVerifyToken,
  findWorkspaceWhatsAppConnection,
} from "./integrations/whatsapp/index.js";
import {
  SlackSetupService,
  SlackTransportService,
  SlackWebhookHandler,
  normalizeSlackConfig,
} from "./integrations/slack/index.js";
import {
  resolveOptionalProviderSecret,
  validateProductionSecrets,
} from "./production-secrets.js";

declare module "fastify" {
  interface FastifyRequest {
    authContext: SessionContext | null;
    whatsappRawBody?: Buffer | null;
    slackRawBody?: Buffer | null;
  }
}

type ControlPlaneAppOptions = {
  authService?: AuthServiceContract;
  agentService?: AgentServiceContract;
  connectorService?: ConnectorServiceContract;
  approvalService?: ApprovalServiceContract;
  actionService?: ActionServiceContract;
  artifactService?: ArtifactServiceContract;
  ticketService?: TicketServiceContract;
  runtimeToolService?: RuntimeToolServiceContract;
  conversationRunService?: ConversationRunServiceContract;
  operatorActionsService?: OperatorActionsServiceContract;
  workspaceReadModelServices?: WorkspaceReadModelServices;
  cookieSecret?: string;
  consoleOrigin?: string;
  inboundEmailWebhookToken?: string;
  gmailWatchHookToken?: string;
  approvalSurfaceTokenSecret?: string;
};

const defaultCookieSecret =
  process.env.COOKIE_SECRET ?? "local-dev-cookie-secret-that-is-long-enough-for-signing";
const defaultRuntimeApiToken =
  process.env.CLAWBACK_RUNTIME_API_TOKEN ?? "clawback-local-runtime-api-token";
const defaultInboundEmailWebhookToken =
  resolveOptionalProviderSecret(
    process.env.CLAWBACK_INBOUND_EMAIL_WEBHOOK_TOKEN,
    "clawback-local-inbound-email-token",
  );
const defaultGmailWatchHookToken =
  resolveOptionalProviderSecret(
    process.env.CLAWBACK_GMAIL_WATCH_HOOK_TOKEN,
    "clawback-local-gmail-watch-token",
  );
const defaultApprovalSurfaceTokenSecret =
  process.env.CLAWBACK_APPROVAL_SURFACE_SECRET ?? "clawback-local-approval-surface-secret";
const defaultWhatsAppPhoneNumberId =
  process.env.WHATSAPP_PHONE_NUMBER_ID ?? "";
const defaultWhatsAppAccessToken =
  process.env.WHATSAPP_ACCESS_TOKEN ?? "";
const defaultWhatsAppVerifyToken =
  resolveOptionalProviderSecret(
    process.env.WHATSAPP_VERIFY_TOKEN,
    "clawback-local-whatsapp-verify-token",
  );
const defaultWhatsAppAppSecret =
  process.env.WHATSAPP_APP_SECRET ?? "";
const defaultSlackBotToken =
  process.env.SLACK_BOT_TOKEN ?? "";
const defaultSlackSigningSecret =
  process.env.SLACK_SIGNING_SECRET ?? "";

function sessionCookieOptions() {
  return {
    path: "/",
    httpOnly: true,
    signed: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  };
}

function buildAuthenticatedResponse(
  reply: FastifyReply,
  session: Awaited<ReturnType<AuthServiceContract["bootstrapAdmin"]>>["session"],
) {
  const csrfToken = reply.generateCsrf();
  return authenticatedSessionResponseSchema.parse({
    ...session,
    csrf_token: csrfToken,
  });
}

function parseSignedSessionCookie(request: FastifyRequest) {
  const rawCookie = request.cookies[SESSION_COOKIE_NAME];
  if (!rawCookie) {
    return null;
  }

  const unsigned = request.unsignCookie(rawCookie);
  if (!unsigned.valid || !unsigned.value) {
    return null;
  }

  return unsigned.value;
}

function setSessionCookie(reply: FastifyReply, sessionToken: string) {
  reply.setCookie(SESSION_COOKIE_NAME, sessionToken, sessionCookieOptions());
}

function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
}

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
}

function ensureSession(request: FastifyRequest) {
  if (!request.authContext) {
    throw new AuthServiceError({
      code: "unauthorized",
      message: "Authentication is required.",
      statusCode: 401,
    });
  }

  return request.authContext;
}

function ensureAdmin(request: FastifyRequest) {
  const session = ensureSession(request);
  if (session.membership.role !== "admin") {
    throw new AuthServiceError({
      code: "forbidden",
      message: "Admin access is required.",
      statusCode: 403,
    });
  }

  return session;
}

function ensureRuntimeApi(request: FastifyRequest) {
  const header = request.headers.authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const expected = `Bearer ${defaultRuntimeApiToken}`;

  if (!value || value !== expected) {
    throw new AuthServiceError({
      code: "unauthorized",
      message: "Runtime API authorization is required.",
      statusCode: 401,
    });
  }
}

function ensureWebhookToken(
  request: FastifyRequest,
  expectedToken: string,
  params?: {
    headerName?: string;
    alternateHeaderNames?: string[];
  },
) {
  const authorization = request.headers.authorization;
  const bearerToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;
  const query = (request.query ?? {}) as { token?: unknown };
  const headerNames = [
    params?.headerName,
    ...(params?.alternateHeaderNames ?? []),
  ].filter((value): value is string => Boolean(value));
  const headerToken = headerNames
    .map((headerName) => request.headers[headerName.toLowerCase()])
    .find((value): value is string => typeof value === "string" && value.length > 0)
    ?? null;
  const queryToken = typeof query.token === "string" ? query.token : null;
  const providedToken = bearerToken ?? headerToken ?? queryToken;

  if (!providedToken || providedToken !== expectedToken) {
    throw new AuthServiceError({
      code: "unauthorized",
      message: "Webhook token is invalid or missing.",
      statusCode: 401,
    });
  }
}

function mapRunEventToSseEnvelope(params: {
  conversationId: string;
  event: Awaited<ReturnType<ConversationRunServiceContract["listRunEventsAfter"]>>[number];
}) {
  const { conversationId, event } = params;

  switch (event.event_type) {
    case "run.output.delta":
      return sseEnvelopeSchema.parse({
        type: "assistant.delta",
        run_id: event.run_id,
        conversation_id: conversationId,
        sequence: event.sequence,
        data: event.payload,
      });
    case "run.completed":
      return sseEnvelopeSchema.parse({
        type: "assistant.completed",
        run_id: event.run_id,
        conversation_id: conversationId,
        sequence: event.sequence,
        data: event.payload,
      });
    case "run.failed":
      return sseEnvelopeSchema.parse({
        type: "run.failed",
        run_id: event.run_id,
        conversation_id: conversationId,
        sequence: event.sequence,
        data: event.payload,
      });
    case "run.waiting_for_approval":
      return sseEnvelopeSchema.parse({
        type: "run.approval.required",
        run_id: event.run_id,
        conversation_id: conversationId,
        sequence: event.sequence,
        data: event.payload,
      });
    case "run.approval.resolved":
      return sseEnvelopeSchema.parse({
        type: "run.approval.resolved",
        run_id: event.run_id,
        conversation_id: conversationId,
        sequence: event.sequence,
        data: event.payload,
      });
    default:
      return sseEnvelopeSchema.parse({
        type: "run.status",
        run_id: event.run_id,
        conversation_id: conversationId,
        sequence: event.sequence,
        data: {
          event_type: event.event_type,
          ...event.payload,
        },
      });
  }
}

async function writeSseEnvelope(
  raw: FastifyReply["raw"],
  envelope: ReturnType<(typeof sseEnvelopeSchema)["parse"]>,
) {
  if (raw.destroyed || raw.writableEnded) {
    return false;
  }

  const chunk = `data: ${JSON.stringify(envelope)}\n\n`;
  if (raw.write(chunk)) {
    return true;
  }

  await new Promise<void>((resolve) => {
    const cleanup = () => {
      raw.off("drain", onDrain);
      raw.off("close", onClose);
      raw.off("error", onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      resolve();
    };

    raw.on("drain", onDrain);
    raw.on("close", onClose);
    raw.on("error", onError);
  });

  return !raw.destroyed && !raw.writableEnded;
}

export async function createControlPlaneApp(options: ControlPlaneAppOptions = {}) {
  validateProductionSecrets();
  const app = Fastify({
    logger:
      process.env.NODE_ENV === "test"
        ? false
        : {
            level: process.env.NODE_ENV === "production" ? "info" : "debug",
          },
    bodyLimit: 1_048_576, // 1 MB
  });

  const pool = createPool();
  const db = createDb(pool);
  const authService =
    options.authService ??
    new AuthService({
      store: new DrizzleAuthStore(db),
    });

  const runtimeBackend = new OpenClawRunEngine();

  const agentService =
    options.agentService ??
    new AgentService({
      store: new DrizzleAgentStore(db),
      runtimePublisher: runtimeBackend,
    });

  const boss = options.conversationRunService ? null : await createPgBossQueue();
  const sharedQueue = boss ? new PgBossRunQueue(boss) : null;
  const queue = sharedQueue ?? {
    async enqueueRun() {
      throw new Error("Run queue is not available in this app instance.");
    },
    async enqueueConnectorSync() {
      throw new Error("Connector sync queue is not available in this app instance.");
    },
  };
  const connectorService =
    options.connectorService ??
    new ConnectorService({
      store: new DrizzleConnectorStore(db),
      queue,
      localPathBase: getRepoRoot(),
    });
  const approvalService =
    options.approvalService ??
    new ApprovalService({
      store: new DrizzleApprovalStore(db),
    });
  const ticketService =
    options.ticketService ??
    new TicketService({
      store: new DrizzleTicketStore(db),
    });
  const artifactService =
    options.artifactService ??
    new ArtifactService({
      ticketService,
    });
  const actionService =
    options.actionService ??
    new ActionService({
      approvalService,
      ticketService,
    });
  const runtimeToolService =
    options.runtimeToolService ??
    new RuntimeToolService({
      store: new DrizzleRuntimeToolStore(db),
    });
  const conversationRunService =
    options.conversationRunService ??
    new ConversationRunService({
      store: new DrizzleOrchestrationStore(db),
      queue,
    });
  const operatorActionsService = options.operatorActionsService ?? new LocalOperatorActionsService();

  const workerStore = new DrizzleWorkerStore(db as any);
  const reviewedEmailSender = (() => {
    const smtpHost = process.env.CLAWBACK_SMTP_HOST;
    if (!smtpHost) {
      return undefined;
    }

    const smtpFromAddress = process.env.CLAWBACK_SMTP_FROM_ADDRESS;
    const smtpUsername = process.env.CLAWBACK_SMTP_USERNAME;
    const smtpPassword = process.env.CLAWBACK_SMTP_PASSWORD;
    const missing: string[] = [];

    if (!smtpFromAddress) {
      missing.push("CLAWBACK_SMTP_FROM_ADDRESS");
    }
    if (smtpUsername && !smtpPassword) {
      missing.push("CLAWBACK_SMTP_PASSWORD (required when CLAWBACK_SMTP_USERNAME is set)");
    }

    if (missing.length > 0) {
      app.log.warn(
        `SMTP relay partially configured — missing: ${missing.join(", ")}. ` +
        "Reviewed email sends will be unavailable until configuration is complete.",
      );
      return undefined;
    }

    app.log.info(
      `SMTP relay configured: host=${smtpHost}, port=${process.env.CLAWBACK_SMTP_PORT ?? "587"}, from=${smtpFromAddress}`,
    );
    return new SmtpRelayEmailSender();
  })();
  const reviewedExternalWorkflowExecutor = new N8nWorkflowExecutor();
  const inputRouteStoreInstance = new DrizzleInputRouteStore(db as any);
  const actionCapabilityStoreInstance = new DrizzleActionCapabilityStore(db as any);
  const workerServiceInstance = new WorkerService({ store: workerStore });
  const connectionServiceInstance = new V1ConnectionService({ store: new DrizzleV1ConnectionStore(db as any) });
  const reviewServiceInstance = new ReviewService({ store: new DrizzleReviewStore(db as any) });
  const reviewDecisionServiceInstance = new ReviewDecisionService({
    store: new DrizzleReviewDecisionStore(db as any),
  });
  const workspacePeopleServiceInstance = new WorkspacePeopleService({
    store: new DrizzleWorkspacePeopleStore(db as any),
  });
  const approvalSurfaceIdentityServiceInstance = new ApprovalSurfaceIdentityService({
    store: new DrizzleApprovalSurfaceIdentityStore(db as any),
  });
  const approvalSurfaceTokenSigner = new ApprovalSurfaceTokenSigner(
    options.approvalSurfaceTokenSecret ?? defaultApprovalSurfaceTokenSecret,
  );
  const openClawGatewayService = new OpenClawGatewayService();
  const workerPackInstallServiceInstance = new WorkerPackInstallService({
    workerService: workerServiceInstance,
    inputRouteStore: inputRouteStoreInstance,
    actionCapabilityStore: actionCapabilityStoreInstance,
  });
  const workspaceReadModelServices: WorkspaceReadModelServices =
    options.workspaceReadModelServices ?? {
      workerService: workerServiceInstance,
      workItemService: new WorkItemService({ store: new DrizzleWorkItemStore(db as any) }),
      inboxItemService: new InboxItemService({ store: new DrizzleInboxItemStore(db as any) }),
      reviewService: reviewServiceInstance,
      reviewDecisionService: reviewDecisionServiceInstance,
      activityService: new ActivityService({ store: new DrizzleActivityEventStore(db as any) }),
      connectionService: connectionServiceInstance,
      inputRouteService: new InputRouteService({ store: inputRouteStoreInstance }),
      actionCapabilityService: new ActionCapabilityService({
        store: actionCapabilityStoreInstance,
      }),
      workspacePeopleService: workspacePeopleServiceInstance,
      approvalSurfaceIdentityService: approvalSurfaceIdentityServiceInstance,
      gmailPilotSetupService: new GmailPilotSetupService({
        connectionService: connectionServiceInstance,
        validator: new GoogleGmailCredentialsValidator(),
        serviceAccountValidator: new GoogleServiceAccountValidator(),
      }),
      driveSetupService: new DriveSetupService({
        connectionService: connectionServiceInstance,
        validator: new GoogleDriveCredentialsValidator(),
      }),
      driveContextService: new DriveContextService({
        connectionService: connectionServiceInstance,
      }),
      githubConnectionService: new GitHubConnectionService({
        connectionService: connectionServiceInstance,
      }),
      whatsappSetupService: new WhatsAppSetupService({
        connectionService: connectionServiceInstance,
        appSecretConfigured: defaultWhatsAppAppSecret.length > 0,
        pairingAdapter: new OpenClawPairingAdapter({
          connectionService: connectionServiceInstance,
          gatewayService: openClawGatewayService,
        }),
      }),
      slackSetupService: new SlackSetupService({
        connectionService: connectionServiceInstance,
      }),
      ...(reviewedEmailSender ? { reviewedEmailSender } : {}),
      reviewedExternalWorkflowExecutor,
      workerPackInstallService: workerPackInstallServiceInstance,
      workerPacks: [...firstPartyWorkerPacks],
      contactService: new ContactService({ store: new DrizzleContactStore(db as any) }),
      accountService: new AccountService({ store: new DrizzleAccountStore(db as any) }),
    };
  const reviewResolutionService = new ReviewResolutionService({
    reviewService: workspaceReadModelServices.reviewService,
    workItemService: workspaceReadModelServices.workItemService,
    inboxItemService: workspaceReadModelServices.inboxItemService,
    activityService: workspaceReadModelServices.activityService,
    workerService: workspaceReadModelServices.workerService,
    ...(workspaceReadModelServices.actionCapabilityService
      ? { actionCapabilityService: workspaceReadModelServices.actionCapabilityService }
      : {}),
    ...(workspaceReadModelServices.connectionService
      ? { connectionService: workspaceReadModelServices.connectionService }
      : {}),
    ...(workspaceReadModelServices.reviewedEmailSender
      ? { reviewedEmailSender: workspaceReadModelServices.reviewedEmailSender }
      : {}),
    ...(workspaceReadModelServices.reviewedExternalWorkflowExecutor
      ? { reviewedExternalWorkflowExecutor: workspaceReadModelServices.reviewedExternalWorkflowExecutor }
      : {}),
    ...(workspaceReadModelServices.reviewDecisionService
      ? { reviewDecisionService: workspaceReadModelServices.reviewDecisionService }
      : {}),
  });
  const reviewApprovalSurfaceService = new ReviewApprovalSurfaceService({
    reviewService: workspaceReadModelServices.reviewService,
    reviewResolutionService,
    ...(workspaceReadModelServices.reviewDecisionService
      ? { reviewDecisionService: workspaceReadModelServices.reviewDecisionService }
      : {}),
    approvalSurfaceIdentityService:
      workspaceReadModelServices.approvalSurfaceIdentityService ?? approvalSurfaceIdentityServiceInstance,
    workspacePeopleService:
      workspaceReadModelServices.workspacePeopleService ?? workspacePeopleServiceInstance,
    tokenSigner: approvalSurfaceTokenSigner,
  });
  const runtimeConnectionService =
    workspaceReadModelServices.connectionService ?? connectionServiceInstance;
  const n8nWebhookCallbackService = new N8nWebhookCallbackService({
    reviewService: workspaceReadModelServices.reviewService,
    workItemService: workspaceReadModelServices.workItemService,
    activityService: workspaceReadModelServices.activityService,
  });

  // Inbound email service
  const sourceEventStoreAdapter = new DrizzleSourceEventStoreAdapter(db as any);
  const workerLookupAdapter = new WorkerStoreLookupAdapter(workerStore);
  const inboundEmailService = new InboundEmailService({
    sourceEventStore: sourceEventStoreAdapter,
    inputRouteLookup: new DrizzleInputRouteLookupAdapter(db as any),
    workerLookup: workerLookupAdapter,
    workItemService: workspaceReadModelServices.workItemService,
    inboxItemService: workspaceReadModelServices.inboxItemService,
    reviewService: workspaceReadModelServices.reviewService,
    activityService: workspaceReadModelServices.activityService,
  });

  // Watched inbox service (T9/T13: shadow mode)
  const inputRouteStore = new DrizzleInputRouteStore(db as any);
  const v1ConnectionStore = new DrizzleV1ConnectionStore(db as any);
  const watchedInboxService = new WatchedInboxService({
    sourceEventStore: sourceEventStoreAdapter,
    watchedInboxRouteLookup: {
      async findWatchedInboxRoute(workspaceId: string, workerId: string) {
        const routes = await inputRouteStore.listByWorkspace(workspaceId);
        return routes.find(
          (r) => r.workerId === workerId && r.kind === "watched_inbox",
        ) ?? null;
      },
    },
    connectionLookup: {
      async findGmailReadOnly(workspaceId: string) {
        const connections = await v1ConnectionStore.listByWorkspace(workspaceId);
        return connections.find(
          (c) => c.provider === "gmail" && c.accessMode === "read_only",
        ) ?? null;
      },
    },
    workerLookup: workerLookupAdapter,
    routeTargetLookup: {
      async listActiveByKind(workspaceId: string, kind: import("@clawback/contracts").WorkerKind) {
        const workers = await workerStore.list(workspaceId);
        return workers
          .filter((worker) => worker.kind === kind && worker.status === "active")
          .map((worker) => ({
            id: worker.id,
            workspaceId: worker.workspaceId,
            slug: worker.slug,
            name: worker.name,
            assigneeIds: worker.assigneeIds,
            reviewerIds: worker.reviewerIds,
          }));
      },
    },
    workItemService: workspaceReadModelServices.workItemService,
    inboxItemService: workspaceReadModelServices.inboxItemService,
    activityService: workspaceReadModelServices.activityService,
  });
  const gmailWatchHookService = new GmailWatchHookService({
    watchedInboxService,
  });
  const gmailPollingService = new GmailPollingService({
    connectionService: connectionServiceInstance,
    inputRouteStore,
    gmailWatchHookService,
    enabled:
      process.env.NODE_ENV !== "test"
      && process.env.CLAWBACK_GMAIL_POLLING_ENABLED !== "false",
    pollIntervalMs: Number(process.env.CLAWBACK_GMAIL_POLL_INTERVAL_MS ?? "60000"),
  });
  const inboundEmailWebhookToken =
    options.inboundEmailWebhookToken ?? defaultInboundEmailWebhookToken;
  const gmailWatchHookToken =
    options.gmailWatchHookToken ?? defaultGmailWatchHookToken;
  const consoleOrigin =
    options.consoleOrigin ?? process.env.CONSOLE_ORIGIN ?? "http://localhost:3000";

  app.addHook("onClose", async () => {
    await gmailPollingService.stop();
    if (boss) {
      await boss.stop();
    }
    await pool.end();
  });

  await app.register(fastifyCors, {
    origin: consoleOrigin,
    credentials: true,
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false, // CSP is managed by Next.js on the console side
  });

  await app.register(fastifyRateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  await app.register(fastifyCookie, {
    secret: options.cookieSecret ?? defaultCookieSecret,
  });

  await app.register(fastifyCsrfProtection, {
    getToken: (request) => {
      const header = request.headers["x-csrf-token"];
      return Array.isArray(header) ? header[0] : header;
    },
    cookieOpts: {
      signed: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      httpOnly: false,
      path: "/",
    },
  });

  app.decorateRequest("authContext", null);

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AuthServiceError) {
      return reply.status(error.statusCode).send({
        error: error.message,
        code: error.code,
      });
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: "Invalid request payload.",
      });
    }

    if (error instanceof OperatorActionsServiceError) {
      return reply.status(error.statusCode).send({
        error: error.message,
      });
    }

    // V1 domain service errors with statusCode
    const err = error as Record<string, unknown>;
    if (typeof err.statusCode === "number" && typeof err.code === "string") {
      return reply.status(err.statusCode as number).send({
        error: err.message ?? "Unknown error",
        code: err.code,
      });
    }

    request.log.error(error);
    return reply.status(500).send({
      error: "Internal server error.",
    });
  });

  app.addHook("onRequest", async (request) => {
    const sessionToken = parseSignedSessionCookie(request);
    request.authContext = sessionToken ? await authService.getSessionFromToken(sessionToken) : null;
  });

  app.get("/healthz", async () => ({
    ok: true,
    service: "control-plane",
  }));

  app.get("/readyz", async (_request, reply) => {
    const checks: Record<string, { ok: boolean; error?: string }> = {};

    // Check Postgres connection
    try {
      await pool.query("SELECT 1");
      checks.postgres = { ok: true };
    } catch (err) {
      checks.postgres = {
        ok: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }

    // Check PgBoss queue
    if (boss) {
      try {
        // PgBoss exposes isStarted or similar; a simple getQueueSize call confirms connectivity
        await boss.getQueues();
        checks.pgboss = { ok: true };
      } catch (err) {
        checks.pgboss = {
          ok: false,
          error: err instanceof Error ? err.message : "Queue check failed",
        };
      }
    } else {
      checks.pgboss = { ok: true }; // Queue not used in this instance (e.g., test)
    }

    const allOk = Object.values(checks).every((c) => c.ok);
    return reply.status(allOk ? 200 : 503).send({
      ok: allOk,
      service: "control-plane",
      checks,
    });
  });

  app.get("/api/setup/status", async (_request, reply) => {
    const payload = await authService.getSetupStatus();
    return reply.send(setupStatusResponseSchema.parse(payload));
  });

  app.post("/api/setup/bootstrap-admin", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = bootstrapAdminRequestSchema.parse(request.body);
    const result = await authService.bootstrapAdmin({
      workspaceName: parsed.workspace_name,
      workspaceSlug: parsed.workspace_slug,
      email: parsed.email,
      displayName: parsed.display_name,
      password: parsed.password,
    });

    setSessionCookie(reply, result.sessionToken);
    return reply.status(201).send(buildAuthenticatedResponse(reply, result.session));
  });

  app.post("/api/auth/login", { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } }, async (request, reply) => {
    const parsed = loginRequestSchema.parse(request.body);
    const result = await authService.login({
      email: parsed.email,
      password: parsed.password,
    });

    setSessionCookie(reply, result.sessionToken);
    return reply.send(buildAuthenticatedResponse(reply, result.session));
  });

  app.get("/api/auth/session", async (request, reply) => {
    const session = ensureSession(request);
    return reply.send(
      buildAuthenticatedResponse(reply, {
        user: {
          id: session.user.id,
          email: session.user.email,
          display_name: session.user.displayName,
        },
        workspace: {
          id: session.workspace.id,
          slug: session.workspace.slug,
          name: session.workspace.name,
        },
        membership: {
          role: session.membership.role,
        },
      }),
    );
  });

  app.post("/api/auth/logout", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const sessionToken = parseSignedSessionCookie(request);
    if (sessionToken) {
      await authService.logout(sessionToken);
    }
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.post("/api/invitations", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const actor = ensureAdmin(request);
    const parsed = createInvitationRequestSchema.parse(request.body);
    const invitationInput = parsed.expires_at
      ? {
          email: parsed.email,
          role: parsed.role,
          expiresAt: new Date(parsed.expires_at),
        }
      : {
          email: parsed.email,
          role: parsed.role,
        };
    const result = await authService.createInvitation(actor, {
      ...invitationInput,
    });

    return reply.status(201).send(
      createInvitationResponseSchema.parse({
        invitation: result.invitation,
        token: result.token,
      }),
    );
  });

  app.post("/api/invitations/claim", async (request, reply) => {
    const parsed = claimInvitationRequestSchema.parse(request.body);
    const result = await authService.claimInvitation({
      token: parsed.token,
      displayName: parsed.display_name,
      password: parsed.password,
    });

    setSessionCookie(reply, result.sessionToken);
    return reply.status(201).send(buildAuthenticatedResponse(reply, result.session));
  });

  app.get("/api/admin/runtime-control", async (request, reply) => {
    ensureAdmin(request);
    const result = await operatorActionsService.getRuntimeControlStatus();
    return reply.send(runtimeControlStatusResponseSchema.parse(result));
  });

  app.get("/api/admin/runtime-control/worker", async (request, reply) => {
    ensureAdmin(request);
    const result = await operatorActionsService.getRuntimeWorkerControlStatus();
    return reply.send(runtimeControlStatusResponseSchema.parse(result));
  });

  app.post(
    "/api/admin/runtime-control/restart",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      ensureAdmin(request);
      const result = await operatorActionsService.restartOpenClaw();
      return reply.send(runtimeRestartResponseSchema.parse(result));
    },
  );

  app.post(
    "/api/admin/runtime-control/worker/restart",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      ensureAdmin(request);
      const result = await operatorActionsService.restartRuntimeWorker();
      return reply.send(runtimeRestartResponseSchema.parse(result));
    },
  );

  app.get("/api/approvals", async (request, reply) => {
    const actor = ensureSession(request);
    const result = await approvalService.listApprovals(actor);
    return reply.send(listApprovalsResponseSchema.parse(result));
  });

  app.get("/api/actions", async (request, reply) => {
    const actor = ensureSession(request);
    const result = await actionService.listActions(actor);
    return reply.send(listActionsResponseSchema.parse(result));
  });

  app.get("/api/actions/:actionId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = actionPathParamsSchema.parse(request.params);
    const result = await actionService.getAction(actor, params.actionId);
    return reply.send(getActionResponseSchema.parse(result));
  });

  app.get("/api/approvals/:approvalId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = approvalPathParamsSchema.parse(request.params);
    const result = await approvalService.getApproval(actor, params.approvalId);
    return reply.send(getApprovalResponseSchema.parse(result));
  });

  app.post(
    "/api/approvals/:approvalId/resolve",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const actor = ensureSession(request);
      const params = approvalPathParamsSchema.parse(request.params);
      const parsed = resolveApprovalRequestSchema.parse(request.body);
      const result = await approvalService.resolveApproval(actor, params.approvalId, parsed);
      return reply.send(getApprovalResponseSchema.parse(result));
    },
  );

  app.get("/api/admin/mock-tickets", async (request, reply) => {
    const actor = ensureSession(request);
    const result = await ticketService.listTickets(actor);
    return reply.send(ticketListResponseSchema.parse(result));
  });

  app.get("/api/admin/mock-tickets/:ticketId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = ticketPathParamsSchema.parse(request.params);
    const result = await ticketService.getTicket(actor, params.ticketId);
    return reply.send(getTicketResponseSchema.parse(result));
  });

  app.get("/api/artifacts", async (request, reply) => {
    const actor = ensureSession(request);
    const result = await artifactService.listArtifacts(actor);
    return reply.send(artifactListResponseSchema.parse(result));
  });

  app.get("/api/artifacts/:artifactId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = artifactPathParamsSchema.parse(request.params);
    const result = await artifactService.getArtifact(actor, params.artifactId);
    return reply.send(getArtifactResponseSchema.parse(result));
  });

  app.post("/api/runtime/ticket-tools/lookup", async (request, reply) => {
    ensureRuntimeApi(request);
    const parsed = runtimeTicketLookupRequestSchema.parse(request.body);
    const result = await runtimeToolService.lookupTickets(parsed);
    return reply.send(runtimeTicketLookupResponseSchema.parse(result));
  });

  app.post("/api/runtime/ticket-tools/draft", async (request, reply) => {
    ensureRuntimeApi(request);
    const parsed = runtimeDraftTicketRequestSchema.parse(request.body);
    const result = await runtimeToolService.draftTicket(parsed);
    return reply.send(runtimeDraftTicketResponseSchema.parse(result));
  });

  app.post("/api/runtime/ticket-tools/create", async (request, reply) => {
    ensureRuntimeApi(request);
    const parsed = runtimeCreateTicketRequestSchema.parse(request.body);
    const result = await runtimeToolService.createTicket(parsed);
    return reply.send(runtimeCreateTicketResponseSchema.parse(result));
  });

  // ---------------------------------------------------------------------------
  // Follow-up runtime tool endpoints (T10)
  // ---------------------------------------------------------------------------

  app.post("/api/runtime/follow-up-tools/draft", async (request, reply) => {
    ensureRuntimeApi(request);

    const body = request.body as Record<string, unknown>;
    const runtimeSessionKey = typeof body.runtime_session_key === "string" ? body.runtime_session_key : "";
    const toolInvocationId = typeof body.tool_invocation_id === "string" ? body.tool_invocation_id : "";
    const draft = body.draft && typeof body.draft === "object" ? (body.draft as Record<string, unknown>) : {};

    if (!runtimeSessionKey || !toolInvocationId) {
      return reply.status(400).send({
        error: "Missing required fields: runtime_session_key, tool_invocation_id.",
      });
    }

    try {
      const draftInput: Record<string, string> = {};
      if (typeof draft.to === "string") draftInput.to = draft.to;
      if (typeof draft.subject === "string") draftInput.subject = draft.subject;
      if (typeof draft.body === "string") draftInput.body = draft.body;
      if (typeof draft.context_summary === "string") draftInput.context_summary = draft.context_summary;
      if (typeof draft.source_event_id === "string") draftInput.source_event_id = draft.source_event_id;

      const result = await runtimeToolService.draftFollowUp({
        runtime_session_key: runtimeSessionKey,
        tool_invocation_id: toolInvocationId,
        draft: draftInput,
      });
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("No active Clawback run")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post("/api/runtime/follow-up-tools/draft-recap", async (request, reply) => {
    ensureRuntimeApi(request);

    const body = request.body as Record<string, unknown>;
    const runtimeSessionKey = typeof body.runtime_session_key === "string" ? body.runtime_session_key : "";
    const toolInvocationId = typeof body.tool_invocation_id === "string" ? body.tool_invocation_id : "";
    const recap = body.recap && typeof body.recap === "object" ? (body.recap as Record<string, unknown>) : {};

    if (!runtimeSessionKey || !toolInvocationId) {
      return reply.status(400).send({
        error: "Missing required fields: runtime_session_key, tool_invocation_id.",
      });
    }

    try {
      const recapInput: Record<string, unknown> = {};
      if (typeof recap.to === "string") recapInput.to = recap.to;
      if (typeof recap.subject === "string") recapInput.subject = recap.subject;
      if (typeof recap.meeting_summary === "string") recapInput.meeting_summary = recap.meeting_summary;
      if (Array.isArray(recap.action_items)) recapInput.action_items = recap.action_items;
      if (Array.isArray(recap.decisions)) recapInput.decisions = recap.decisions;

      const result = await runtimeToolService.draftRecap({
        runtime_session_key: runtimeSessionKey,
        tool_invocation_id: toolInvocationId,
        recap: recapInput as { to?: string; subject?: string; meeting_summary?: string; action_items?: string[]; decisions?: string[] },
      });
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("No active Clawback run")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post("/api/runtime/follow-up-tools/request-send", async (request, reply) => {
    ensureRuntimeApi(request);

    const body = request.body as Record<string, unknown>;
    const runtimeSessionKey = typeof body.runtime_session_key === "string" ? body.runtime_session_key : "";
    const toolInvocationId = typeof body.tool_invocation_id === "string" ? body.tool_invocation_id : "";
    const sendRequest = body.send_request && typeof body.send_request === "object"
      ? (body.send_request as Record<string, unknown>)
      : {};

    if (!runtimeSessionKey || !toolInvocationId) {
      return reply.status(400).send({
        error: "Missing required fields: runtime_session_key, tool_invocation_id.",
      });
    }

    try {
      const result = await runtimeToolService.requestSend({
        runtime_session_key: runtimeSessionKey,
        tool_invocation_id: toolInvocationId,
        send_request: {
          work_item_id: typeof sendRequest.work_item_id === "string" ? sendRequest.work_item_id : "",
          to: typeof sendRequest.to === "string" ? sendRequest.to : "",
          subject: typeof sendRequest.subject === "string" ? sendRequest.subject : "",
          body: typeof sendRequest.body === "string" ? sendRequest.body : "",
        },
      });
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof Error && error.message.includes("No active Clawback run")) {
        return reply.status(404).send({ error: error.message });
      }
      throw error;
    }
  });

  app.post("/api/runtime/reviews/:id/approval-surfaces/whatsapp/resolve", async (request, reply) => {
    ensureRuntimeApi(request);

    const { id } = request.params as { id: string };
    const parsed = reviewSurfaceResolveRequestSchema.parse(request.body);

    const result = await reviewApprovalSurfaceService.resolveWhatsAppAction({
      approvalToken: parsed.approval_token,
      actorIdentity: parsed.actor_identity,
      rationale: parsed.rationale ?? null,
      interactionId: parsed.interaction_id ?? null,
    });

    if (result.review.id !== id) {
      return reply.status(400).send({
        error: "Approval token review does not match the route parameter.",
        code: "review_id_mismatch",
      });
    }

    return reply.send(reviewSurfaceResolveResponseSchema.parse({
      review: result.review,
      decision: result.decision,
      already_resolved: result.alreadyResolved,
    }));
  });

  // ---------------------------------------------------------------------------
  // WhatsApp webhook (W2)
  // ---------------------------------------------------------------------------

  const whatsappWebhookHandler = new WhatsAppWebhookHandler(
    {
      verifyToken: defaultWhatsAppVerifyToken,
      appSecret: defaultWhatsAppAppSecret || undefined,
    },
    reviewApprovalSurfaceService,
  );

  async function resolveWorkspaceWhatsAppTransport(workspaceId: string) {
    const connections = await runtimeConnectionService.listStored(workspaceId);
    const resolved = findWorkspaceWhatsAppConnection(connections, workspaceId);
    if (resolved) {
      if (resolved.config.transportMode === "openclaw_pairing") {
        return new OpenClawPairingTransportService({
          gatewayService: openClawGatewayService,
          accountId: resolved.config.pairedIdentityRef,
          consoleOrigin,
        });
      }

      return new WhatsAppTransportService({
        phoneNumberId: resolved.config.phoneNumberId,
        accessToken: resolved.config.accessToken,
      });
    }

    if (defaultWhatsAppPhoneNumberId && defaultWhatsAppAccessToken) {
      return new WhatsAppTransportService({
        phoneNumberId: defaultWhatsAppPhoneNumberId,
        accessToken: defaultWhatsAppAccessToken,
      });
    }

    return null;
  }

  async function hasConfiguredWhatsAppVerifyToken(verifyToken: string) {
    if (verifyToken === defaultWhatsAppVerifyToken) {
      return true;
    }

    const connections = await runtimeConnectionService.listAllStored();
    return Boolean(findWhatsAppConnectionByVerifyToken(connections, verifyToken));
  }

  // GET /api/webhooks/whatsapp — Meta webhook verification
  app.get("/api/webhooks/whatsapp", async (request, reply) => {
    const query = request.query as Record<string, string>;
    const mode = query["hub.mode"];
    const verifyToken = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (
      mode === "subscribe"
      && verifyToken
      && await hasConfiguredWhatsAppVerifyToken(verifyToken)
    ) {
      return reply.status(200).send(challenge ?? "");
    }

    return reply.status(403).send("Forbidden");
  });

  // POST /api/webhooks/whatsapp — Meta webhook callback
  app.post("/api/webhooks/whatsapp", {
    preParsing: (request, _reply, payload, done) => {
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];

      payload.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        passThrough.write(buffer);
      });
      payload.on("end", () => {
        request.whatsappRawBody = Buffer.concat(chunks);
        passThrough.end();
      });
      payload.on("error", (error) => {
        passThrough.destroy(error);
      });

      done(null, passThrough);
    },
  }, async (request, reply) => {
    if (!defaultWhatsAppAppSecret) {
      return reply.status(503).send({
        error:
          "WhatsApp webhook signing is not configured. Set WHATSAPP_APP_SECRET before enabling the public callback.",
        code: "whatsapp_webhook_signature_not_configured",
      });
    }

    const signature = request.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = request.whatsappRawBody;
    if (!rawBody) {
      return reply.status(500).send({
        error: "Raw webhook body was not captured for signature verification.",
        code: "webhook_raw_body_missing",
      });
    }
    if (!whatsappWebhookHandler.verifySignature(rawBody, signature)) {
      return reply.status(401).send({
        error: "Invalid webhook signature.",
        code: "webhook_signature_invalid",
      });
    }

    const payload = request.body as import("./integrations/whatsapp/types.js").WhatsAppWebhookPayload;
    const phoneNumberId = payload.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
    if (phoneNumberId) {
      const allConnections = await runtimeConnectionService.listAllStored();
      const resolvedConnection = findWhatsAppConnectionByPhoneNumberId(
        allConnections,
        phoneNumberId,
      );
      if (!resolvedConnection && phoneNumberId !== defaultWhatsAppPhoneNumberId) {
        return reply.send({
          processed: 0,
          skipped: 1,
          errors: 1,
        });
      }
    }

    const result = await whatsappWebhookHandler.processWebhook(payload);

    // Always return 200 to Meta to acknowledge receipt
    return reply.send({
      processed: result.processed,
      skipped: result.skipped,
      errors: result.errors.length,
    });
  });

  // POST /api/runtime/reviews/:id/approval-surfaces/whatsapp/notify
  // Triggers outbound WhatsApp approval prompt delivery
  app.post("/api/runtime/reviews/:id/approval-surfaces/whatsapp/notify", async (request, reply) => {
    ensureRuntimeApi(request);

    const { id } = request.params as { id: string };
    const workspaceId = (request.body as { workspace_id?: string })?.workspace_id ?? "";
    if (!workspaceId) {
      return reply.status(400).send({
        error: "workspace_id is required.",
        code: "missing_workspace_id",
      });
    }

    const whatsappTransportService = await resolveWorkspaceWhatsAppTransport(workspaceId);
    if (!whatsappTransportService) {
      return reply.status(501).send({
        error: "WhatsApp transport is not configured for this workspace.",
        code: "whatsapp_not_configured",
      });
    }

    const { review, recipients } =
      await reviewApprovalSurfaceService.buildWhatsAppApprovalActions(
        workspaceId,
        { reviewId: id },
      );

    if (recipients.length === 0) {
      return reply.send({
        review_id: review.id,
        sent: 0,
        failed: 0,
        errors: [],
        message: "No eligible WhatsApp recipients found for this review.",
      });
    }

    const result = await whatsappTransportService.sendApprovalPrompt(review, recipients);

    return reply.send({
      review_id: review.id,
      ...result,
    });
  });

  // ---------------------------------------------------------------------------
  // Slack webhook
  // ---------------------------------------------------------------------------

  async function resolveWorkspaceSlackTransport(workspaceId: string) {
    const connections = await runtimeConnectionService.listStored(workspaceId);
    const slackConnection = connections.find(
      (c) => c.provider === "slack" && c.status === "connected",
    );
    if (!slackConnection) {
      return null;
    }

    const config = normalizeSlackConfig(slackConnection.configJson);
    if (!config.botToken || !config.defaultChannel) {
      return null;
    }

    return {
      transport: new SlackTransportService({
        botToken: config.botToken,
        defaultChannel: config.defaultChannel,
      }),
      config,
    };
  }

  // POST /api/webhooks/slack/interactions — Slack interactive button callbacks
  app.post("/api/webhooks/slack/interactions", {
    preParsing: (request, _reply, payload, done) => {
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];

      payload.on("data", (chunk) => {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        chunks.push(buffer);
        passThrough.write(buffer);
      });
      payload.on("end", () => {
        request.slackRawBody = Buffer.concat(chunks);
        passThrough.end();
      });
      payload.on("error", (error) => {
        passThrough.destroy(error);
      });

      done(null, passThrough);
    },
  }, async (request, reply) => {
    const allConnections = await runtimeConnectionService.listAllStored();
    const slackConnections = allConnections.filter(
      (c) => c.provider === "slack" && c.status === "connected",
    );

    if (slackConnections.length === 0) {
      return reply.status(404).send({
        error: "No connected Slack integration found.",
        code: "slack_not_configured",
      });
    }

    const rawBody = request.slackRawBody;
    if (!rawBody) {
      return reply.status(500).send({
        error: "Raw webhook body was not captured for signature verification.",
        code: "webhook_raw_body_missing",
      });
    }

    const timestamp = request.headers["x-slack-request-timestamp"] as string | undefined;
    const signature = request.headers["x-slack-signature"] as string | undefined;

    const verifiableConnections = slackConnections
      .map((connection) => {
        const config = normalizeSlackConfig(connection.configJson);
        return {
          connection,
          signingSecret: config.signingSecret || defaultSlackSigningSecret,
        };
      })
      .filter((entry) => entry.signingSecret);

    if (verifiableConnections.length === 0) {
      return reply.status(500).send({
        error: "Slack signing secret is not configured.",
        code: "slack_signing_secret_missing",
      });
    }

    const matchedConnection = verifiableConnections.find((entry) => {
      const verifier = new SlackWebhookHandler(
        { signingSecret: entry.signingSecret },
        reviewApprovalSurfaceService,
      );
      return verifier.verifySignature(rawBody, timestamp, signature);
    });

    if (!matchedConnection) {
      return reply.status(401).send({
        error: "Invalid Slack webhook signature.",
        code: "webhook_signature_invalid",
      });
    }

    const webhookHandler = new SlackWebhookHandler(
      { signingSecret: matchedConnection.signingSecret },
      reviewApprovalSurfaceService,
    );

    try {
      const payload = SlackWebhookHandler.parseFormEncodedPayload(rawBody);
      const result = await webhookHandler.processInteraction(payload);

      // Slack expects a 200 response to acknowledge receipt
      return reply.send({
        processed: result.processed,
        skipped: result.skipped,
        errors: result.errors.length,
      });
    } catch (error) {
      return reply.status(400).send({
        error: error instanceof Error ? error.message : "Slack interaction payload is invalid.",
        code: "slack_payload_invalid",
      });
    }
  });

  // POST /api/runtime/reviews/:id/approval-surfaces/slack/notify
  // Triggers outbound Slack approval prompt delivery
  app.post("/api/runtime/reviews/:id/approval-surfaces/slack/notify", async (request, reply) => {
    ensureRuntimeApi(request);

    const { id } = request.params as { id: string };
    const workspaceId = (request.body as { workspace_id?: string })?.workspace_id ?? "";
    if (!workspaceId) {
      return reply.status(400).send({
        error: "workspace_id is required.",
        code: "missing_workspace_id",
      });
    }

    const resolved = await resolveWorkspaceSlackTransport(workspaceId);
    if (!resolved) {
      return reply.status(501).send({
        error: "Slack transport is not configured for this workspace.",
        code: "slack_not_configured",
      });
    }

    const { review, recipients } =
      await reviewApprovalSurfaceService.buildSlackApprovalActions(
        workspaceId,
        { reviewId: id },
      );

    if (recipients.length === 0) {
      return reply.send({
        review_id: review.id,
        sent: 0,
        failed: 0,
        errors: [],
        message: "No eligible Slack recipients found for this review.",
      });
    }

    const result = await resolved.transport.sendApprovalPrompt(review, recipients);

    return reply.send({
      review_id: review.id,
      ...result,
    });
  });

  // ---------------------------------------------------------------------------
  // n8n webhook callback
  // ---------------------------------------------------------------------------

  app.post("/api/webhooks/n8n/:workspaceId/:connectionId/callback", async (request, reply) => {
    const params = request.params as {
      workspaceId?: string;
      connectionId?: string;
    };

    if (!params.workspaceId || !params.connectionId) {
      return reply.status(400).send({
        error: "Missing required route parameters: workspaceId, connectionId.",
        code: "n8n_webhook_route_invalid",
      });
    }

    let connection;
    try {
      connection = await runtimeConnectionService.getStoredById(
        params.workspaceId,
        params.connectionId,
      );
    } catch (error) {
      if (error instanceof ConnectionNotFoundError) {
        return reply.status(404).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
    if (
      connection.provider !== "n8n"
      || connection.accessMode !== "write_capable"
      || connection.status !== "connected"
    ) {
      return reply.status(409).send({
        error: "n8n callback is only available for connected write-capable n8n backends.",
        code: "n8n_webhook_not_ready",
      });
    }

    const config = n8nConnectionConfigSchema.safeParse(connection.configJson ?? {});
    if (!config.success) {
      return reply.status(409).send({
        error: "n8n callback auth is not configured for this connection.",
        code: "n8n_webhook_not_ready",
      });
    }

    ensureWebhookToken(request, config.data.auth_token, {
      headerName: "x-clawback-webhook-token",
    });

    try {
      const result = await n8nWebhookCallbackService.recordCallback(params.workspaceId, {
        connectionId: params.connectionId,
        payload: request.body,
      });
      return reply.send(result);
    } catch (error) {
      if (error instanceof N8nWebhookCallbackError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
        });
      }
      throw error;
    }
  });

  // ---------------------------------------------------------------------------
  // Inbound email webhook (T8)
  // ---------------------------------------------------------------------------

  app.post("/api/inbound/email", async (request, reply) => {
    ensureRuntimeApi(request);

    const body = request.body as Record<string, unknown>;
    const payload = {
      message_id: typeof body.message_id === "string" ? body.message_id : "",
      from: typeof body.from === "string" ? body.from : "",
      to: typeof body.to === "string" ? body.to : "",
      subject: typeof body.subject === "string" ? body.subject : "",
      body_text: typeof body.body_text === "string" ? body.body_text : "",
      body_html: typeof body.body_html === "string" ? body.body_html : null,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    };

    if (!payload.message_id || !payload.from || !payload.to || !payload.subject) {
      return reply.status(400).send({
        error: "Missing required fields: message_id, from, to, subject.",
      });
    }

    try {
      const result = await inboundEmailService.processInboundEmail(payload);
      return reply.status(result.deduplicated ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof InboundEmailRoutingError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      if (error instanceof InboundEmailWorkerNotFoundError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      if (error instanceof InboundEmailWorkerRuntimeNotAvailableError) {
        return reply.status(409).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.post("/api/inbound/email/postmark", async (request, reply) => {
    ensureWebhookToken(request, inboundEmailWebhookToken, {
      headerName: "x-clawback-webhook-token",
    });

    try {
      const result = await inboundEmailService.processInboundEmail(
        parsePostmarkInboundEmail(request.body),
      );
      return reply.status(result.deduplicated ? 200 : 201).send({
        ...result,
        provider: "postmark",
      });
    } catch (error) {
      if (error instanceof InboundEmailWebhookParseError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      }
      if (error instanceof InboundEmailRoutingError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      if (error instanceof InboundEmailWorkerNotFoundError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      if (error instanceof InboundEmailWorkerRuntimeNotAvailableError) {
        return reply.status(409).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  // ---------------------------------------------------------------------------
  // Watched inbox webhook (T9/T13: shadow mode)
  // ---------------------------------------------------------------------------

  app.post("/api/inbound/watched-inbox", async (request, reply) => {
    ensureRuntimeApi(request);

    const body = request.body as Record<string, unknown>;
    const payload = {
      external_message_id: typeof body.external_message_id === "string" ? body.external_message_id : "",
      worker_id: typeof body.worker_id === "string" ? body.worker_id : "",
      workspace_id: typeof body.workspace_id === "string" ? body.workspace_id : "",
      from: typeof body.from === "string" ? body.from : "",
      subject: typeof body.subject === "string" ? body.subject : "",
      body_text: typeof body.body_text === "string" ? body.body_text : "",
      body_html: typeof body.body_html === "string" ? body.body_html : null,
      thread_summary: typeof body.thread_summary === "string" ? body.thread_summary : null,
    };

    if (!payload.external_message_id || !payload.worker_id || !payload.workspace_id || !payload.from || !payload.subject) {
      return reply.status(400).send({
        error: "Missing required fields: external_message_id, worker_id, workspace_id, from, subject.",
      });
    }

    try {
      const result = await watchedInboxService.processWatchedInboxEvent(payload);
      return reply.status(result.deduplicated ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof WatchedInboxRouteNotFoundError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      if (error instanceof WatchedInboxWorkerNotFoundError) {
        return reply.status(404).send({ error: error.message, code: error.code });
      }
      if (error instanceof WatchedInboxWorkerRuntimeNotAvailableError) {
        return reply.status(409).send({ error: error.message, code: error.code });
      }
      if (error instanceof GmailConnectionNotReadyError) {
        return reply.status(409).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.post("/api/inbound/gmail-watch/:workspaceId/:connectionId", async (request, reply) => {
    ensureWebhookToken(request, gmailWatchHookToken, {
      headerName: "x-gog-token",
      alternateHeaderNames: ["x-clawback-webhook-token"],
    });

    const params = request.params as {
      workspaceId?: string;
      connectionId?: string;
    };

    if (!params.workspaceId || !params.connectionId) {
      return reply.status(400).send({
        error: "Missing required route parameters: workspaceId, connectionId.",
      });
    }

    try {
      const connection = await connectionServiceInstance.getStoredById(
        params.workspaceId,
        params.connectionId,
      );
      const result = await gmailWatchHookService.processConnectionHook(connection, request.body);
      const allDeduplicated =
        result.created_results.length > 0
        && result.deduplicated_results === result.created_results.length;
      return reply.status(allDeduplicated ? 200 : 201).send(result);
    } catch (error) {
      if (error instanceof GmailWatchHookProcessingError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      }
      if (error instanceof WatchedInboxRouteNotFoundError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      }
      if (error instanceof WatchedInboxWorkerNotFoundError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      }
      if (error instanceof WatchedInboxWorkerRuntimeNotAvailableError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      }
      if (error instanceof GmailConnectionNotReadyError) {
        return reply.status(error.statusCode).send({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.get("/api/agents", async (request, reply) => {
    const actor = ensureSession(request);
    const result = await agentService.listAgents(actor);
    return reply.send(agentListResponseSchema.parse(result));
  });

  app.get("/api/connectors", async (request, reply) => {
    const actor = ensureSession(request);
    const result = await connectorService.listConnectors(actor);
    return reply.send(connectorListResponseSchema.parse(result));
  });

  app.post("/api/connectors", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const actor = ensureSession(request);
    const parsed = createConnectorRequestSchema.parse(request.body);
    const result = await connectorService.createConnector(actor, parsed);
    return reply.status(201).send(createConnectorResponseSchema.parse(result));
  });

  app.get("/api/connectors/:connectorId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = connectorPathParamsSchema.parse(request.params);
    const result = await connectorService.getConnector(actor, params.connectorId);
    return reply.send(getConnectorResponseSchema.parse(result));
  });

  app.patch(
    "/api/connectors/:connectorId",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const actor = ensureSession(request);
      const params = connectorPathParamsSchema.parse(request.params);
      const parsed = updateConnectorRequestSchema.parse(request.body);
      const result = await connectorService.updateConnector(actor, params.connectorId, parsed);
      return reply.send(getConnectorResponseSchema.parse(result));
    },
  );

  app.get("/api/connectors/:connectorId/sync-jobs", async (request, reply) => {
    const actor = ensureSession(request);
    const params = connectorPathParamsSchema.parse(request.params);
    const result = await connectorService.listSyncJobs(actor, params.connectorId);
    return reply.send(connectorSyncJobListResponseSchema.parse(result));
  });

  app.post(
    "/api/connectors/:connectorId/sync",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const actor = ensureSession(request);
      const params = connectorPathParamsSchema.parse(request.params);
      const result = await connectorService.requestSync(actor, params.connectorId);
      return reply.status(202).send(requestConnectorSyncResponseSchema.parse(result));
    },
  );

  app.post("/api/agents", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const actor = ensureSession(request);
    const parsed = createAgentRequestSchema.parse(request.body);
    const result = await agentService.createAgent(actor, parsed);
    return reply.status(201).send(createAgentResponseSchema.parse(result));
  });

  app.get("/api/agents/:agentId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = agentPathParamsSchema.parse(request.params);
    const result = await agentService.getAgent(actor, params.agentId);
    return reply.send(getAgentResponseSchema.parse(result));
  });

  app.patch("/api/agents/:agentId", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const actor = ensureSession(request);
    const params = agentPathParamsSchema.parse(request.params);
    const parsed = updateAgentRequestSchema.parse(request.body);
    const result = await agentService.updateAgent(actor, params.agentId, parsed);
    return reply.send(getAgentResponseSchema.parse(result));
  });

  app.get("/api/agents/:agentId/draft", async (request, reply) => {
    const actor = ensureSession(request);
    const params = agentPathParamsSchema.parse(request.params);
    const result = await agentService.getDraft(actor, params.agentId);
    return reply.send(getAgentDraftResponseSchema.parse(result));
  });

  app.patch(
    "/api/agents/:agentId/draft",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const actor = ensureSession(request);
      const params = agentPathParamsSchema.parse(request.params);
      const parsed = updateAgentDraftRequestSchema.parse(request.body);
      const result = await agentService.updateDraft(actor, params.agentId, parsed);
      return reply.send(getAgentDraftResponseSchema.parse(result));
    },
  );

  app.post(
    "/api/agents/:agentId/publish",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const actor = ensureSession(request);
      const params = agentPathParamsSchema.parse(request.params);
      const parsed = publishAgentRequestSchema.parse(request.body);
      const result = await agentService.publishAgent(actor, params.agentId, parsed);
      return reply.send(publishAgentResponseSchema.parse(result));
    },
  );

  app.get("/api/conversations", async (request, reply) => {
    const actor = ensureSession(request);
    const query = conversationListQuerySchema.parse(request.query ?? {});
    const result = await conversationRunService.listConversations(actor, query);
    return reply.send(conversationListResponseSchema.parse(result));
  });

  app.post("/api/conversations", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const actor = ensureSession(request);
    const parsed = createConversationRequestSchema.parse(request.body);
    const result = await conversationRunService.createConversation(actor, parsed);
    return reply.status(201).send(createConversationResponseSchema.parse(result));
  });

  app.get("/api/conversations/:conversationId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = conversationPathParamsSchema.parse(request.params);
    const result = await conversationRunService.getConversation(actor, params.conversationId);
    return reply.send(conversationDetailResponseSchema.parse(result));
  });

  app.post("/api/runs", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    const actor = ensureSession(request);
    const parsed = createRunRequestSchema.parse(request.body);
    const result = await conversationRunService.createRun(actor, parsed);
    return reply.status(201).send(createRunResponseSchema.parse(result));
  });

  app.get("/api/runs/:runId", async (request, reply) => {
    const actor = ensureSession(request);
    const params = runPathParamsSchema.parse(request.params);
    const result = await conversationRunService.getRun(actor, params.runId);
    return reply.send(getRunResponseSchema.parse(result));
  });

  app.get("/api/runs/:runId/events", async (request, reply) => {
    const actor = ensureSession(request);
    const params = runPathParamsSchema.parse(request.params);
    const events = await conversationRunService.listRunEvents(actor, params.runId);
    return reply.send(
      runEventListResponseSchema.parse({
        events,
      }),
    );
  });

  app.get("/api/runs/:runId/stream", async (request, reply) => {
    const actor = ensureSession(request);
    const params = runPathParamsSchema.parse(request.params);
    const context = await conversationRunService.getRunStreamContext(actor, params.runId);

    request.raw.setTimeout?.(0);
    request.raw.socket?.setKeepAlive?.(true, 15_000);

    reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.setHeader("X-Accel-Buffering", "no");
    reply.raw.flushHeaders?.();

    let closed = false;
    request.raw.on("close", () => {
      closed = true;
    });

    let lastSequence = 0;
    let keepaliveAt = Date.now();

    while (!closed) {
      const events = await conversationRunService.listRunEventsAfter(actor, params.runId, lastSequence);

      for (const event of events) {
        const envelope = mapRunEventToSseEnvelope({
          conversationId: context.conversationId,
          event,
        });
        const wrote = await writeSseEnvelope(reply.raw, envelope);
        if (!wrote) {
          closed = true;
          break;
        }
        lastSequence = event.sequence;
      }

      if (closed) {
        break;
      }

      if (Date.now() - keepaliveAt >= 15_000) {
        const keepalive = sseEnvelopeSchema.parse({
          type: "keepalive",
          run_id: params.runId,
          conversation_id: context.conversationId,
          sequence: lastSequence,
          data: {},
        });
        const wrote = await writeSseEnvelope(reply.raw, keepalive);
        if (!wrote) {
          closed = true;
          break;
        }
        keepaliveAt = Date.now();
      }

      const refreshedContext = await conversationRunService.getRunStreamContext(actor, params.runId);
      if (refreshedContext.terminal && events.length === 0) {
        break;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 250).unref();
      });
    }

    reply.raw.end();
    return reply;
  });

  // V1 workspace read-model routes
  await app.register(workspaceRoutesPlugin, {
    services: {
      ...workspaceReadModelServices,
      gmailPollingService: workspaceReadModelServices.gmailPollingService ?? gmailPollingService,
    },
  });
  gmailPollingService.start();

  return app;
}
