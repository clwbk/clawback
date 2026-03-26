import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import {
  actionCapabilityListResponseSchema,
  actionCapabilityRecordSchema,
  approvalSurfaceIdentityListResponseSchema,
  approvalSurfaceIdentityRecordSchema,
  boundaryModeSchema,
  createApprovalSurfaceIdentityRequestSchema,
  inputRouteListResponseSchema,
  updateApprovalSurfaceIdentityRequestSchema,
  workspacePeopleListResponseSchema,
} from "@clawback/contracts";
import type { SessionContext } from "@clawback/auth";

import type { ActionCapabilityService } from "./action-capabilities/index.js";
import type { ApprovalSurfaceIdentityService } from "./approval-surfaces/index.js";
import type { ConnectionService } from "./connections/index.js";
import type { InputRouteService } from "./input-routes/index.js";
import { lookupExecutor } from "./plugins/registry-lookup.js";
import type { WorkspacePeopleService } from "./workspace-people/index.js";

type WorkspaceGovernanceRoutesOptions = {
  ensureSession: (request: FastifyRequest) => SessionContext;
  ensureAdmin: (request: FastifyRequest) => SessionContext;
  connectionService: ConnectionService;
  inputRouteService: InputRouteService | undefined;
  actionCapabilityService: ActionCapabilityService | undefined;
  workspacePeopleService: WorkspacePeopleService | undefined;
  approvalSurfaceIdentityService: ApprovalSurfaceIdentityService | undefined;
};

function sendFeatureNotConfigured(reply: FastifyReply, error: string) {
  return reply.code(501).send({
    error,
    code: "feature_not_configured",
  });
}

