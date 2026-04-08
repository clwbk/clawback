import type { FastifyInstance, FastifyRequest } from "fastify";

import {
  todayResponseSchema,
  workerListResponseSchema,
  workerRecordSchema,
  workItemListResponseSchema,
  workItemRecordSchema,
  inboxListResponseSchema,
  connectionListResponseSchema,
  registryResponseSchema,
  workerPackListResponseSchema,
  workerPackInstallResultSchema,
} from "@clawback/contracts";
import { AuthServiceError } from "@clawback/auth";
import type { SessionContext } from "@clawback/auth";

import type { InboundEmailServiceContract } from "./integrations/inbound-email/index.js";
import {
  InboundEmailRoutingError,
  InboundEmailWorkerRuntimeNotAvailableError,
} from "./integrations/inbound-email/index.js";
import { WorkerNotFoundError, type WorkerService } from "./workers/index.js";
import type { WorkItemService } from "./work-items/index.js";
import type { InboxItemService } from "./inbox/index.js";
import type { ReviewService } from "./reviews/index.js";
import { ReviewResolutionService } from "./reviews/index.js";
import { ExternalWorkflowReviewRequestService } from "./reviews/index.js";
import type { ReviewDecisionService } from "./reviews/index.js";
import type { ReviewedEmailSender } from "./reviews/index.js";
import type { ReviewedExternalWorkflowExecutor } from "./reviews/index.js";
import { RouteConfirmationService } from "./route-confirmation/index.js";
import type { ActivityService } from "./activity/index.js";
import type { ConnectionService } from "./connections/index.js";
import type { GmailPilotSetupService } from "./connections/index.js";
import type {
  DriveSetupService,
  DriveContextService,
} from "./connections/index.js";
import type { InputRouteService } from "./input-routes/index.js";
import type { ActionCapabilityService } from "./action-capabilities/index.js";
import type { WorkspacePeopleService } from "./workspace-people/index.js";
import type { ApprovalSurfaceIdentityService } from "./approval-surfaces/index.js";
import type {
  WorkerPackInstallService,
  WorkerPackContract,
} from "./worker-packs/index.js";
import type { ContactService } from "./contacts/index.js";
import type { AccountService } from "./accounts/index.js";
import type { GmailPollingServiceContract } from "./integrations/watched-inbox/index.js";
import { firstPartyRegistry } from "./plugins/registry.js";
import {
  isRegisteredProvider,
  lookupProvider,
} from "./plugins/registry-lookup.js";
import type { GitHubConnectionService } from "./integrations/github/index.js";
import type { WhatsAppSetupService } from "./integrations/whatsapp/index.js";
import type { SlackSetupService } from "./integrations/slack/index.js";
import { registerWorkspaceContactAccountRoutes } from "./workspace-contact-account-routes.js";
import { registerWorkspaceDriveRoutes } from "./workspace-drive-routes.js";
import { registerWorkspaceGmailRoutes } from "./workspace-gmail-routes.js";
import { registerWorkspaceGitHubRoutes } from "./workspace-github-routes.js";
import { registerWorkspaceGovernanceRoutes } from "./workspace-governance-routes.js";
import { registerWorkspaceN8nRoutes } from "./workspace-n8n-routes.js";
import { registerWorkspaceReviewRoutes } from "./workspace-review-routes.js";
import { registerWorkspaceSlackRoutes } from "./workspace-slack-routes.js";
import { registerWorkspaceSmtpRoutes } from "./workspace-smtp-routes.js";
import { registerWorkspaceWhatsAppRoutes } from "./workspace-whatsapp-routes.js";

// ---------------------------------------------------------------------------
// Service contract interfaces (so this module is testable with fakes)
// ---------------------------------------------------------------------------

export interface WorkspaceReadModelServices {
  workerService: WorkerService;
  workItemService: WorkItemService;
  inboxItemService: InboxItemService;
  reviewService: ReviewService;
  inboundEmailService?: InboundEmailServiceContract;
  reviewDecisionService?: ReviewDecisionService;
  activityService: ActivityService;
  connectionService: ConnectionService;
  gmailPilotSetupService?: GmailPilotSetupService;
  gmailPollingService?: GmailPollingServiceContract;
  driveSetupService?: DriveSetupService;
  driveContextService?: DriveContextService;
  githubConnectionService?: GitHubConnectionService;
  whatsappSetupService?: WhatsAppSetupService;
  slackSetupService?: SlackSetupService;
  inputRouteService?: InputRouteService;
  actionCapabilityService?: ActionCapabilityService;
  workspacePeopleService?: WorkspacePeopleService;
  approvalSurfaceIdentityService?: ApprovalSurfaceIdentityService;
  reviewedEmailSender?: ReviewedEmailSender;
  reviewedExternalWorkflowExecutor?: ReviewedExternalWorkflowExecutor;
  workerPackInstallService?: WorkerPackInstallService;
  workerPacks?: WorkerPackContract[];
  contactService?: ContactService;
  accountService?: AccountService;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export async function workspaceRoutesPlugin(
  app: FastifyInstance,
  options: { services: WorkspaceReadModelServices },
) {
  const {
    workerService,
    workItemService,
    inboxItemService,
    reviewService,
    inboundEmailService,
    reviewDecisionService,
    activityService,
    connectionService,
    gmailPilotSetupService,
    gmailPollingService,
    driveSetupService,
    driveContextService,
    githubConnectionService,
    whatsappSetupService,
    slackSetupService,
    inputRouteService,
    actionCapabilityService,
    workspacePeopleService,
    approvalSurfaceIdentityService,
    reviewedEmailSender,
    reviewedExternalWorkflowExecutor,
    workerPackInstallService,
    workerPacks,
    contactService,
    accountService,
  } = options.services;
  const reviewResolutionService = new ReviewResolutionService({
    reviewService,
    workItemService,
    inboxItemService,
    activityService,
    workerService,
    ...(actionCapabilityService ? { actionCapabilityService } : {}),
    ...(connectionService ? { connectionService } : {}),
    ...(reviewedEmailSender ? { reviewedEmailSender } : {}),
    ...(reviewedExternalWorkflowExecutor
      ? { reviewedExternalWorkflowExecutor }
      : {}),
    ...(reviewDecisionService ? { reviewDecisionService } : {}),
  });
  const externalWorkflowReviewRequestService =
    actionCapabilityService && connectionService
      ? new ExternalWorkflowReviewRequestService({
          workItemService,
          reviewService,
          inboxItemService,
          activityService,
          actionCapabilityService,
          connectionService,
        })
      : null;
  const routeConfirmationService = new RouteConfirmationService({
    inboxItemService,
    workItemService,
    activityService,
    workerService,
  });

  function ensureSession(request: FastifyRequest): SessionContext {
    if (!request.authContext) {
      throw new AuthServiceError({
        code: "unauthorized",
        message: "Authentication is required.",
        statusCode: 401,
      });
    }
    return request.authContext;
  }

  function ensureAdmin(request: FastifyRequest): SessionContext {
    const session = ensureSession(request);
    if (session.membership.role !== "admin") {
      throw new AuthServiceError({
        code: "forbidden",
        message: "Workspace admin access is required.",
        statusCode: 403,
      });
    }
    return session;
  }

  function ensureReviewActor(
    session: SessionContext,
    review: { reviewer_ids: string[]; assignee_ids: string[] },
  ) {
    if (
      session.membership.role === "admin" ||
      review.reviewer_ids.includes(session.user.id) ||
      review.assignee_ids.includes(session.user.id)
    ) {
      return;
    }

    throw new AuthServiceError({
      code: "forbidden",
      message: "You do not have access to resolve this review.",
      statusCode: 403,
    });
  }

  function ensureInboxActor(
    session: SessionContext,
    inboxItem: { assignee_ids: string[] },
  ) {
    if (
      session.membership.role === "admin" ||
      inboxItem.assignee_ids.includes(session.user.id)
    ) {
      return;
    }

    throw new AuthServiceError({
      code: "forbidden",
      message: "You do not have access to confirm this route suggestion.",
      statusCode: 403,
    });
  }

  function ensureWorkActor(
    session: SessionContext,
    workItem: { assignee_ids: string[]; reviewer_ids: string[] },
  ) {
    if (
      session.membership.role === "admin" ||
      workItem.assignee_ids.includes(session.user.id) ||
      workItem.reviewer_ids.includes(session.user.id)
    ) {
      return;
    }

    throw new AuthServiceError({
      code: "forbidden",
      message: "You do not have access to request this reviewed action.",
      statusCode: 403,
    });
  }

  function buildSampleForwardEmailPayload(toAddress: string) {
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      message_id: `<demo-forward-${nonce}@clawback.local>`,
      from: "sarah@acmecorp.com",
      to: toAddress,
      subject: "Re: Q3 renewal discussion",
      body_text:
        "Hi there, just following up on our renewal discussion. Could we lock a time next week to finalize terms?",
      body_html:
        "<p>Hi there, just following up on our renewal discussion. Could we lock a time next week to finalize terms?</p>",
      attachments: [],
    };
  }