export function registerWorkspaceGovernanceRoutes(
  app: FastifyInstance,
  options: WorkspaceGovernanceRoutesOptions,
) {
  const {
    ensureSession,
    ensureAdmin,
    connectionService,
    inputRouteService,
    actionCapabilityService,
    workspacePeopleService,
    approvalSurfaceIdentityService,
  } = options;

  app.get("/api/workspace/input-routes", async (request, reply) => {
    if (!inputRouteService) {
      return sendFeatureNotConfigured(reply, "Input routes read model is not configured.");
    }

    const session = ensureSession(request);
    const query = request.query as { worker_id?: string };
    const result = await inputRouteService.list(session.workspace.id);
    const inputRoutes = query.worker_id
      ? result.input_routes.filter((route) => route.worker_id === query.worker_id)
      : result.input_routes;

    return reply.send(inputRouteListResponseSchema.parse({ input_routes: inputRoutes }));
  });

  app.get("/api/workspace/action-capabilities", async (request, reply) => {
    if (!actionCapabilityService) {
      return sendFeatureNotConfigured(reply, "Action capability read model is not configured.");
    }

    const session = ensureSession(request);
    const query = request.query as { worker_id?: string };
    const result = await actionCapabilityService.list(session.workspace.id);
    const actionCapabilities = query.worker_id
      ? result.action_capabilities.filter((action) => action.worker_id === query.worker_id)
      : result.action_capabilities;

    return reply.send(
      actionCapabilityListResponseSchema.parse({
        action_capabilities: actionCapabilities,
      }),
    );
  });

  app.patch("/api/workspace/action-capabilities/:id", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!actionCapabilityService) {
      return sendFeatureNotConfigured(reply, "Action capability read model is not configured.");
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const body = request.body as {
      boundary_mode?: string;
      destination_connection_id?: string | null;
    };

    if (body.boundary_mode === undefined && body.destination_connection_id === undefined) {
      return reply.status(400).send({
        error: "Provide boundary_mode and/or destination_connection_id.",
        code: "missing_action_capability_update",
      });
    }

    const existing = (await actionCapabilityService.list(session.workspace.id))
      .action_capabilities
      .find((action) => action.id === id);
    if (!existing) {
      return reply.status(404).send({
        error: "Action capability not found.",
        code: "action_capability_not_found",
      });
    }

    let boundaryMode: typeof existing.boundary_mode | undefined;
    if (body.boundary_mode !== undefined) {
      const boundaryModeResult = boundaryModeSchema.safeParse(body.boundary_mode);
      if (!boundaryModeResult.success) {
        return reply.status(400).send({
          error: "Invalid boundary mode.",
          code: "invalid_boundary_mode",
        });
      }
      boundaryMode = boundaryModeResult.data;
    }

    let destinationConnectionId: string | null | undefined;
    if (body.destination_connection_id !== undefined) {
      destinationConnectionId = body.destination_connection_id;
      if (destinationConnectionId !== null) {
        const connection = await connectionService.getById(
          session.workspace.id,
          destinationConnectionId,
        );
        const executor = lookupExecutor(existing.kind);
        if (!executor) {
          return reply.status(400).send({
            error: `No registered executor supports ${existing.kind}.`,
            code: "action_executor_not_found",
          });
        }
        if (!executor.destinationProviders.includes(connection.provider)) {
          return reply.status(400).send({
            error: `Connection provider ${connection.provider} is not valid for ${existing.kind}.`,
            code: "invalid_destination_connection",
          });
        }
      }
    }

    const action = await actionCapabilityService.update(session.workspace.id, id, {
      ...(boundaryMode !== undefined ? { boundaryMode } : {}),
      ...(destinationConnectionId !== undefined ? { destinationConnectionId } : {}),
    });

    return reply.send(actionCapabilityRecordSchema.parse(action));
  });

  app.get("/api/workspace/people", async (request, reply) => {
    if (!workspacePeopleService) {
      return sendFeatureNotConfigured(reply, "Workspace people read model is not configured.");
    }

    const session = ensureSession(request);
    const result = await workspacePeopleService.list(session.workspace.id);
    return reply.send(workspacePeopleListResponseSchema.parse(result));
  });

  app.get("/api/workspace/approval-surfaces/identities", async (request, reply) => {
    if (!approvalSurfaceIdentityService) {
      return sendFeatureNotConfigured(reply, "Approval surface identity service is not configured.");
    }

    const session = ensureSession(request);
    const result = await approvalSurfaceIdentityService.list(session.workspace.id);
    return reply.send(approvalSurfaceIdentityListResponseSchema.parse(result));
  });

  app.post("/api/workspace/approval-surfaces/identities", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!approvalSurfaceIdentityService || !workspacePeopleService) {
      return sendFeatureNotConfigured(reply, "Approval surface identity service is not configured.");
    }

    const session = ensureAdmin(request);
    const parsed = createApprovalSurfaceIdentityRequestSchema.parse(request.body);
    const people = await workspacePeopleService.list(session.workspace.id);
    if (!people.people.some((person) => person.id === parsed.user_id)) {
      return reply.status(400).send({
        error: `Unknown workspace person: ${parsed.user_id}`,
        code: "invalid_person_id",
      });
    }

    const identity = await approvalSurfaceIdentityService.upsert(session.workspace.id, {
      channel: parsed.channel,
      userId: parsed.user_id,
      externalIdentity: parsed.external_identity,
      ...(parsed.label ? { label: parsed.label } : {}),
    });
    return reply.status(201).send(approvalSurfaceIdentityRecordSchema.parse(identity));
  });

  app.patch("/api/workspace/approval-surfaces/identities/:id", { onRequest: [app.csrfProtection] }, async (request, reply) => {
    if (!approvalSurfaceIdentityService) {
      return sendFeatureNotConfigured(reply, "Approval surface identity service is not configured.");
    }

    const session = ensureAdmin(request);
    const { id } = request.params as { id: string };
    const parsed = updateApprovalSurfaceIdentityRequestSchema.parse(request.body);

    const identity = await approvalSurfaceIdentityService.update(session.workspace.id, id, {
      ...(parsed.external_identity !== undefined ? { externalIdentity: parsed.external_identity } : {}),
      ...(parsed.label !== undefined ? { label: parsed.label } : {}),
      ...(parsed.status !== undefined ? { status: parsed.status } : {}),
    });
    return reply.send(approvalSurfaceIdentityRecordSchema.parse(identity));
  });
}