  async function syncWorkerConnectionAssignments(
    workspaceId: string,
    connectionId: string,
    nextAttachedWorkerIds: string[],
  ) {
    const workers = await workerService.list(workspaceId);
    const workerMap = new Map(
      workers.workers.map((worker) => [worker.id, worker]),
    );
    const currentAttachedWorkerIds = workers.workers
      .filter((worker) => worker.connection_ids.includes(connectionId))
      .map((worker) => worker.id);
    const affectedWorkerIds = Array.from(
      new Set([...currentAttachedWorkerIds, ...nextAttachedWorkerIds]),
    );

    for (const workerId of affectedWorkerIds) {
      const worker = workerMap.get(workerId);
      if (!worker) continue;

      const nextConnectionIds = nextAttachedWorkerIds.includes(workerId)
        ? Array.from(new Set([...worker.connection_ids, connectionId]))
        : worker.connection_ids.filter((id) => id !== connectionId);

      const changed =
        JSON.stringify(nextConnectionIds) !==
        JSON.stringify(worker.connection_ids);
      if (!changed) continue;

      await workerService.update(workspaceId, workerId, {
        connectionIds: nextConnectionIds,
      });
    }
  }

  function isReadOnlyGmailConnection(connection: {
    provider: string;
    access_mode: string;
  }) {
    return (
      connection.provider === "gmail" && connection.access_mode === "read_only"
    );
  }

  async function syncGmailWatchedInboxStatus(
    workspaceId: string,
    workerIds: string[],
    status: "active" | "suggested",
  ) {
    if (!inputRouteService || workerIds.length === 0) {
      return;
    }

    await inputRouteService.syncWatchedInboxStatusForWorkers(
      workspaceId,
      workerIds,
      status,
    );
  }

  async function listInvalidWatchedInboxAttachmentIds(
    workspaceId: string,
    nextAttachedWorkerIds: string[],
  ) {
    if (!inputRouteService || nextAttachedWorkerIds.length === 0) {
      return [];
    }

    const routes = await inputRouteService.list(workspaceId);
    const watchedInboxWorkerIds = new Set(
      routes.input_routes
        .filter((route) => route.kind === "watched_inbox")
        .map((route) => route.worker_id),
    );

    return nextAttachedWorkerIds.filter(
      (workerId) => !watchedInboxWorkerIds.has(workerId),
    );
  }

  async function ensureGmailConnectionConfigured(
    workspaceId: string,
    connectionId: string,
    connection: { provider: string; access_mode: string },
  ) {
    if (!gmailPilotSetupService || !isReadOnlyGmailConnection(connection)) {
      return true;
    }

    const setup = await gmailPilotSetupService.getSummary(
      workspaceId,
      connectionId,
    );
    return setup.configured;
  }

  // -------------------------------------------------------------------------
  // GET /api/workspace/today
  // -------------------------------------------------------------------------

  app.get("/api/workspace/today", async (request, reply) => {
    const session = ensureSession(request);
    const workspaceId = session.workspace.id;
    const userId = session.user.id;

    const [
      workersResult,
      workItemsResult,
      inboxResult,
      activityResult,
      activeConnections,
    ] = await Promise.all([
      workerService.list(workspaceId),
      workItemService.listByWorkspace(workspaceId),
      inboxItemService.list(workspaceId),
      activityService.list(workspaceId, 20),
      connectionService.countActive(workspaceId),
    ]);

    const allWorkers = workersResult.workers;
    const allWorkItems = workItemsResult.work_items;
    const allInboxItems = inboxResult.items;

    // for_you: open inbox items assigned to the current user
    const forYou = allInboxItems.filter(
      (item) => item.state === "open" && item.assignee_ids.includes(userId),
    );

    // team: all work items (visible to the workspace)
    const team = allWorkItems;

    // worker_snapshots
    const workerSnapshots = allWorkers.map((w) => ({
      id: w.id,
      name: w.name,
      kind: w.kind,
      open_inbox_count: allInboxItems.filter(
        (i) => i.worker_id === w.id && i.state === "open",
      ).length,
      recent_work_count: allWorkItems.filter((wi) => wi.worker_id === w.id)
        .length,
    }));

    // stats
    const stats = {
      inbox_waiting: allInboxItems.filter((i) => i.state === "open").length,
      team_items_today: allWorkItems.length,
      workers_active: allWorkers.filter((w) => w.status === "active").length,
      connections_active: activeConnections,
    };

    const payload = todayResponseSchema.parse({
      viewer: {
        user_id: userId,
        display_name: session.user.displayName,
        role: session.membership.role,
      },
      stats,
      for_you: forYou,
      team,
      worker_snapshots: workerSnapshots,
      recent_work: allWorkItems,
    });

    return reply.send(payload);
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/workers
  // -------------------------------------------------------------------------

  app.get("/api/workspace/workers", async (request, reply) => {
    const session = ensureSession(request);
    const result = await workerService.list(session.workspace.id);
    return reply.send(workerListResponseSchema.parse(result));
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/workers/:id
  // -------------------------------------------------------------------------

  app.get("/api/workspace/workers/:id", async (request, reply) => {
    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const worker = await workerService.getById(session.workspace.id, id);
    return reply.send(workerRecordSchema.parse(worker));
  });

  // -------------------------------------------------------------------------
  // PATCH /api/workspace/workers/:id
  // -------------------------------------------------------------------------

  app.patch(
    "/api/workspace/workers/:id",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const session = ensureAdmin(request);
      const { id } = request.params as { id: string };
      const body = request.body as {
        name?: string;
        status?: string;
        member_ids?: string[];
        assignee_ids?: string[];
        reviewer_ids?: string[];
      };

      const updateInput: Record<string, unknown> = {};
      if (body.name !== undefined) updateInput.name = body.name;
      if (body.status !== undefined) {
        if (
          body.status !== "draft" &&
          body.status !== "active" &&
          body.status !== "paused"
        ) {
          return reply.status(400).send({
            error: "Invalid status. Must be 'draft', 'active', or 'paused'.",
            code: "invalid_status",
          });
        }
        updateInput.status = body.status;
      }
      if (body.member_ids !== undefined)
        updateInput.memberIds = body.member_ids;
      if (body.assignee_ids !== undefined)
        updateInput.assigneeIds = body.assignee_ids;
      if (body.reviewer_ids !== undefined)
        updateInput.reviewerIds = body.reviewer_ids;

      const requestedPeopleIds = new Set([
        ...(body.member_ids ?? []),
        ...(body.assignee_ids ?? []),
        ...(body.reviewer_ids ?? []),
      ]);
      if (requestedPeopleIds.size > 0) {
        if (!workspacePeopleService) {
          return reply.code(501).send({
            error: "Workspace people service is not configured.",
            code: "feature_not_configured",
          });
        }

        const people = await workspacePeopleService.list(session.workspace.id);
        const validIds = new Set(people.people.map((person) => person.id));
        const invalidIds = Array.from(requestedPeopleIds).filter(
          (personId) => !validIds.has(personId),
        );
        if (invalidIds.length > 0) {
          return reply.status(400).send({
            error: `Unknown workspace people: ${invalidIds.join(", ")}`,
            code: "invalid_person_ids",
          });
        }
      }

      const worker = await workerService.update(
        session.workspace.id,
        id,
        updateInput,
      );
      return reply.send(workerRecordSchema.parse(worker));
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/workspace/workers/:id/demo/forward-email
  // -------------------------------------------------------------------------

  app.post(
    "/api/workspace/workers/:id/demo/forward-email",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      if (!inboundEmailService || !inputRouteService) {
        return reply.code(501).send({
          error:
            "Demo forwarded email is not configured on this control plane.",
          code: "feature_not_configured",
        });
      }

      const session = ensureAdmin(request);
      const { id } = request.params as { id: string };
      let worker: Awaited<ReturnType<WorkerService["getById"]>>;

      try {
        worker = await workerService.getById(session.workspace.id, id);
      } catch (error) {
        if (error instanceof WorkerNotFoundError) {
          return reply.status(404).send({
            error: error.message,
            code: error.code,
          });
        }
        throw error;
      }

      if (worker.status !== "active") {
        return reply.status(409).send({
          error: "This worker must be active before it can receive demo traffic.",
          code: "demo_worker_not_active",
        });
      }

      const routes = await inputRouteService.list(session.workspace.id);
      const forwardRoute = routes.input_routes.find(
        (route) =>
          route.worker_id === id &&
          route.kind === "forward_email" &&
          route.status === "active" &&
          Boolean(route.address),
      );

      if (!forwardRoute?.address) {
        return reply.status(409).send({
          error:
            "This worker does not have an active forward-email route ready for demo traffic.",
          code: "demo_forward_email_not_ready",
        });
      }

      const payload = buildSampleForwardEmailPayload(forwardRoute.address);

      try {
        const result = await inboundEmailService.processInboundEmail(payload);
        return reply.status(result.deduplicated ? 200 : 201).send({
          scenario: "forward_email_sample",
          worker_id: id,
          route_id: forwardRoute.id,
          subject: payload.subject,
          deduplicated: result.deduplicated,
          source_event_id: result.source_event_id,
          work_item_id: result.work_item_id,
          inbox_item_id: result.inbox_item_id,
          review_id: result.review_id,
        });
      } catch (error) {
        if (error instanceof InboundEmailRoutingError) {
          return reply
            .status(404)
            .send({ error: error.message, code: error.code });
        }
        if (error instanceof InboundEmailWorkerRuntimeNotAvailableError) {
          return reply
            .status(409)
            .send({ error: error.message, code: error.code });
        }
        throw error;
      }
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/workspace/worker-packs
  // -------------------------------------------------------------------------

  app.get("/api/workspace/worker-packs", async (request, reply) => {
    ensureSession(request);
    const packs = workerPacks ?? [];
    const response = workerPackListResponseSchema.parse({
      packs: packs.map((pack) => {
        return {
          id: pack.manifest.workerPackId,
          name: pack.manifest.displayName,
          kind: pack.manifest.workerKind,
          summary: pack.install.summary,
          default_scope: pack.manifest.defaultScope,
          stability: pack.manifest.stability,
          category: pack.manifest.category,
          priority: pack.manifest.priority,
          supported_input_routes: pack.install.supportedInputRoutes.map(
            (r) => ({
              kind: r.kind,
              label: r.label,
              description: r.description,
              capability_note: r.capabilityNote ?? null,
            }),
          ),
          action_capabilities: pack.install.actionCapabilities.map((a) => ({
            kind: a.kind,
            default_boundary_mode: a.defaultBoundaryMode,
          })),
        };
      }),
    });
    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/registry
  // -------------------------------------------------------------------------

  app.get("/api/workspace/registry", async (request, reply) => {
    ensureSession(request);
    const response = registryResponseSchema.parse({
      connection_providers: firstPartyRegistry.connectionProviders.map((p) => ({
        id: p.id,
        display_name: p.displayName,
        description: p.description,
        provider: p.provider,
        access_modes: p.accessModes,
        capabilities: p.capabilities,
        stability: p.stability,
        category: p.category,
        priority: p.priority,
        setup_steps: p.setupSteps,
      })),
      ingress_adapters: firstPartyRegistry.ingressAdapters.map((a) => ({
        id: a.id,
        display_name: a.displayName,
        description: a.description,
        provider: a.provider,
        adapter_kind: a.adapterKind,
        stability: a.stability,
        category: a.category,
        priority: a.priority,
        setup_steps: a.setupSteps,
      })),
      action_executors: firstPartyRegistry.actionExecutors.map((e) => ({
        id: e.id,
        display_name: e.displayName,
        description: e.description,
        action_kind: e.actionKind,
        stability: e.stability,
        category: e.category,
        priority: e.priority,
        setup_steps: e.setupSteps,
      })),
      worker_packs: firstPartyRegistry.workerPacks.map((w) => ({
        id: w.id,
        display_name: w.displayName,
        description: w.description,
        worker_pack_id: w.workerPackId,
        worker_kind: w.workerKind,
        stability: w.stability,
        category: w.category,
        priority: w.priority,
        supported_input_route_kinds: w.supportedInputRouteKinds,
        action_kinds: w.actionKinds,
        setup_steps: w.setupSteps,
      })),
    });
    return reply.send(response);
  });

  // -------------------------------------------------------------------------
  // POST /api/workspace/workers/install
  // -------------------------------------------------------------------------

  app.post(
    "/api/workspace/workers/install",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      if (!workerPackInstallService || !workerPacks) {
        return reply.code(501).send({
          error: "Worker pack install service is not configured.",
          code: "feature_not_configured",
        });
      }

      const session = ensureAdmin(request);
      const body = request.body as { pack_id: string; name?: string };

      if (!body.pack_id) {
        return reply.status(400).send({
          error: "pack_id is required.",
          code: "missing_pack_id",
        });
      }

      const pack = workerPacks.find(
        (p) => p.manifest.workerPackId === body.pack_id,
      );
      if (!pack) {
        return reply.status(404).send({
          error: `Worker pack not found: ${body.pack_id}`,
          code: "pack_not_found",
        });
      }

      // Validate against the registry manifests
      if (pack.manifest.stability === "experimental") {
        return reply.status(400).send({
          error: `Worker pack "${pack.manifest.displayName}" is not yet available for installation.`,
          code: "pack_not_available",
        });
      }

      const result = await workerPackInstallService.install(pack, {
        workspaceId: session.workspace.id,
        workspaceSlug: session.workspace.slug,
        ...(body.name ? { nameOverride: body.name } : {}),
      });

      return reply.status(201).send(
        workerPackInstallResultSchema.parse({
          worker_id: result.workerId,
          input_route_ids: result.inputRouteIds,
          action_capability_ids: result.actionCapabilityIds,
        }),
      );
    },
  );

  // -------------------------------------------------------------------------
  // GET /api/workspace/inbox
  // -------------------------------------------------------------------------

  app.get("/api/workspace/inbox", async (request, reply) => {
    const session = ensureSession(request);
    const query = request.query as { assignee?: string };
    const result = await inboxItemService.list(session.workspace.id);

    // Keep inbox routes thin: execution state here is a synced operator projection.
    let items = result.items;
    if (query.assignee) {
      items = items.filter((item) =>
        item.assignee_ids.includes(query.assignee!),
      );
    }

    return reply.send(inboxListResponseSchema.parse({ items }));
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/work
  // -------------------------------------------------------------------------

  app.get("/api/workspace/work", async (request, reply) => {
    const session = ensureSession(request);
    const query = request.query as { kind?: string; worker_id?: string };

    // Scope to the authenticated workspace first; expose the authoritative work-item read model directly.
    const result = await workItemService.listByWorkspace(session.workspace.id);
    let workItems = result.work_items;
    if (query.worker_id) {
      workItems = workItems.filter(
        (item) => item.worker_id === query.worker_id,
      );
    }
    if (query.kind) {
      workItems = workItems.filter((item) => item.kind === query.kind);
    }

    return reply.send(
      workItemListResponseSchema.parse({ work_items: workItems }),
    );
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/work/:id
  // -------------------------------------------------------------------------

  app.get("/api/workspace/work/:id", async (request, reply) => {
    const session = ensureSession(request);
    const { id } = request.params as { id: string };
    const workItem = await workItemService.getById(session.workspace.id, id);
    return reply.send(workItemRecordSchema.parse(workItem));
  });

  // -------------------------------------------------------------------------
  // GET /api/workspace/connections
  // -------------------------------------------------------------------------

  app.get("/api/workspace/connections", async (request, reply) => {
    const session = ensureSession(request);
    const result = await connectionService.list(session.workspace.id);
    return reply.send(connectionListResponseSchema.parse(result));
  });

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/bootstrap
  // -------------------------------------------------------------------------

  app.post(
    "/api/workspace/connections/bootstrap",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const session = ensureAdmin(request);
      const body = request.body as { provider?: string; access_mode?: string };

      const provider = typeof body.provider === "string" ? body.provider : null;
      const accessMode =
        typeof body.access_mode === "string" ? body.access_mode : null;

      if (!provider || !accessMode) {
        return reply.status(400).send({
          error: "provider and access_mode are required.",
          code: "missing_connection_bootstrap_fields",
        });
      }

      if (!isRegisteredProvider(provider)) {
        return reply.status(404).send({
          error: `Unknown connection provider: ${provider}`,
          code: "provider_not_found",
        });
      }

      const manifest = lookupProvider(provider);
      if (!manifest) {
        return reply.status(404).send({
          error: `Connection provider manifest not found: ${provider}`,
          code: "provider_manifest_not_found",
        });
      }

      if (
        !manifest.accessModes.includes(
          accessMode as "read_only" | "write_capable",
        )
      ) {
        return reply.status(400).send({
          error: `Access mode ${accessMode} is not supported for provider ${provider}.`,
          code: "unsupported_access_mode",
        });
      }

      if (manifest.stability === "experimental") {
        return reply.status(400).send({
          error: `${manifest.displayName} is not available for setup yet.`,
          code: "provider_not_available",
        });
      }

      const existing = (
        await connectionService.listStored(session.workspace.id)
      ).find(
        (connection) =>
          connection.provider === provider &&
          connection.accessMode === accessMode,
      );
      if (existing) {
        const result = await connectionService.getById(
          session.workspace.id,
          existing.id,
        );
        return reply.send(result);
      }

      const connection = await connectionService.create(session.workspace.id, {
        provider: provider as Parameters<
          typeof connectionService.create
        >[1]["provider"],
        accessMode: accessMode as Parameters<
          typeof connectionService.create
        >[1]["accessMode"],
        label: manifest.displayName,
        capabilities: manifest.capabilities,
      });

      return reply.status(201).send(connection);
    },
  );

  registerWorkspaceGovernanceRoutes(app, {
    ensureSession,
    ensureAdmin,
    connectionService,
    inputRouteService,
    actionCapabilityService,
    workspacePeopleService,
    approvalSurfaceIdentityService,
  });

  registerWorkspaceGmailRoutes(app, {
    ensureSession,
    ensureAdmin,
    gmailPilotSetupService,
    gmailPollingService,
    connectionService,
    inputRouteService,
  });

  registerWorkspaceSmtpRoutes(app, {
    ensureSession,
    ensureAdmin,
    connectionService,
  });

  registerWorkspaceDriveRoutes(app, {
    ensureSession,
    ensureAdmin,
    driveSetupService,
    driveContextService,
  });

  registerWorkspaceGitHubRoutes(app, {
    ensureSession,
    ensureAdmin,
    githubConnectionService,
  });

  registerWorkspaceWhatsAppRoutes(app, {
    ensureSession,
    ensureAdmin,
    whatsappSetupService,
  });

  // -------------------------------------------------------------------------
  // PATCH /api/workspace/connections/:id/attached-workers
  // -------------------------------------------------------------------------

  app.patch(
    "/api/workspace/connections/:id/attached-workers",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const session = ensureAdmin(request);
      const { id } = request.params as { id: string };
      const body = request.body as { attached_worker_ids?: string[] };
      const nextAttachedWorkerIds = body.attached_worker_ids ?? [];

      const connection = await connectionService.getById(
        session.workspace.id,
        id,
      );
      const workers = await workerService.list(session.workspace.id);
      const validWorkerIds = new Set(
        workers.workers.map((worker) => worker.id),
      );
      const invalidWorkerIds = nextAttachedWorkerIds.filter(
        (workerId) => !validWorkerIds.has(workerId),
      );
      if (invalidWorkerIds.length > 0) {
        return reply.status(400).send({
          error: `Unknown workers: ${invalidWorkerIds.join(", ")}`,
          code: "invalid_worker_ids",
        });
      }

      if (isReadOnlyGmailConnection(connection)) {
        const invalidAttachmentIds = await listInvalidWatchedInboxAttachmentIds(
          session.workspace.id,
          nextAttachedWorkerIds,
        );
        if (invalidAttachmentIds.length > 0) {
          return reply.status(400).send({
            error: `Workers are missing a watched inbox route: ${invalidAttachmentIds.join(", ")}`,
            code: "missing_watched_inbox_route",
          });
        }
      }

      const updated = await connectionService.update(session.workspace.id, id, {
        attachedWorkerIds: nextAttachedWorkerIds,
      });
      await syncWorkerConnectionAssignments(
        session.workspace.id,
        id,
        nextAttachedWorkerIds,
      );

      if (isReadOnlyGmailConnection(connection)) {
        const previousAttachedWorkerIds = connection.attached_worker_ids;
        const removedWorkerIds = previousAttachedWorkerIds.filter(
          (workerId) => !nextAttachedWorkerIds.includes(workerId),
        );
        const addedWorkerIds = nextAttachedWorkerIds.filter(
          (workerId) => !previousAttachedWorkerIds.includes(workerId),
        );

        await syncGmailWatchedInboxStatus(
          session.workspace.id,
          removedWorkerIds,
          "suggested",
        );

        if (addedWorkerIds.length > 0) {
          await syncGmailWatchedInboxStatus(
            session.workspace.id,
            addedWorkerIds,
            updated.status === "connected" ? "active" : "suggested",
          );
        }
      }

      return reply.send(updated);
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/:id/connect (A1: Gmail connection state)
  // -------------------------------------------------------------------------

  app.post(
    "/api/workspace/connections/:id/connect",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const session = ensureAdmin(request);
      const { id } = request.params as { id: string };

      const connection = await connectionService.getById(
        session.workspace.id,
        id,
      );
      const gmailReady = await ensureGmailConnectionConfigured(
        session.workspace.id,
        id,
        connection,
      );
      if (!gmailReady) {
        return reply.status(400).send({
          error: "Configure Gmail read-only before connecting it.",
          code: "gmail_not_configured",
        });
      }
      if (connection.status === "connected") {
        // Already connected — idempotent
        return reply.send(connection);
      }

      const updated = await connectionService.update(session.workspace.id, id, {
        status: "connected",
      });

      if (isReadOnlyGmailConnection(updated)) {
        await syncGmailWatchedInboxStatus(
          session.workspace.id,
          updated.attached_worker_ids,
          "active",
        );
      }

      return reply.status(200).send(updated);
    },
  );

  // -------------------------------------------------------------------------
  // POST /api/workspace/connections/:id/disconnect
  // -------------------------------------------------------------------------

  app.post(
    "/api/workspace/connections/:id/disconnect",
    { onRequest: [app.csrfProtection] },
    async (request, reply) => {
      const session = ensureAdmin(request);
      const { id } = request.params as { id: string };

      const connection = await connectionService.getById(
        session.workspace.id,
        id,
      );
      if (connection.status === "not_connected") {
        return reply.send(connection);
      }

      const updated = await connectionService.update(session.workspace.id, id, {
        status: "not_connected",
      });

      if (isReadOnlyGmailConnection(updated)) {
        await syncGmailWatchedInboxStatus(
          session.workspace.id,
          updated.attached_worker_ids,
          "suggested",
        );
      }

      return reply.status(200).send(updated);
    },
  );

  registerWorkspaceReviewRoutes(app, {
    ensureSession,
    ensureReviewActor,
    ensureInboxActor,
    ensureWorkActor,
    activityService,
    inboxItemService,
    reviewService,
    reviewResolutionService,
    routeConfirmationService,
    workItemService,
    externalWorkflowReviewRequestService,
  });

  registerWorkspaceN8nRoutes(app, {
    ensureSession,
    ensureAdmin,
    connectionService,
  });

  registerWorkspaceSlackRoutes(app, {
    ensureSession,
    ensureAdmin,
    slackSetupService,
  });

  registerWorkspaceContactAccountRoutes(app, {
    ensureSession,
    contactService,
    accountService,
  });
}
